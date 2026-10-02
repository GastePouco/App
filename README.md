# GasteMenos

**Brazilian shoppers scan the QR code on their grocery receipt. In return they
get their spending, the real price history of every item, and an honest answer
to "is this actually cheaper?" — built from receipts the government already
verifies.**

Every purchase in Brazil generates an NFC-e: an electronic consumer receipt with
a 44-digit key that **anyone can check on the tax authority's public portal**.
Few countries have that. It makes every price in this system auditable one by
one, by a stranger, against a government source.

> Truflation gives you the number. We show you the receipt.

That property is what the Solana module is built on: a price oracle whose every
data point can be verified, sold per query to the agents that need local prices.
That module is **designed, not yet implemented** — see
[`docs/10-MODULO-SOLANA.md`](docs/10-MODULO-SOLANA.md). This repository is the
consumer product it stands on, and that product works today.

One half of it already ships: the **payout to the person who scanned**. Reading
receipts earns a balance in BRL at configurable milestones, spendable inside the
app — no wallet, no fee, no blockchain, because the cheapest transfer is the one
that never happens. Withdrawing it in USDC is phase 2, and the app says so in
plain words instead of promising it ([`docs/18-RECOMPENSAS.md`](docs/18-RECOMPENSAS.md)).

---

## What works today

| Area | State |
|---|---|
| Receipt reading — QR, gallery photo, typed key, offline queue | **DF and SP** |
| Spending: month/quarter/year, categories, weekly bars, per-item detail | working |
| Regional prices with a **5 receipts / 3 people** anonymity floor | working |
| Shopping list: whole-list store comparison, repurchase hints | working |
| Offers: community price drops and sponsored, always badged | working |
| Game: points, 13 levels, 9 badges, weekly streak, monthly ranking, invites | working |
| Rewards: balance in BRL per receipt milestone, spendable in-app (no chain yet) | working |
| Account: data export (ZIP), pause, close with 30-day grace, LGPD consent | working |
| Accessibility: 3 themes × 3 text sizes × 320px, screen-reader tables | **zero axe violations across 28 routes** |
| PWA: installable, works offline, asks before updating | working |
| Admin panel: metrics, catalogue review, failed-receipt triage, audit trail | working |

**Not working yet, stated plainly:** email delivery (verification codes go to
the API log), push delivery (subscriptions are stored, nothing is sent), and
store geocoding (every store currently gets Brasília's coordinates). The full,
honest inventory — everything that exists and everything that does not — is in
[`docs/17-MANUAL.md`](docs/17-MANUAL.md).

## Why the receipt is the hard part

Reading it is where most of the engineering went:

- The **access key is validated on the device** (mod-11 check digit) before any
  network call is made.
- The **portal is treated as a public service**, not an API we own: one request
  per second per state, identified User-Agent, backoff, 24-hour cache.
- The parser **reads visible labels**, not CSS classes. It is validated against
  a real 66-item receipt — including a version of the page **stripped of every
  class**, which is what proves it survives a layout change.
- A forged QR code cannot make the server fetch an arbitrary address: each
  adapter declares its allowed hosts, checked **at every redirect hop**.
- The consumer's CPF appears on the portal page and is **never stored** — not
  even in the debug copy kept for 30 days to fix the parser.

Measured, not assumed: in both states served, the by-key lookup sits behind a
captcha and only the QR path works. That is recorded, with dates, in
[`docs/06-NFCE-LEITURA.md`](docs/06-NFCE-LEITURA.md).

## Architecture

```
apps/web     PWA — React 18, Vite, Tailwind driven by design tokens, Workbox
apps/admin   Admin panel — separate app, so its code never ships to consumers
apps/api     NestJS 10 + Prisma 6 + PostgreSQL 16 + BullMQ/Redis
packages/    shared (domain rules), ui (design system), tokens (generated)
```

Money is integer cents everywhere; dates are UTC, shown in São Paulo time. Price
observations carry an HMAC of the user id, never the id — counting distinct
people never means identifying one.

## Run it in five minutes

```bash
pnpm i
docker compose up -d db redis
pnpm --filter @gastemenos/api db:migrate
pnpm --filter @gastemenos/api db:seed     # demo data that asserts its own totals
pnpm dev                                  # web :5173 · api :3001 (Swagger at /docs)
```

Sign in as `camila.alves@email.com` / `Economia2026`. The admin panel runs
separately — `pnpm --filter @gastemenos/admin dev` (`:5174`), with
`admin@gastemenos.com.br` / `Economia2026`.

The seed is not decoration: it **fails if its own numbers drift** from the
approved screens.

## Verify it yourself

```bash
pnpm lint && pnpm typecheck && pnpm test   # 180 API tests · 117 in packages
pnpm --filter @gastemenos/web test:e2e     # 81 end-to-end, axe on every route
pnpm audit --audit-level high
```

Docker images for the API and both front-ends build and run — see
[`docs/14-DEPLOY.md`](docs/14-DEPLOY.md).

## Documentation

Written in **Portuguese**, deliberately: it is the language of the team, of the
receipts and of the people this is for. Code and comments follow. This README
and everything submitted to Colosseum are in English.

| Doc | What it holds |
|---|---|
| [`01-PRD.md`](docs/01-PRD.md) | product, audience, scope, monetisation |
| [`02-ARQUITETURA.md`](docs/02-ARQUITETURA.md) | services, jobs, data flow |
| [`06-NFCE-LEITURA.md`](docs/06-NFCE-LEITURA.md) | receipt reading, per-state findings |
| [`08-ACESSIBILIDADE.md`](docs/08-ACESSIBILIDADE.md) | the accessibility contract |
| [`09-SEGURANCA-LGPD.md`](docs/09-SEGURANCA-LGPD.md) | privacy and security rules |
| [`10-MODULO-SOLANA.md`](docs/10-MODULO-SOLANA.md) | **the on-chain plan, revision 2** |
| [`12-PROGRESSO.md`](docs/12-PROGRESSO.md) | the build diary, **including the mistakes** |
| [`16-SEGURANCA-AUDITORIA.md`](docs/16-SEGURANCA-AUDITORIA.md) | full security audit |
| [`17-MANUAL.md`](docs/17-MANUAL.md) | everything that exists, and everything that does not |

If you want to judge *how* this was built, open `12-PROGRESSO.md`. It records,
among others: a test that wiped the development database and the rule that came
out of it; a colour in the approved design system that failed colour-blind
separation once measured; a service worker that answered for the API and would
have broken Google sign-in in production; and a rate limit that did not exist
behind a proxy.

## Pre-existing code — declared

An earlier version of this app (Expo + Supabase, 11 September 2026) lives in a
separate folder and is **not** part of this repository. Two things came from it,
credited where they are used:

1. The **São Paulo parser selectors**, proven in production there.
2. The **captured text of one real receipt** (Zaffari, 66 items, R$ 1,901.57),
   used as a test fixture. The surrounding HTML was reconstructed and the
   consumer's CPF replaced — stated inside
   [`montar.mjs`](apps/api/test/fixtures/nfce/sp/montar.mjs).

Everything else here was written during the hackathon window. Access keys in
tests are **synthetic**, with a valid check digit: publishing a real key would
let anyone pull up a stranger's purchase on the government portal.

## License

MIT — see [LICENSE](LICENSE).
