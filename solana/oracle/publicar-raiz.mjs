// Publica na devnet a raiz de um lote **que já existe** em lotes/.
//
// `publicar-lote.mjs --publicar` monta um lote novo a partir do banco e publica.
// Este script serve ao outro caso, que é o do repositório: o lote já está
// versionado, com as 81 observações e as provas, e o que falta é o compromisso
// on-chain. Remontar do banco geraria outra raiz e outro arquivo — e o lote
// publicado deixaria de ser o lote que está aqui.
//
// Idempotente de propósito: lote com `transacao` preenchida não é publicado de
// novo. Duas transações com a mesma raiz não acrescentam nada e confundem quem
// for verificar.
//
//   SOLANA_SECRET_KEY=<base58> node publicar-raiz.mjs [lotes/<arquivo>.json]
//
// Custo: uma transação de memo, 5000 lamports (0,000005 SOL).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const TAXA_APROXIMADA = 5000;

async function publicar() {
  const pasta = 'lotes';
  const caminho =
    process.argv[2] ??
    join(pasta, readdirSync(pasta).filter((f) => f.endsWith('.json')).sort().at(-1) ?? '');

  const lote = JSON.parse(readFileSync(caminho, 'utf8'));
  console.log(`lote ${lote.id}`);
  console.log(`  raiz ${lote.raiz}`);
  console.log(`  ${lote.observacoes.length} observações`);

  if (lote.transacao) {
    console.log(`\nJá publicado: ${lote.transacao}`);
    console.log(`https://explorer.solana.com/tx/${lote.transacao}?cluster=devnet`);
    return 0;
  }

  if (!process.env.SOLANA_SECRET_KEY) {
    console.error('\nFalta SOLANA_SECRET_KEY (base58) de uma carteira com SOL de devnet.');
    return 1;
  }

  const conn = new Connection(process.env.SOLANA_RPC ?? clusterApiUrl('devnet'), 'confirmed');
  const quem = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_SECRET_KEY));

  const saldo = await conn.getBalance(quem.publicKey);
  console.log(`\ncarteira ${quem.publicKey.toBase58()}`);
  console.log(`  saldo ${saldo / LAMPORTS_PER_SOL} SOL`);

  // Conferido antes de montar a transação: falta de saldo vira uma frase com o
  // endereço para o faucet, e não um "Attempt to debit an account but found no
  // record of a prior credit" lá dentro da rede.
  if (saldo < TAXA_APROXIMADA) {
    console.error(
      '\nSem SOL para a taxa. Peça no faucet e rode de novo:\n' +
        `  https://faucet.solana.com  (endereço: ${quem.publicKey.toBase58()})`,
    );
    return 1;
  }

  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [{ pubkey: quem.publicKey, isSigner: true, isWritable: false }],
      programId: new PublicKey(MEMO),
      data: Buffer.from(lote.memo, 'utf8'),
    }),
  );

  const assinatura = await sendAndConfirmTransaction(conn, tx, [quem], {
    commitment: 'confirmed',
  });

  lote.transacao = assinatura;
  lote.publicadoEm = new Date().toISOString();
  lote.publicadoPor = quem.publicKey.toBase58();
  writeFileSync(caminho, `${JSON.stringify(lote, null, 2)}\n`);

  console.log(`\npublicado: ${assinatura}`);
  console.log(`https://explorer.solana.com/tx/${assinatura}?cluster=devnet`);
  console.log(`\n${caminho} atualizado com a assinatura. Confira com:`);
  console.log(`  node verificar.mjs ${caminho} <chave de 44 dígitos de uma nota do lote>`);
  return 0;
}

// Sem `process.exit`: com conexão RPC aberta ele faz o libuv reclamar no
// Windows. O código de saída basta, e o Node fecha o socket sozinho.
process.exitCode = await publicar();
