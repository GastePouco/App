// Gaste Pouco — price batch publisher.
//
// 1. Reads the price observations that came from receipts read in the app.
// 2. Builds a Merkle tree: one leaf per observation (product, region, price,
//    day, SHA-256 of the receipt access key). No user id, no CPF.
// 3. Writes the full batch, with each leaf's proof, to lotes/<id>.json.
// 4. With --publicar, writes the root to Solana devnet through the Memo
//    Program. The transaction is the public, timestamped commitment: change a
//    single price in the batch and the root no longer matches.
//
// Anyone holding a receipt can check it: hash its access key, find the leaf,
// verify the proof against the root on-chain (verificar.mjs), and open the
// receipt itself on the state tax authority's portal.
//
// Env: DATABASE_URL, and for --publicar SOLANA_SECRET_KEY (base58) and
// optionally SOLANA_RPC (defaults to devnet).
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { arvore, folha, prova, raiz, sha256 } from './merkle.mjs';

const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const publicar = process.argv.includes('--publicar');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query(`
  select coalesce(p.gtin, p."normalizedName") as chave_produto, p."displayName" as nome,
         o.geohash, o."unitPriceCents" as preco, o."observedAt" as quando,
         r."accessKey" as chave_nota, s.cnpj, s.name as loja
    from "PriceObservation" o
    join "Product" p on p.id = o."productId"
    join "Store" s on s.id = o."storeId"
    join "ReceiptItem" i on i.id = o."receiptItemId"
    join "Receipt" r on r.id = i."receiptId"
   order by o."observedAt", o.id`);
await db.end();
if (rows.length === 0) throw new Error('Nenhuma observação de preço no banco.');

const observacoes = rows.map((r) => ({
  produto: sha256(String(r.chave_produto)),
  nome: r.nome,
  loja: r.loja,
  cnpj: r.cnpj,
  geohash: r.geohash,
  precoCentavos: r.preco,
  data: new Date(r.quando).toISOString().slice(0, 10),
  notaHash: sha256(String(r.chave_nota)),
}));
const niveis = arvore(observacoes.map(folha));
const r = raiz(niveis);
const id = `${observacoes[0].data}_${observacoes.at(-1).data}_${r.slice(0, 8)}`;
const memo = JSON.stringify({ app: 'gastepouco', v: 1, lote: id, n: observacoes.length, raiz: r });

const lote = {
  id,
  raiz: r,
  memo,
  rede: 'devnet',
  transacao: null,
  observacoes: observacoes.map((o, i) => ({ ...o, folha: niveis[0][i], prova: prova(niveis, i) })),
};

if (publicar) {
  const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, clusterApiUrl, sendAndConfirmTransaction } = await import('@solana/web3.js');
  const bs58 = (await import('bs58')).default;
  const conn = new Connection(process.env.SOLANA_RPC ?? clusterApiUrl('devnet'), 'confirmed');
  const quem = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_SECRET_KEY));
  const tx = new Transaction().add(new TransactionInstruction({
    keys: [{ pubkey: quem.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO),
    data: Buffer.from(memo, 'utf8'),
  }));
  lote.transacao = await sendAndConfirmTransaction(conn, tx, [quem]);
}

mkdirSync('lotes', { recursive: true });
writeFileSync(`lotes/${id}.json`, JSON.stringify(lote, null, 2));
console.log(`Lote ${id}: ${observacoes.length} observações, raiz ${r}`);
console.log(`Memo: ${memo}`);
if (lote.transacao) console.log(`https://explorer.solana.com/tx/${lote.transacao}?cluster=devnet`);
