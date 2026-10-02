import { describe, expect, it } from 'vitest';
import {
  LOJA_DE_RECOMPENSAS,
  RECOMPENSA_PADRAO,
  itemDaLoja,
  marcosBatidos,
  notasDoMarco,
  proximoMarco,
} from './recompensas.js';

describe('marcos', () => {
  const regra = RECOMPENSA_PADRAO;

  it('não dá marco antes do primeiro limite', () => {
    expect(marcosBatidos(0, regra)).toBe(0);
    expect(marcosBatidos(24, regra)).toBe(0);
  });

  it('o primeiro marco cai exatamente em 25 notas', () => {
    expect(marcosBatidos(25, regra)).toBe(1);
  });

  it('depois do primeiro, um marco a cada 50 notas', () => {
    expect(marcosBatidos(74, regra)).toBe(1);
    expect(marcosBatidos(75, regra)).toBe(2);
    expect(marcosBatidos(125, regra)).toBe(3);
  });

  it('o índice do marco diz quantas notas ele exigia', () => {
    expect(notasDoMarco(1, regra)).toBe(25);
    expect(notasDoMarco(2, regra)).toBe(75);
    expect(notasDoMarco(3, regra)).toBe(125);
  });

  it('o 200 do pedido original continua configurável', () => {
    const esticada = { ...regra, primeiroMarco: 200, passo: 200 };
    expect(marcosBatidos(199, esticada)).toBe(0);
    expect(marcosBatidos(200, esticada)).toBe(1);
    expect(marcosBatidos(400, esticada)).toBe(2);
  });
});

describe('proximoMarco', () => {
  const regra = RECOMPENSA_PADRAO;

  it('diz quantas notas faltam para a primeira recompensa', () => {
    expect(proximoMarco(0, regra)).toEqual({ indice: 1, notas: 25, faltam: 25 });
    expect(proximoMarco(18, regra)).toEqual({ indice: 1, notas: 25, faltam: 7 });
  });

  it('no marco batido, aponta para o seguinte', () => {
    expect(proximoMarco(25, regra)).toEqual({ indice: 2, notas: 75, faltam: 50 });
  });

  it('nunca devolve falta negativa', () => {
    expect(proximoMarco(1000, regra).faltam).toBeGreaterThanOrEqual(0);
  });
});

describe('loja', () => {
  it('todo item tem preço e prazo', () => {
    for (const item of LOJA_DE_RECOMPENSAS) {
      expect(item.priceCents).toBeGreaterThan(0);
      expect(item.days).toBeGreaterThan(0);
    }
  });

  /**
   * O que este teste protege é uma regra de produto, não um tipo: a lista do
   * que **nunca** se vende está em docs/18-RECOMPENSAS.md, e é fácil alguém
   * acrescentar "histórico completo" aqui sem lembrar dela.
   */
  it('não vende acessibilidade, exportação, comparação nem posição no ranking', () => {
    const proibido = /acessib|letra|contraste|leitor de tela|baixar|exportar|compara|hist[oó]rico|ranking de|pontos extra/i;

    for (const item of LOJA_DE_RECOMPENSAS) {
      expect(item.name).not.toMatch(proibido);
    }
  });

  it('item desconhecido não existe na loja', () => {
    expect(itemDaLoja('SEM_PATROCINIO')).toBeDefined();
    expect(itemDaLoja('DESCONTO_SECRETO')).toBeUndefined();
  });
});
