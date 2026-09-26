# Auditoria de segurança — 26/09/2026

Revisão de toda a aplicação: API, app das pessoas, painel, infraestrutura,
dependências e tratamento de dado pessoal. Cada achado foi conferido no código
ou testado contra o sistema rodando — nada aqui é impressão.

**Resultado:** 4 achados corrigidos nesta sessão (1 alto, 2 médios, 1 funcional
com efeito de segurança), 5 aceitos com justificativa, 4 pendentes com prazo
sugerido.

---

## Corrigidos agora

### A1 — ALTO · O limite por IP não existia atrás do proxy

**Onde:** `apps/api/src/main.ts` (ausência de `trust proxy`).

Atrás de nginx ou do proxy do Coolify, `req.ip` é o **proxy**, não a pessoa.
Como o `ThrottlerGuard` conta por `req.ip`, todo mundo dividia o mesmo balde:

- o limite de login (5 por 15 min) valia para o **mundo inteiro somado**;
- trinta requisições erradas trancariam o login de todas as pessoas;
- e quem quisesse fazer isso de propósito derruba o acesso de todos com um laço
  de shell.

**Correção:** `app.set('trust proxy', Number(process.env.TRUSTED_PROXIES ?? 2))`.

O número é a **quantidade de saltos**, não `true`. Com `true`, o Express confia
no primeiro valor de `X-Forwarded-For` — que vem do cliente — e aí qualquer um
forja o próprio IP e o limite deixa de existir de outro jeito. No compose de
produção são dois saltos: borda e nginx do web.

### A2 — MÉDIO · Código de 6 dígitos sem limite de tentativas

**Onde:** `auth.service.ts` (confirmação de e-mail) e `dados-pessoais.service.ts`
(troca de e-mail).

Um milhão de combinações é pouco para quem tem paciência, e o código só morria
por expiração. A única defesa era o limite por IP — que, por causa de A1, não
funcionava, e que de qualquer forma não protege de quem distribui entre IPs. A
troca de e-mail é o caminho clássico para tomar uma conta.

**Correção:** coluna `VerificationCode.attempts`; cinco erros e o código é
apagado. Quatro testes em `test/seguranca.spec.ts`, incluindo o que garante que
o código **certo** já não vale depois de queimado.

### A3 — MÉDIO · Swagger aberto em produção

**Onde:** `main.ts`.

`/docs` publicava toda rota, todo campo aceito e todo formato. É excelente para
quem desenvolve e é um mapa para quem ataca.

**Correção:** só fora de produção. Quem precisar em produção sobe atrás de
autenticação, deliberadamente.

### A4 — FUNCIONAL, com efeito de segurança · O download dos dados nunca funcionou

**Onde:** `apps/web/src/rotas/perfil/Privacidade.tsx`.

"Baixar meus dados" era um `<a href="/v1/me/export/…/download">`. O token de
acesso vai no cabeçalho `Authorization`, que uma navegação do navegador não
manda: o link sempre respondia 401.

O risco não é o 401 — é a correção tentadora. Tirar a autenticação do endereço
deixaria o arquivo com o **histórico de compras completo de uma pessoa** a um id
de distância de qualquer um.

**Correção:** `baixarArquivo()` busca com o token e entrega por blob, revogando
a URL depois (o blob é o arquivo inteiro em memória).

---

## O que está certo, e por quê

Vale registrar o que foi conferido e passou — é o que evita "consertar" adiante
algo que já está no lugar.

| Área | Situação |
|---|---|
| Senhas | Argon2id, sem exceção |
| Access token | **em memória**, nunca em `localStorage` — XSS não vira roubo de sessão |
| Refresh | cookie `httpOnly`, `SameSite=Lax`, `path=/v1/auth`, `Secure` em produção |
| Rotação de sessão | rotativa com detecção de reutilização e tolerância à renovação perdida |
| Troca de senha | revoga **todas** as sessões |
| Códigos e tokens | guardados como hash; comparação com `timingSafeEqual` |
| Autorização por dono | conferida caso a caso: nota, item de lista, exportação e notificação filtram por `userId` — `where: { id, userId }`, nunca só `id` |
| Painel | `JwtGuarda` + `AdminGuarda`, papel lido do banco **a cada requisição** |
| Validação | `whitelist` e `forbidNonWhitelisted` globais: campo a mais na requisição é erro, não é ignorado |
| SQL | Prisma parametrizado; nenhum `$queryRawUnsafe` no código de produção |
| SSRF | URL do QR conferida contra lista por adaptador, **em cada salto de redirecionamento** |
| CSRF | as rotas de mutação usam Bearer, não cookie; o refresh é `SameSite=Lax`, que não acompanha POST de outro site |
| XSS | React escapa por padrão; nenhum `dangerouslySetInnerHTML`; o HTML de nota no painel é exibido como **texto** |
| Log | `semDadoPessoal()` remove e-mail, chave de nota e documento antes de escrever |
| Erro | stack no log, frase genérica na resposta, com `x-request-id` para ligar as duas |
| Rota de desenvolvimento | três travas: módulo não registrado, `NODE_ENV` conferido na chamada, fora do Swagger |
| Contêiner da API | roda como usuário `node`, sem código-fonte nem ferramenta de build |
| Banco gerenciado | RLS em todas as tabelas e privilégios revogados de `anon`/`authenticated`; conferido de fora: 401 `42501` |
| Segredos | nada versionado; `.env*` ignorado; chave de serviço só no ambiente da API |

Cabeçalhos do web, acrescentados nesta auditoria: `X-Frame-Options: DENY` e uma
**CSP** sem `unsafe-inline` em script (`style` precisa, por causa do Tailwind e
dos gráficos em SVG). O painel já tinha `noindex` e `DENY`.

---

## Aceitos, com justificativa

**Cadastro revela se um e-mail já tem conta** (`EMAIL_ALREADY_USED`). É
enumeração de conta, e é deliberado: a alternativa — aceitar o cadastro em
silêncio e mandar e-mail — confunde quem simplesmente esqueceu que já tinha
conta, que é o caso comum. Login e "esqueci a senha" **não** revelam nada, e são
esses os alvos de quem testa listas de e-mail.

**`unsafe-inline` em `style-src`.** Tailwind e os gráficos em SVG escrevem
estilo no elemento. O risco de CSS injetado é muito menor que o de script, e
`script-src` não tem exceção nenhuma.

**A trilha de auditoria não tem chave estrangeira** para a conta de quem agiu.
Parece descuido e é decisão: com FK, encerrar a conta de um admin ou falharia ou
levaria a trilha junto.

**Observações de preço sobrevivem à exclusão da conta.** Elas já não têm ligação
com a pessoa — o `userHash` deixa de poder ser ligado a alguém no instante em
que a conta some. Apagá-las destruiria a média da região dos vizinhos.

**Redis sem senha** no compose. Ele não é exposto para fora da rede do compose.
Ao expor (ou usar Redis gerenciado), `requirepass` passa a ser obrigatório.

---

## Pendentes

### P1 — MÉDIO · Verificação em duas etapas está documentada e não existe

`docs/09-SEGURANCA-LGPD.md` promete 2FA opcional e o schema tem
`twoFactorEnabled`, mas **não há implementação**. Documento que promete
segurança inexistente é pior que documento omisso: alguém decide confiando nele.

Ou implementar, ou marcar como roadmap no documento. **Sugestão: marcar agora,
implementar depois do hackathon.**

### P2 — MÉDIO · Quatro dependências transitivas com aviso alto

Depois de `pnpm update -r`, restam quatro alcançáveis em tempo de execução:

| Pacote | Chega por | Alcançável? |
|---|---|---|
| `multer` | `@nestjs/platform-express` | **Não** — nenhuma rota aceita multipart (conferido) |
| `lodash` | `@nestjs/config` | **Não** — o problema é `_.template`, que não usamos |
| `js-yaml` | `@nestjs/swagger` | Só com Swagger no ar, agora restrito a desenvolvimento |
| `deepmerge-ts` | `prisma` → `@prisma/config` | Tempo de configuração, não de requisição |

Nenhuma dá para fechar sem subir major do Nest — o que não se faz a dezessete
dias do prazo. **Sugestão: subir Nest 11 depois do hackathon**, com os testes
como rede.

### P3 — BAIXO · Sem teste automatizado do limite por IP

O limite existe, tem multiplicador para a suíte e recusa o valor de produção —
mas nada testa que ele **barra**. Some numa refatoração sem ninguém perceber.

### P4 — BAIXO · Sem cabeçalho de segurança no proxy de borda

`helmet` cobre as respostas da API e o nginx cobre os arquivos do web. HSTS
depende da borda (Coolify/Traefik) e não está no repositório. **Conferir no
deploy**, não antes.

---

## Como reproduzir esta auditoria

```bash
pnpm audit --audit-level high          # dependências
pnpm --filter @gastemenos/api test     # inclui test/seguranca.spec.ts
pnpm --filter @gastemenos/web test:e2e # inclui axe em 27 rotas

# Cabeçalhos, com a imagem de produção rodando:
curl -s -D - -o /dev/null http://127.0.0.1:8080/ | grep -iE "content-security|x-frame|x-content|referrer"

# Exposição do banco gerenciado, com a chave publicável:
#   /rest/v1/User → 401 com código 42501
```
