// Merkle tree over price observations. SHA-256, sorted pairs (order-independent
// proofs), last node duplicated on odd levels. Same code runs in Node and in the
// browser verifier, so anyone can recompute the root from the published batch.
import { createHash } from 'node:crypto';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** One leaf per observation. No user id, no CPF, no readable access key. */
export function folha(o) {
  return sha256(JSON.stringify([o.produto, o.geohash, o.precoCentavos, o.data, o.notaHash]));
}

const par = (a, b) => sha256(a < b ? a + b : b + a);

export function arvore(folhas) {
  if (folhas.length === 0) throw new Error('lote vazio');
  const niveis = [folhas];
  while (niveis.at(-1).length > 1) {
    const n = niveis.at(-1);
    const prox = [];
    for (let i = 0; i < n.length; i += 2) prox.push(par(n[i], n[i + 1] ?? n[i]));
    niveis.push(prox);
  }
  return niveis;
}

export const raiz = (niveis) => niveis.at(-1)[0];

export function prova(niveis, indice) {
  const p = [];
  for (let k = 0; k < niveis.length - 1; k++) {
    const n = niveis[k];
    const irmao = indice % 2 === 0 ? (n[indice + 1] ?? n[indice]) : n[indice - 1];
    p.push(irmao);
    indice = Math.floor(indice / 2);
  }
  return p;
}

export function confere(folhaHex, provaHex, raizHex) {
  return provaHex.reduce((acc, irmao) => par(acc, irmao), folhaHex) === raizHex;
}
