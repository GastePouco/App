# API REST (`/v1`)

JSON, autenticação por `Authorization: Bearer <access>`; refresh em cookie `httpOnly`. Erros: `{ "code": "INVALID_KEY", "message": "A chave precisa ter 44 números. Confira e tente de novo." }`. Valores em centavos. Gere o Swagger em `/docs` a partir dos DTOs.

## Autenticação

| Método | Rota | Corpo / resposta |
| --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password, cep, acceptTerms }` → 201 `{ user }` e envia código de 6 dígitos |
| POST | `/auth/verify-email` | `{ email, code }` → `{ access, user }` (+50 pontos) |
| POST | `/auth/resend-code` | `{ email }` (limite: 1 por minuto) |
| POST | `/auth/login` | `{ email, password }` → `{ access, user }` ou `{ needs2fa: true, challengeId }` |
| POST | `/auth/2fa` | `{ challengeId, code }` |
| GET | `/auth/google` | redireciona ao Google |
| GET | `/auth/google/callback` | cria/entra na conta, redireciona ao web com sessão |
| POST | `/auth/refresh` | cookie → `{ access }` |
| POST | `/auth/logout` | revoga a sessão atual |
| POST | `/auth/forgot-password` | `{ email }` → sempre 204 (não revela se existe) |
| POST | `/auth/reset-password` | `{ token, password }` → revoga todas as sessões |

Senha: mínimo 8 caracteres, um número e uma letra maiúscula; hash com Argon2id. Limite de 5 tentativas de login por 15 min por e-mail + IP.

## Conta e preferências

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/me` | usuário, nível, pontos, sequência, status |
| PATCH | `/me` | `{ name, rankingName, phone, cep, cpf? }` (CPF vira hash) |
| POST | `/me/avatar` | upload (máx. 2 MB, JPEG/PNG/WebP) |
| DELETE | `/me/avatar` | |
| POST | `/me/email-change` | `{ newEmail }` → código para o novo e-mail |
| POST | `/me/email-change/confirm` | `{ code }` |
| POST | `/me/password` | `{ current, next }` |
| GET/PUT | `/me/profile` | perfil de consumo (5 respostas) → persona e orçamento (+100 pontos na primeira vez) |
| GET/PATCH | `/me/preferences` | tema, texto, acessibilidade, notificações, privacidade |
| GET | `/me/sessions` | aparelhos conectados |
| DELETE | `/me/sessions/:id` | sair de um aparelho |
| DELETE | `/me/sessions` | sair de todos os outros |
| GET | `/me/auth-accounts` | formas de entrar |
| DELETE | `/me/auth-accounts/:provider` | desconectar (recusa se for a última) |
| POST | `/me/pause` | `{ until: ISO | null }` |
| POST | `/me/resume` | reativar |
| POST | `/me/delete` | `{ confirm: "ENCERRAR", reason? }` → agenda exclusão em 30 dias |
| POST | `/me/delete/cancel` | desfaz enquanto estiver no prazo |
| POST | `/me/export` | pede arquivo com todos os dados |
| GET | `/me/export/:id` | status e link temporário |

## Notas fiscais

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/receipts` | `{ qrUrl } | { accessKey }` + `source` → 202 `{ id, status }` |
| GET | `/receipts/:id` | status; quando `DONE`: loja, itens com `regionAvgCents`, `savingsCents`, `pointsAwarded`, `levelUp`, `newBadges`, `speech` |
| GET | `/receipts/:id/events` | SSE com mudanças de status |
| GET | `/receipts?month=2026-09&cursor=` | lista paginada |
| DELETE | `/receipts/:id` | exclui a nota e estorna os pontos |
| POST | `/receipts/:id/report` | `{ itemId?, message }` "Algum item veio errado?" |

## Gastos

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/spending/summary?period=month|3months|year&ref=2026-09` | total, comparação com o período anterior, orçamento, sobra |
| GET | `/spending/categories?period=` | categorias com valor e percentual |
| GET | `/spending/weeks?month=` | totais por semana |
| GET | `/spending/insights?month=` | item que mais pesou, maiores altas |

## Produtos e preços

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/products/search?q=` | busca por nome |
| GET | `/products/:id` | produto, categoria |
| GET | `/products/:id/prices?range=30d|6m|1y&radiusKm=5` | série mensal/diária da média da região, o que o usuário pagou, média hoje, pico, contagem de notas e pessoas |
| GET | `/products/:id/stores?radiusKm=5` | lojas mais baratas com preço, distância e "atualizado há" |
| POST | `/products/:id/alert` | criar alerta |
| DELETE | `/products/:id/alert` | |

## Lista de compras

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/lists/current` | itens, estimativa, loja mais barata para a lista toda e economia |
| POST | `/lists/current/items` | `{ productId? , label, quantity }` |
| PATCH | `/lists/current/items/:id` | `{ checked, quantity }` |
| DELETE | `/lists/current/items/:id` | |
| GET | `/lists/current/suggestions` | recompra ("detergente a cada ~15 dias") |
| POST | `/lists/current/from-receipt/:receiptId` | "Repetir itens na lista" |

## Ofertas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/offers?category=&onlyMyList=&q=` | patrocinadas (no máximo 1 por página) + baixas de preço da comunidade |
| POST | `/offers/:id/click` | métrica |
| POST | `/offers/:id/confirm` | "o preço está certo?" (+10 pontos, até 5/dia) |

## Jogo

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/game/status` | nível, nome do nível, pontos no nível, meta, sequência |
| GET | `/game/badges` | selos com progresso |
| GET | `/game/ranking?scope=friends|region&category=savings|purchases|points&month=` | pódio, lista e posição do usuário |
| GET | `/game/share-card` | dados do cartão de compartilhar |
| POST | `/friends/join` | `{ inviteCode }` |
| GET | `/friends` | amigos |

## Notificações

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/notifications?type=all|prices|game&cursor=` | agrupadas por Hoje / Esta semana no web |
| POST | `/notifications/read-all` | |
| POST | `/notifications/:id/read` | |
| POST | `/push/subscribe` | `{ endpoint, keys }` |
| DELETE | `/push/subscribe` | |

## Admin (papel `ADMIN`)

Papel em `User.role`, lido do banco **a cada requisição** — tirar alguém do admin vale na hora, não em 15 minutos. `JwtGuarda` diz quem é, `AdminGuarda` diz se pode, e toda alteração vai para `AdminLog` (quem, o quê, quando).

| Método | Rota | Observação |
| --- | --- | --- |
| GET | `/admin/partners` | |
| POST | `/admin/partners` | `{ name, cnpj?, active? }` |
| GET | `/admin/offers` | com impressões, cliques e confirmações |
| POST | `/admin/offers` | **não existe campo `sponsored`**: com `partnerId`, a oferta nasce patrocinada |
| PATCH | `/admin/offers/:id` | |
| DELETE | `/admin/offers/:id` | |
| GET | `/admin/receipts/failed` | sem chave de acesso e sem quem leu |
| GET | `/admin/receipts/:id/page` | página guardada, sem CPF, 30 dias; a leitura fica registrada |

Ainda planejado: `/admin/products/:id` (corrigir nome e categoria), usuários e métricas — ver o CRM em `12-PROGRESSO.md`.

Promover alguém: `npx tsx prisma/promover-admin.mts <e-mail>`. Não há conta de admin plantada em produção.
