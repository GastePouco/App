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
```

## Status

The batch in `lotes/` was built from the demo data (81 observations). It has
not been published on devnet yet: we could not obtain devnet SOL for the fee
before the hackathon deadline.

## What this is not, yet

The per-SKU price feed accounts (Anchor), the pay-per-query API over x402 and
reward withdrawal in USDC are planned in
[`docs/10-MODULO-SOLANA.md`](../../docs/10-MODULO-SOLANA.md). The demo data uses
synthetic access keys, so the SEFAZ portal check applies to real receipts only.
