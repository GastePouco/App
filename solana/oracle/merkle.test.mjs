import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arvore, confere, folha, prova, raiz, sha256 } from './merkle.mjs';

const obs = (i) => ({ produto: sha256('p' + i), geohash: '6vjyq', precoCentavos: 100 + i, data: '2026-09-24', notaHash: sha256('n' + i) });

test('every observation proves against the root, for odd and even sizes', () => {
  for (const n of [1, 2, 3, 7, 8, 73]) {
    const f = Array.from({ length: n }, (_, i) => folha(obs(i)));
    const nv = arvore(f);
    f.forEach((x, i) => assert.ok(confere(x, prova(nv, i), raiz(nv)), `n=${n} i=${i}`));
  }
});

test('a changed price fails the proof', () => {
  const f = Array.from({ length: 10 }, (_, i) => folha(obs(i)));
  const nv = arvore(f);
  const adulterada = folha({ ...obs(3), precoCentavos: 1 });
  assert.equal(confere(adulterada, prova(nv, 3), raiz(nv)), false);
});
