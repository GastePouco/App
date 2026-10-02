# Modelo de dados

O schema completo está em `prisma/schema.prisma` (mova para `apps/api/prisma/` no setup). Resumo das entidades:

| Entidade | Para quê | Observações |
| --- | --- | --- |
| `User` | conta | `status` ACTIVE, PAUSED (com `pausedUntil`) ou PENDING_DELETION (com `deletionAt` = pedido + 30 dias); `rankingName` é o nome público; `cpfHash` guarda só hash com sal |
| `AuthAccount` | formas de entrar | senha, Google, Apple; sempre pelo menos uma ativa |
| `Session` | aparelhos conectados | refresh token com hash; `successorId` liga a sessão à que a substituiu (ver 09-SEGURANCA-LGPD.md); "Sair" revoga |
| `ConsumptionProfile` | 5 perguntas do primeiro uso | define persona e orçamento sugerido |
| `Preferences` | tema, texto, acessibilidade, notificações, privacidade | uma linha por usuário |
| `Consent` | termos e consentimentos LGPD | histórico, nunca apagar enquanto a conta existir |
| `Store` | loja (CNPJ) | geocodificada uma vez; `geohash` de 5 caracteres |
| `Receipt` / `ReceiptItem` | nota e itens | `accessKey` única no sistema inteiro; dinheiro em centavos |
| `Product` / `ProductAlias` / `Category` | catálogo normalizado | alias liga descrição da loja ao produto |
| `PriceObservation` | um preço visto numa nota | `userHash` permite contar pessoas sem ligar à conta |
| `PriceStat` | agregados por produto × região × período | alimenta histórico, média e loja mais barata |
| `ShoppingList` / `ShoppingListItem` | lista de compras | `suggested` = veio da recompra |
| `PointsLedger` | pontos | só inserção; `@@unique([userId, reason, refId])` impede crédito duplo |
| `User.cpfHash` / `User.cpfVerifiedAt` | CPF para a recompensa | HMAC com segredo próprio, **único** (uma recompensa por pessoa); a data é gravada quando uma nota lida traz o mesmo CPF |
| `RewardLedger` | saldo de recompensa, em centavos de real | só inserção; crédito positivo, gasto negativo; `@@unique([userId, reason, refId])` impede pagar o mesmo marco duas vezes |
| `RewardBenefit` | o que o saldo comprou | uma linha por pessoa e código; `endsAt` é a única verdade sobre estar ativo |
| `Badge` / `UserBadge` | selos e progresso | seed com os 9 selos |
| `Friendship` | amigos (convite/código) | par ordenado A<B |
| `RankingSnapshot` | ranking do mês por escopo e categoria | recalculado por job |
| `Partner` / `Offer` | ofertas (patrocinadas ou comunitárias) | `sponsored = true` exige selo na UI |
| `PriceAlert` | "Criar alerta de preço" | |
| `Notification` / `PushSubscription` | central e Web Push | |
| `DataExport` | "Baixar meus dados" | arquivo expira em 7 dias |

## Seeds de desenvolvimento

`pnpm --filter api prisma db seed` deve criar:
- Usuária Camila Alves (camila.alves@email.com / senha `Economia2026`), nível 12 com 460 pontos no nível, sequência de 5 semanas, perfil "Família Planejadora", orçamento R$ 1.600.
- Amigos: Rafa Lima, Bia Souza, João Pedro, Lu Andrade, Theo Martins, com os valores do ranking da tela Ranking.
- Lojas: Supermercado Vila Nova, Atacarejo Planalto, Mercado Bom Dia, Padaria Pão Dourado (Brasília/DF, CNPJs fictícios válidos no formato).
- Notas de setembro que somem R$ 1.284,60, com as categorias da tela Gastos (Mercearia R$ 539,53, Bebidas R$ 231,23, Hortifrúti R$ 192,69, Limpeza R$ 179,84, Higiene R$ 141,31).
- Histórico do Café torrado e moído 500g na região: abr R$ 22,90, mai R$ 23,80, jun R$ 24,90, jul R$ 23,40, ago R$ 22,10, set R$ 21,40.
