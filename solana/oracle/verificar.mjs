// Checks one receipt against a published batch.
//   node verificar.mjs lotes/<id>.json <44-digit access key>
// Prints every price from that receipt, and whether each one proves against the
// root. With the transaction id in the batch file, also compares the root with
// the one written on Solana.
import { readFileSync } from 'node:fs';
import { confere, folha, sha256 } from './merkle.mjs';

const [arquivo, chave] = process.argv.slice(2);
const lote = JSON.parse(readFileSync(arquivo, 'utf8'));
const h = sha256(String(chave).replace(/\D/g, ''));
const desta = lote.observacoes.filter((o) => o.notaHash === h);
if (desta.length === 0) { console.log('Esta nota não está no lote.'); process.exit(1); }
let ok = true;
for (const o of desta) {
  const valida = folha(o) === o.folha && confere(o.folha, o.prova, lote.raiz);
  ok &&= valida;
  console.log(`${valida ? 'OK ' : 'ERRO'} ${o.nome} — R$ ${(o.precoCentavos / 100).toFixed(2)} — ${o.loja}`);
}
if (lote.transacao) {
  const { Connection, clusterApiUrl } = await import('@solana/web3.js');
  const conn = new Connection(process.env.SOLANA_RPC ?? clusterApiUrl('devnet'), 'confirmed');
  const tx = await conn.getTransaction(lote.transacao, { maxSupportedTransactionVersion: 0 });
  const naRede = tx?.meta?.logMessages?.join('\n').includes(lote.raiz);
  console.log(naRede ? 'Raiz confere com a transação na Solana.' : 'Raiz NÃO encontrada na transação.');
  ok &&= !!naRede;
}
// `process.exit` com a conexão RPC ainda aberta faz o libuv imprimir um
// "Assertion failed" no Windows — depois da linha de sucesso, o que numa
// demonstração parece erro. O código de saída basta.
process.exitCode = ok ? 0 : 1;
