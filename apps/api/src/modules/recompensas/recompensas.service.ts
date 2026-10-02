import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  LOJA_DE_RECOMPENSAS,
  erro,
  formatarCentavos,
  itemDaLoja,
  marcosBatidos,
  notasDoMarco,
  proximoMarco,
  type CodigoDoBeneficio,
} from '@gastemenos/shared';
import { configuracao } from '../../comum/configuracao.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificacoesService } from '../notificacoes/notificacoes.service.js';

export type MotivoDeRecompensa = 'MILESTONE' | 'PURCHASE' | 'ADJUSTMENT';

/**
 * O que a pessoa precisa ter para a recompensa sair.
 *
 * `cpfConfirmadoPorNota` **não** é exigência da fase 1: muita gente não informa
 * CPF no caixa, e exigir isso excluiria quem contribui de verdade. Ele é o sinal
 * de confiança que a fase 2 vai pedir para o saque.
 */
export interface RequisitosDaRecompensa {
  apto: boolean;
  emailVerificado: boolean;
  questionario: boolean;
  cpf: boolean;
  regiao: boolean;
  contaAtiva: boolean;
  cpfConfirmadoPorNota: boolean;
}

export interface MarcoCreditado {
  /** Índice do marco: 1 é o primeiro da vida da pessoa. */
  milestone: number;
  /** Notas que esse marco exigia, pela regra em vigor. */
  receipts: number;
  amountCents: number;
}

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Recompensa por notas lidas (docs/18-RECOMPENSAS.md, fase 1).
 *
 * Três coisas que este serviço decide, e que não são detalhe:
 *
 * 1. **Conta nota que virou dado, não nota lida.** Nota recusada, duplicada ou
 *    que falhou na leitura não entra; nota de loja sem geohash também não,
 *    porque sem região ela não alimenta preço de ninguém. É o que alinha a
 *    recompensa ao que de fato tem valor — e o que corta a farra de escanear
 *    qualquer papel.
 *
 * 2. **O marco é identificado pelo índice, nunca pela quantidade de notas.** Se
 *    amanhã o primeiro marco virar 40 notas, quem já recebeu o `marco:1` não
 *    recebe de novo. Chave de idempotência amarrada ao número de notas
 *    pagaria duas vezes a cada mudança de campanha.
 *
 * 3. **Quem recebe é uma pessoa identificada.** E-mail confirmado, questionário
 *    de consumo respondido, CEP e **CPF vinculado** — um CPF por conta. Sem isso
 *    a recompensa paga contas, não pessoas, e abrir dez contas valeria dez
 *    recompensas. O celular não entra na lista: não usamos para nada, e exigir
 *    dado que não se usa é coletar por coletar.
 *
 *    O marco não é perdido por falta de cadastro — fica esperando, e o job
 *    noturno paga quando a pessoa completa. É o que transforma a exigência em
 *    convite em vez de punição.
 *
 * 4. **O teto mensal é teto, não aviso.** Estourado o orçamento, o marco não é
 *    perdido nem pago: fica para o ciclo seguinte, e o job noturno o credita
 *    quando o mês virar. Melhor dizer "no próximo mês" do que dever.
 *
 * Nada aqui toca blockchain. O saldo nasce fora dela porque **a transferência
 * mais barata é a que não acontece**: quem gasta no app custa zero.
 */
@Injectable()
export class RecompensasService {
  private readonly logger = new Logger(RecompensasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * Requisitos para receber (docs/18-RECOMPENSAS.md).
   *
   * Conta pausada ou a caminho do encerramento não acumula: dinheiro só anda
   * para conta ativa.
   */
  async requisitos(userId: string): Promise<RequisitosDaRecompensa> {
    const pessoa = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        emailVerifiedAt: true,
        cep: true,
        regionGeohash: true,
        cpfHash: true,
        cpfVerifiedAt: true,
        status: true,
        profile: { select: { userId: true } },
      },
    });

    const emailVerificado = pessoa.emailVerifiedAt !== null;
    const questionario = pessoa.profile !== null;
    const cpf = pessoa.cpfHash !== null;
    const regiao = Boolean(pessoa.cep ?? pessoa.regionGeohash);
    const contaAtiva = pessoa.status === 'ACTIVE';

    return {
      apto: emailVerificado && questionario && cpf && regiao && contaAtiva,
      emailVerificado,
      questionario,
      cpf,
      regiao,
      contaAtiva,
      cpfConfirmadoPorNota: pessoa.cpfVerifiedAt !== null,
    };
  }

  /** Notas da pessoa que viraram observação de preço. */
  async notasQueViraramDado(userId: string): Promise<number> {
    return this.prisma.receipt.count({
      where: { userId, status: 'DONE', items: { some: { observation: { isNot: null } } } },
    });
  }

  /** Saldo é a soma do livro-razão, nunca um campo guardado. */
  async saldoCentavos(userId: string): Promise<number> {
    const soma = await this.prisma.rewardLedger.aggregate({
      where: { userId },
      _sum: { amountCents: true },
    });
    return soma._sum.amountCents ?? 0;
  }

  /** Quanto o programa já creditou no mês — a conta que o teto vigia. */
  async creditadoNoMes(quando = new Date()): Promise<number> {
    const de = new Date(Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth(), 1));
    const ate = new Date(Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth() + 1, 1));

    const soma = await this.prisma.rewardLedger.aggregate({
      where: { reason: 'MILESTONE', createdAt: { gte: de, lt: ate } },
      _sum: { amountCents: true },
    });
    return soma._sum.amountCents ?? 0;
  }

  /**
   * Credita os marcos que a pessoa já bateu e ainda não recebeu.
   *
   * Chamado quando uma nota termina de ser lida e pelo job noturno — por isso
   * tem de ser idempotente: a restrição `@@unique([userId, reason, refId])` do
   * banco é quem garante isso, não um `if` aqui.
   */
  async avaliarMarcos(userId: string): Promise<MarcoCreditado[]> {
    const regra = configuracao.recompensas.regra;
    const notas = await this.notasQueViraramDado(userId);
    const batidos = marcosBatidos(notas, regra);
    if (batidos === 0) return [];

    // Cadastro incompleto não perde o marco: ele espera aqui. Quem completa
    // recebe na nota seguinte ou na varredura da noite.
    const requisitos = await this.requisitos(userId);
    if (!requisitos.apto) {
      this.logger.debug(
        `Marco ${batidos} em espera: cadastro incompleto (${Object.entries(requisitos)
          .filter(([chave, valor]) => chave !== 'apto' && valor === false)
          .map(([chave]) => chave)
          .join(', ')}).`,
      );
      return [];
    }

    const pagos = new Set(
      (
        await this.prisma.rewardLedger.findMany({
          where: { userId, reason: 'MILESTONE' },
          select: { refId: true },
        })
      ).map((linha) => linha.refId),
    );

    let gastoNoMes = await this.creditadoNoMes();
    const creditados: MarcoCreditado[] = [];

    for (let indice = 1; indice <= batidos; indice++) {
      const refId = `marco:${indice}`;
      if (pagos.has(refId)) continue;

      if (gastoNoMes + regra.valorDoMarcoCentavos > regra.orcamentoMensalCentavos) {
        this.logger.warn(
          `Orçamento do mês esgotado (${gastoNoMes} de ${regra.orcamentoMensalCentavos} centavos): ` +
            `o marco ${indice} entra no ciclo seguinte.`,
        );
        break;
      }

      try {
        await this.prisma.rewardLedger.create({
          data: { userId, amountCents: regra.valorDoMarcoCentavos, reason: 'MILESTONE', refId },
        });
      } catch (falha) {
        // P2002: o job e a leitura da nota chegaram juntos. Já está creditado.
        if ((falha as { code?: string }).code === 'P2002') continue;
        throw falha;
      }

      gastoNoMes += regra.valorDoMarcoCentavos;
      creditados.push({
        milestone: indice,
        receipts: notasDoMarco(indice, regra),
        amountCents: regra.valorDoMarcoCentavos,
      });
    }

    for (const marco of creditados) {
      // Avisar é parte do crédito, não enfeite: quem fecha o app depois de ler
      // a nota não vê a tela de resultado e ficaria com dinheiro no saldo sem
      // saber. Não passa por interruptor de preferência — isto não é
      // marketing, é o aviso de que ela recebeu algo.
      await this.notificacoes.criar(userId, {
        type: 'REWARD',
        title: `Marco de ${marco.receipts} notas: ${formatarCentavos(marco.amountCents)} no seu saldo.`,
        href: '/recompensas',
      });
    }

    if (creditados.length) {
      this.logger.log(
        `${creditados.length} marco(s) creditado(s): ${creditados
          .map((marco) => `#${marco.milestone}`)
          .join(', ')}.`,
      );
    }

    return creditados;
  }

  async beneficiosAtivos(userId: string): Promise<Array<{ code: string; endsAt: Date }>> {
    return this.prisma.rewardBenefit.findMany({
      where: { userId, endsAt: { gt: new Date() } },
      select: { code: true, endsAt: true },
      orderBy: { endsAt: 'desc' },
    });
  }

  async beneficioAtivo(userId: string, code: CodigoDoBeneficio): Promise<boolean> {
    const achado = await this.prisma.rewardBenefit.findFirst({
      where: { userId, code, endsAt: { gt: new Date() } },
      select: { id: true },
    });
    return achado !== null;
  }

  /**
   * Quem, entre estas pessoas, tem o selo de apoiador ativo.
   *
   * Em lote de propósito: o ranking mostra dezenas de linhas, e uma consulta
   * por linha transformaria a tela em N+1.
   */
  async apoiadoresEntre(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();

    const linhas = await this.prisma.rewardBenefit.findMany({
      where: { userId: { in: ids }, code: 'SELO_APOIADOR', endsAt: { gt: new Date() } },
      select: { userId: true },
    });
    return new Set(linhas.map((linha) => linha.userId));
  }

  /** Saldo, progresso até o próximo marco, loja, benefícios e histórico. */
  async situacao(userId: string) {
    const regra = configuracao.recompensas.regra;
    const notas = await this.notasQueViraramDado(userId);

    const [saldo, lancamentos, beneficios, requisitos, marcosPagos] = await Promise.all([
      this.saldoCentavos(userId),
      this.prisma.rewardLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, amountCents: true, reason: true, refId: true, createdAt: true },
      }),
      this.beneficiosAtivos(userId),
      this.requisitos(userId),
      this.prisma.rewardLedger.count({ where: { userId, reason: 'MILESTONE' } }),
    ]);

    const batidos = marcosBatidos(notas, regra);
    const proximo = proximoMarco(notas, regra);
    const anterior = batidos === 0 ? 0 : notasDoMarco(batidos, regra);
    const faixa = proximo.notas - anterior;

    const ativos = new Map(beneficios.map((beneficio) => [beneficio.code, beneficio.endsAt]));

    return {
      balanceCents: saldo,
      receiptsCounted: notas,
      milestonesReached: batidos,
      /**
       * Marco batido e ainda não pago — por cadastro incompleto ou por teto do
       * mês. A tela mostra isto como "esperando você", nunca como perdido.
       */
      milestonesWaiting: Math.max(batidos - marcosPagos, 0),
      requirements: {
        eligible: requisitos.apto,
        emailVerified: requisitos.emailVerificado,
        profile: requisitos.questionario,
        cpf: requisitos.cpf,
        region: requisitos.regiao,
        cpfConfirmedByReceipt: requisitos.cpfConfirmadoPorNota,
      },
      nextMilestone: {
        index: proximo.indice,
        receipts: proximo.notas,
        missing: proximo.faltam,
        amountCents: regra.valorDoMarcoCentavos,
      },
      // Progresso dentro da faixa atual, não desde zero: depois do primeiro
      // marco a barra recomeçaria cheia e pareceria travada.
      progress: faixa > 0 ? Math.min(Math.round(((notas - anterior) / faixa) * 100), 100) : 0,
      benefits: beneficios.map((beneficio) => ({
        code: beneficio.code,
        endsAt: beneficio.endsAt.toISOString(),
      })),
      store: LOJA_DE_RECOMPENSAS.map((item) => ({
        code: item.code,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        days: item.days,
        affordable: saldo >= item.priceCents,
        activeUntil: ativos.get(item.code)?.toISOString() ?? null,
      })),
      history: lancamentos.map((linha) => ({
        id: linha.id,
        amountCents: linha.amountCents,
        reason: linha.reason,
        description: this.descrever(linha.reason, linha.refId),
        createdAt: linha.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Compra um benefício com o saldo.
   *
   * Duas proteções que custam pouco e evitam cobrança errada:
   *
   * - **`FOR UPDATE` na linha da pessoa.** Sem a trava, dois pedidos
   *   simultâneos leem o mesmo saldo, os dois passam na conferência e o saldo
   *   termina negativo. Postgres em `read committed` não impede isso sozinho.
   * - **Chave de idempotência com janela de um minuto.** Toque duplo no botão,
   *   ou reenvio automático de uma requisição que o celular perdeu, não cobra
   *   duas vezes. Comprar de novo depois do minuto é compra nova — e soma
   *   prazo ao que ainda falta, em vez de desperdiçá-lo.
   */
  async comprar(userId: string, code: string) {
    const item = itemDaLoja(code);
    if (!item) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const agora = new Date();
    const refId = `${item.code}:${agora.toISOString().slice(0, 16)}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const repetido = await tx.rewardLedger.findFirst({
        where: { userId, reason: 'PURCHASE', refId },
        select: { id: true },
      });

      const existente = await tx.rewardBenefit.findUnique({
        where: { userId_code: { userId, code: item.code } },
        select: { endsAt: true },
      });

      if (repetido) {
        const soma = await tx.rewardLedger.aggregate({
          where: { userId },
          _sum: { amountCents: true },
        });
        return {
          code: item.code,
          endsAt: (existente?.endsAt ?? agora).toISOString(),
          balanceCents: soma._sum.amountCents ?? 0,
          repeated: true,
        };
      }

      const soma = await tx.rewardLedger.aggregate({
        where: { userId },
        _sum: { amountCents: true },
      });
      const saldo = soma._sum.amountCents ?? 0;
      if (saldo < item.priceCents) {
        throw new HttpException(erro('REWARD_NO_BALANCE'), HttpStatus.BAD_REQUEST);
      }

      await tx.rewardLedger.create({
        data: { userId, amountCents: -item.priceCents, reason: 'PURCHASE', refId },
      });

      const base = existente && existente.endsAt > agora ? existente.endsAt : agora;
      const fim = new Date(base.getTime() + item.days * UM_DIA);

      await tx.rewardBenefit.upsert({
        where: { userId_code: { userId, code: item.code } },
        create: { userId, code: item.code, startsAt: agora, endsAt: fim },
        update: { endsAt: fim },
      });

      return {
        code: item.code,
        endsAt: fim.toISOString(),
        balanceCents: saldo - item.priceCents,
        repeated: false,
      };
    });
  }

  /**
   * Frase do extrato.
   *
   * O marco é descrito pelo índice, não pela quantidade de notas: a regra pode
   * ter mudado desde o dia do crédito, e o extrato não pode mentir sobre o
   * passado para caber na configuração de hoje.
   */
  private descrever(reason: string, refId: string | null): string {
    if (reason === 'MILESTONE') {
      const indice = refId?.split(':')[1] ?? '?';
      return `Marco ${indice} de notas lidas`;
    }

    if (reason === 'PURCHASE') {
      const item = itemDaLoja(refId?.split(':')[0] ?? '');
      return item ? item.name : 'Compra no app';
    }

    return 'Ajuste';
  }
}
