/**
 * Recompensa por notas lidas — regras puras (docs/18-RECOMPENSAS.md).
 *
 * Duas decisões moram aqui porque as duas aparecem na tela e no banco:
 *
 * 1. **O saldo é em centavos de real**, não em micro-USDC como o planejamento
 *    rascunhou. O app inteiro conta dinheiro em centavos de real, e quem lê
 *    nota de supermercado em Ceilândia pensa em real. A conversão para USDC
 *    acontece no saque (fase 2), com a cotação do dia, e a pessoa vê o valor
 *    convertido **antes** de confirmar — assim ninguém promete um número numa
 *    moeda e paga noutra sem avisar.
 *
 * 2. **O marco é contado em notas que viraram dado**, não em pontos. Ponto
 *    também vem de perfil preenchido, convite e sequência; recompensa paga
 *    contribuição de dado, e só ela.
 *
 * O limite é configurável (o pedido original era 200), mas o padrão é o que vai
 * ao ar: a 4 notas/mês — a meta do produto em `01-PRD.md` — 200 notas levam 50
 * meses, e recompensa que chega em quatro anos não muda comportamento nenhum.
 */

export interface RegraDaRecompensa {
  /** Notas que viraram dado para o primeiro marco. */
  primeiroMarco: number;
  /** Notas entre um marco e o seguinte. */
  passo: number;
  /** Quanto cada marco credita, em centavos. */
  valorDoMarcoCentavos: number;
  /**
   * Teto de crédito por mês, somando todas as pessoas.
   *
   * Enquanto não há receita de dado (x402), a recompensa é marketing — e
   * marketing sem teto é prejuízo que cresce junto com o sucesso. Quando o teto
   * do mês acaba, o marco não é perdido: ele é creditado no ciclo seguinte.
   */
  orcamentoMensalCentavos: number;
}

export const RECOMPENSA_PADRAO: RegraDaRecompensa = {
  primeiroMarco: 25,
  passo: 50,
  valorDoMarcoCentavos: 200,
  orcamentoMensalCentavos: 50_000,
};

/** Quantos marcos a pessoa já bateu com essa quantidade de notas. */
export function marcosBatidos(notas: number, regra: RegraDaRecompensa): number {
  if (notas < regra.primeiroMarco) return 0;
  return 1 + Math.floor((notas - regra.primeiroMarco) / regra.passo);
}

/** Quantas notas o n-ésimo marco exige (`indice` começa em 1). */
export function notasDoMarco(indice: number, regra: RegraDaRecompensa): number {
  return regra.primeiroMarco + (indice - 1) * regra.passo;
}

export interface ProximoMarco {
  indice: number;
  /** Notas necessárias para alcançá-lo. */
  notas: number;
  /** Quantas faltam. */
  faltam: number;
}

export function proximoMarco(notas: number, regra: RegraDaRecompensa): ProximoMarco {
  const indice = marcosBatidos(notas, regra) + 1;
  const alvo = notasDoMarco(indice, regra);
  return { indice, notas: alvo, faltam: Math.max(alvo - notas, 0) };
}

/**
 * O que o saldo compra dentro do app.
 *
 * > Nunca se vende o que torna o app útil ou acessível.
 *
 * Fora da lista, por decisão e não por falta de tempo: comparação de preço (é o
 * produto), qualquer recurso de acessibilidade (seria privilégio de quem paga),
 * baixar os próprios dados (é direito, não produto), leitura de nota e posição
 * no ranking.
 *
 * E uma regra que vale para quem for acrescentar item aqui: **o catálogo mora no
 * código porque todo item precisa de um ponto que o aplique**. Item em tabela de
 * banco sem código que o honre é promessa que a pessoa paga e não recebe. Por
 * isso também não há item que só faria sentido depois de criar uma cota que hoje
 * não existe — inventar limite para vender a saída dele é piorar o app de graça.
 */
export type CodigoDoBeneficio = 'SEM_PATROCINIO' | 'SELO_APOIADOR';

export interface ItemDaLoja {
  code: CodigoDoBeneficio;
  name: string;
  description: string;
  priceCents: number;
  /** Duração em dias. Comprar de novo soma ao que ainda falta, não desperdiça. */
  days: number;
}

export const LOJA_DE_RECOMPENSAS: readonly ItemDaLoja[] = [
  {
    code: 'SEM_PATROCINIO',
    name: 'Sem ofertas patrocinadas',
    description: 'A tela Ofertas mostra só queda de preço real, sem anúncio, por 30 dias.',
    priceCents: 200,
    days: 30,
  },
  {
    code: 'SELO_APOIADOR',
    name: 'Selo de apoiador no ranking',
    description: 'Um selo ao lado do seu nome no ranking por 90 dias. Não muda sua posição.',
    priceCents: 100,
    days: 90,
  },
];

export function itemDaLoja(code: string): ItemDaLoja | undefined {
  return LOJA_DE_RECOMPENSAS.find((item) => item.code === code);
}
