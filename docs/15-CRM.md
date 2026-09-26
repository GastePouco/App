# CRM / painel administrativo

> **Estado:** ✅ EXECUTADO (26/09/2026). API com 13 testes de aceite, painel em
> `apps/admin`, axe limpo nas seis telas, imagem Docker construída e testada.

O plano antigo (`gaste-pouco-app/docs/crm-admin/`) foi escrito contra a
arquitetura anterior — Supabase com RLS, sem API própria — e não se aproveita:
aqui o painel é **cliente da mesma API**, e as regras de negócio já estão
testadas do lado do servidor.

## Aplicação separada, de propósito

`apps/admin` é um Vite próprio, não uma rota dentro do app das pessoas. Duas
razões:

- O código do painel **não vai no pacote que o consumidor baixa**. Quem instala
  o PWA não precisa carregar telas que nunca vai abrir.
- O deploy é separável: o painel pode ficar atrás de rede fechada, ou nem subir,
  sem prender o app público junto.

Mesmo design system (`@gastemenos/ui` e os tokens), sem tema próprio.

## Quem entra

Papel em `User.role` (`USER` | `ADMIN`), lido do banco **a cada requisição** —
tirar alguém do admin vale na hora, não em quinze minutos, que é a vida do
access token. `JwtGuarda` diz quem é; `AdminGuarda` diz se pode.

O login é **a mesma conta do aplicativo**. Não existe "conta de admin" com senha
própria: conta de sistema com senha compartilhada é como uma equipe inteira vira
"admin" no log, e aí o log não responde mais nada.

Em produção ninguém nasce admin — `prisma/promover-admin.mts` promove uma conta
que já existe.

## As seis telas

| Tela | Para quê |
|---|---|
| **Painel** | leitura funcionando, base de preços viva, catálogo limpo |
| **Ofertas** | ofertas e parceiros; com parceiro, nasce patrocinada |
| **Catálogo** | fila de revisão e prováveis duplicados |
| **Notas com falha** | triagem do parser, com a página guardada |
| **Contas** | busca por e-mail exato e fila de atenção |
| **Auditoria** | quem fez o quê, e quando |

### Painel

Responde três perguntas, nessa ordem: a leitura está funcionando (taxa de
sucesso contra a meta de 90%), a base de preços está viva (**contribuintes na
semana**, não notas lidas — cem notas das mesmas três pessoas não é uma base) e
o catálogo está limpo.

**Nenhum número identifica pessoa.** É contagem agregada, e há teste que falha se
um e-mail ou nome aparecer na resposta.

### Catálogo

A fila vem **ordenada por quantas observações de preço dependem do produto**:
corrigir o de 300 conserta 300 números; corrigir o de 2 conserta 2. Fila
ordenada por data faria a pessoa gastar o dia no lugar errado.

Os duplicados saem de uma heurística simples — duas primeiras palavras mais a
medida ("arroz tipo|5kg") — e **não** agrupa produtos com GTIN diferente, porque
aí são produtos diferentes mesmo. A decisão final é humana: o que a máquina faz
é levantar o candidato.

**Fundir não tem desfazer.** Move itens, observações, apelidos, listas, alertas e
ofertas numa transação, apaga as estatísticas antigas (serão recalculadas) e
remove o produto absorvido. É o mesmo princípio do casamento automático, que
prefere criar produto novo a juntar dois parecidos: separar depois é fácil,
desfazer uma fusão errada não é.

### Contas — a parte delicada

Quem opera vê dado de gente. Três regras:

1. **Não se navega pela base.** A busca é por **e-mail exato**: quem procura já
   sabe quem procura, porque a pessoa pediu ajuda. `contains` deixaria alguém
   digitar "@gmail" e receber metade da base.
2. **O e-mail sai mascarado** (`ma•••@exemplo.com`). Confirmar uma conta não
   exige ler o endereço inteiro.
3. **Consultar também fica registrado**, não só alterar. Saber quem *olhou* é
   metade da proteção; a outra metade é quem opera saber que fica registrado.

O que aparece sem busca é **fila de atenção** — exclusão agendada e pausa
vencida —, que é trabalho a fazer, não vitrine de pessoas.

Ninguém consegue tirar o próprio papel de admin: com uma conta só, isso tranca
todo mundo para fora e destrancar exige acesso ao banco.

### Auditoria

`AdminLog` com quem, o quê, quando e detalhes. Sem chave estrangeira para a
conta: a trilha **sobrevive ao encerramento da conta de quem agiu**, e aí o nome
vira "(conta encerrada)" com o id preservado. Trilha que some com o responsável
não responde "quem apagou isso?", que é a única razão de ela existir.

A tela existe porque trilha que ninguém lê é enfeite.

### Notas com falha

A página guardada (30 dias, sem CPF) aparece como **texto puro, nunca
renderizada**: HTML de terceiro dentro do painel seria script de terceiro rodando
com a sessão de quem opera.

## O que ficou de fora

- **Pausar/encerrar conta pelo painel.** A pessoa faz isso sozinha no app, e a
  operação conseguir fazer por ela é poder que ninguém pediu. Se um dia virar
  necessidade de suporte, entra com motivo obrigatório e aviso por e-mail.
- **Editar nota ou preço de alguém.** A base de preços vale pelo que veio da
  SEFAZ; mão humana ali destrói a alegação de auditabilidade inteira.
- **Exportar a base de pessoas.** Não existe botão, e é intencional.

## Rodar

```bash
pnpm --filter @gastemenos/admin dev   # :5174, com proxy para a API em :3001
```

Entre com uma conta de papel `ADMIN`. Em desenvolvimento o seed cria
`admin@gastemenos.com.br` / `Economia2026`.
