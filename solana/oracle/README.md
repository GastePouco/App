# solana/oracle — receipt-backed prices on Solana

Every price observation in Gaste Pouco comes from a receipt (NFC-e) that the
state tax authority has already validated. This package turns a batch of those
observations into a public, tamper-evident commitment on Solana.

## How it works

1. `publicar-lote.mjs` reads the price observations from the database.
2. Each observation becomes one Merkle leaf:
   `sha256(JSON([productKey, geohash, priceCents, day, sha256(accessKey)]))`.
   No user id, no CPF, no readable access key.
3. The root goes on-chain through the **Memo Program** (devnet), as
   `{"app":"gastepouco","v":1,"lote":<id>,"n":<count>,"raiz":<root>}`.
4. The full batch, with every leaf and its proof, is written to
   `lotes/<id>.json`, and published in this repository.

Change one price in the batch and the root no longer matches the transaction.

## Verify a receipt

```bash
node verificar.mjs lotes/<id>.json <44-digit access key>
```

It prints every price from that receipt in the batch, checks each Merkle proof,
and compares the root with the one written on Solana. The holder of a real
receipt can also open it on the SEFAZ portal and see the same prices.

## Run

```bash
cd solana/oracle && npm install    # kept outside the pnpm workspace on purpose
npm test                                                       # Merkle tests
DATABASE_URL=... npm run lote                                  # build the batch only
DATABASE_URL=... SOLANA_SECRET_KEY=<base58> npm run publicar   # build and publish on devnet
SOLANA_SECRET_KEY=<base58> node publicar-raiz.mjs              # publish a batch that already exists
```

## Status

The batch in `lotes/` was built from the demo data (81 observations) and **is
published on devnet**:

| | |
|---|---|
| Batch | `2026-01-15_2026-09-24_56942f0b` — 81 observations |
| Merkle root | `56942f0b4d44cac9b1b093b787cddecf32845434eb9d0d786bacf886f5498f78` |
| Transaction | [`2r6a6heM…WiJsuCkR`](https://explorer.solana.com/tx/2r6a6heMnG5y4cwtY2BTyW4rCxxZYF3YCmK2uqPyVC5J2JMfVhxQHFZotj4KthGUYaF7HcSf7Sz2x8EKWiJsuCkR?cluster=devnet) |
| Slot · fee | 510485128 · 5000 lamports (0.000005 SOL) |

Verified end to end: every Merkle proof of one receipt checks out and the root
matches the memo recorded in that transaction.

```
$ node verificar.mjs lotes/2026-01-15_2026-09-24_56942f0b.json 53260908376451000129650010000000651105147359
OK  Café torrado e moído 500g — R$ 21.40 — Supermercado Vila Nova
OK  Arroz tipo 1 5kg — R$ 28.90 — Supermercado Vila Nova
... 5 more
Raiz confere com a transação na Solana.
```

`publicar-raiz.mjs` is what published it: the batch was already versioned here,
so rebuilding it from the database would have produced a different root and a
different file — and the published batch would no longer be the batch in this
repository. Running it twice does nothing: a batch that carries a transaction is
not published again.

## What this is not, yet

The per-SKU price feed accounts (Anchor), the pay-per-query API over x402 and
reward withdrawal in USDC are planned in
[`docs/10-MODULO-SOLANA.md`](../../docs/10-MODULO-SOLANA.md). The demo data uses
synthetic access keys, so the SEFAZ portal check applies to real receipts only.
