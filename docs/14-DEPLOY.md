# Deploy

> **Estado:** ✅ imagens prontas e testadas localmente (API e web sobem, migram e
> respondem). ⬜ pendente subir no servidor — depende de acesso ao Coolify.

Três containers e um banco gerenciado:

| Peça | Onde | Imagem |
|---|---|---|
| API (NestJS) | Coolify | `apps/api/Dockerfile` |
| Web (PWA) | Coolify, nginx | `apps/web/Dockerfile` |
| Redis (fila da leitura) | Coolify | `redis:7-alpine` |
| Postgres + Storage | **Supabase** | ver `13-SUPABASE.md` |

`docker-compose.producao.yml` amarra os três. O Postgres não está lá de
propósito: é o Supabase, e ter um segundo banco no compose seria convite a
alguém apontar para o errado.

## Como as imagens são construídas

**API**: três estágios. O primeiro instala com o lockfile inteiro do monorepo
copiando só os manifestos — assim a camada de dependências é reaproveitada
enquanto elas não mudam, que é a diferença entre um deploy de 30 s e um de
4 min. O segundo compila e gera o client do Prisma. O terceiro leva só o que
roda, sem código-fonte nem ferramenta de build, e **como usuário `node`**, não
root.

Duas coisas que só aparecem quando a imagem é de verdade:

- `prisma` é dependência de **produção**, não de desenvolvimento: a CLI roda na
  subida do container, no `migrate deploy`. Como devDependency, o app dependeria
  da rede do registro npm para subir.
- O pnpm se recusa a apagar `node_modules` sem terminal interativo, então a
  troca para `--prod` precisa de um `rm -rf` antes. Sem isso, a imagem final
  sairia com todas as dependências de desenvolvimento dentro.

**Web**: build estático servido por nginx (49 MB, contra 506 MB da API). O
`nginx.conf.template` cuida do que todo SPA precisa e quase sempre esquece:

- rota que não é arquivo cai no `index.html` — sem isso, abrir `/gastos` direto
  na barra de endereço dá 404;
- `sw.js` e o manifest **não** são cacheados: são eles que anunciam a versão
  nova, e um service worker com cache longo prende a pessoa numa versão antiga;
- `/assets/` tem hash no nome, então vai com cache de um ano;
- `/v1` é repassado para a API, para web e API ficarem na **mesma origem** —
  é o que faz o cookie de refresh (`SameSite=Lax`) funcionar sem `SameSite=None`.

## Passo a passo

```bash
# 1. Conferir localmente (foi assim que as imagens foram validadas):
docker build -f apps/api/Dockerfile -t gastemenos-api .
docker build -f apps/web/Dockerfile -t gastemenos-web .

# 2. No Coolify: novo recurso → Docker Compose → apontar para
#    docker-compose.producao.yml e preencher as variáveis na interface.
#    Nenhum segredo entra no repositório.

# 3. Domínios: o web recebe o domínio público; a API não precisa de um, porque
#    o nginx do web já a repassa em /v1. Se você der um domínio à API, ajuste
#    APP_URL e o redirect URI do Google.
```

### Variáveis obrigatórias

`DATABASE_URL`, `DIRECT_URL` (Supabase — atenção ao `%26` se a senha tiver `&`),
`APP_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `USER_HASH_SECRET`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

Os três segredos **precisam ser novos em produção**, não os valores de
desenvolvimento do `.env.example`. E `USER_HASH_SECRET` não se troca depois:
ele entra no `userHash` de cada observação de preço, e mudá-lo desliga o
histórico da região de quem já contribuiu.

### Depois de subir

```bash
# Schema e blindagem (idempotentes):
pnpm --filter @gastemenos/api db:deploy
DATABASE_URL="$DIRECT_URL" pnpm --filter @gastemenos/api db:blindar

# Um admin, promovendo uma conta criada pelo app — ninguém nasce admin:
npx dotenv -e .env.producao -- npx tsx apps/api/prisma/promover-admin.mts voce@exemplo.com
```

O `healthcheck` da API consulta o banco (`/v1/saude`), não só a porta: container
"no ar" com banco fora é pior do que container fora, porque o balanceador manda
tráfego para ele.

## Observabilidade

Sem serviço externo por enquanto, e com o essencial no lugar:

- **`x-request-id` em toda requisição**, aceito do proxy ou gerado. Vai no log e
  **na resposta de erro**: é o código que a pessoa copia da tela e manda para o
  suporte, sem contar nada sobre a falha.
- **Log sem dado pessoal**: `semDadoPessoal()` troca e-mail, chave de nota e
  documento por marcadores antes de escrever. O caminho da requisição carrega
  dado — a rota de código de verificação leva e-mail na query.
- **Erro inesperado nunca vaza detalhe interno**: stack no log, frase genérica
  na tela. Mensagem de exceção costuma trazer nome de tabela e consulta.
- **No web**, `TelaDeErro` é o `errorElement` de todas as rotas. Sem ele, um erro
  em qualquer tela deixa a página em branco — a pior resposta possível, porque
  não diz nada e não oferece saída.

Para plugar Sentry ou similar depois, os dois pontos de entrada já existem: o
`FiltroDeErros` na API e o `TelaDeErro` no web.

## Medições (25/09/2026, build de produção)

Lighthouse 12.8.2, preset desktop, em `/boas-vindas/1`:

| Categoria | Nota |
|---|---|
| Acessibilidade | **100** |
| Boas práticas | **100** |
| SEO | **100** |
| Desempenho | 98 |

O que sobra em desempenho é a folha de estilo das fontes do Google, que bloqueia
a renderização. Resolver significa hospedar as fontes junto — vale fazer, não
vale antes do módulo Solana.

**A categoria PWA não existe mais** no Lighthouse 12: os audits de
"installable" foram removidos. Então "Lighthouse PWA 100" virou critério que
nenhuma ferramenta emite, e o que ele mediria está em `e2e/pwa.spec.ts`:
manifest com nome, `start_url`, `display: standalone` e ícones 192/512 mais o
maskable; service worker ativo; e o app abrindo **com a rede desligada**.

Dois achados desta fase que valem registro:

- `public/` estava **vazia**: o manifest apontava para ícones que não existiam.
  Eles agora são gerados do logo por `ferramentas/gerar-icones.mjs`, sem
  dependência nativa.
- O service worker **nunca era registrado** — `registerType: 'prompt'` estava
  configurado, mas faltava a chamada de registro. Ou seja, não havia PWA.
