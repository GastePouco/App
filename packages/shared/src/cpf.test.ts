import { describe, expect, it } from 'vitest';
import { cpfMascarado, cpfValido, formatarCpf, limparCpf } from './cpf.js';

/**
 * Os CPFs daqui são **inventados**, com dígito verificador calculado para o
 * teste. Nenhum CPF de pessoa real entra em arquivo de teste — a regra que já
 * valeu para a chave de acesso da nota vale para isto também.
 */
describe('cpfValido', () => {
  it('aceita um CPF com os dois dígitos certos', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa quando um dígito verificador está errado', () => {
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('529.982.247-15')).toBe(false);
  });

  it('recusa tamanho diferente de 11', () => {
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('529982247255')).toBe(false);
    expect(cpfValido('')).toBe(false);
  });

  /** Passam no módulo 11 e são a primeira tentativa de quem quer burlar. */
  it('recusa sequência de um só algarismo', () => {
    for (const digito of '0123456789') {
      expect(cpfValido(digito.repeat(11))).toBe(false);
    }
  });

  it('ignora pontuação e espaço', () => {
    expect(cpfValido(' 529 982 247 25 ')).toBe(true);
  });
});

describe('limparCpf', () => {
  it('deixa só os dígitos', () => {
    expect(limparCpf('529.982.247-25')).toBe('52998224725');
  });
});

describe('cpfMascarado', () => {
  it('mostra só o fim, que é o bastante para a pessoa se reconhecer', () => {
    expect(cpfMascarado('529.982.247-25')).toBe('***.***.247-25');
  });

  it('não vaza nada quando o valor não é um CPF', () => {
    expect(cpfMascarado('123')).toBe('***.***.***-**');
  });
});

describe('formatarCpf', () => {
  it('formata enquanto se digita, sem passar de 11 dígitos', () => {
    expect(formatarCpf('529')).toBe('529');
    expect(formatarCpf('529982')).toBe('529.982');
    expect(formatarCpf('529982247')).toBe('529.982.247');
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('5299822472599')).toBe('529.982.247-25');
  });
});
