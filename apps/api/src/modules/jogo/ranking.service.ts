import { Injectable, Logger } from '@nestjs/common';
import { chaveDoMes } from '../../comum/tempo.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RecompensasService } from '../recompensas/recompensas.service.js';

/**
 * Ranking mensal.
 *
 * Duas visões (amigos e região) × três categorias (economia, compras, pontos),
 * zerando no dia 1 (docs/07-GAMIFICACAO.md).
 *
 * Quem **não** aparece, e por quê:
 *
 * - quem desligou "Aparecer no ranking da região" — só no ranking da região;
 *   entre amigos a pessoa escolheu estar, então continua;
 * - **contas pausadas**, em qualquer visão: pausar é sair de vista, não só
 *   parar de receber notificação;
 * - contas com exclusão agendada.
 *
 * Quem desligou "Mostrar meu nome" aparece como "Economizador anônimo", com a
 * posição preservada: esconder o nome não pode custar o lugar conquistado.
 */

export type EscopoDoRanking = 'friends' | 'region';
export type CategoriaDoRanking = 'savings' | 'purchases' | 'points';

export interface LinhaDoRanking {
  userId: string;
  rank: number;
  name: string;
  level: number;
  value: number;
  isMe: boolean;
  /**
   * Selo de apoiador comprado com o saldo de recompensa
   * (docs/18-RECOMPENSAS.md). É enfeite: não entra na ordenação, não muda
   * posição, e a tela o anuncia por escrito — cor sozinha não informa nada a
   * quem usa leitor de tela.
   */
  supporter: boolean;
}

const ANONIMO = 'Economizador anônimo';

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recompensas: RecompensasService,
  ) {}

  async amigosDe(userId: string): Promise<string[]> {
    const amizades = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });

    return amizades.map((a) => (a.userAId === userId ? a.userBId : a.userAId));
  }

  private intervaloDoMes(mes: string): { de: Date; ate: Date } {
    const [ano, m] = mes.split('-').map(Number);
    return {
      de: new Date(Date.UTC(ano!, m! - 1, 1)),
      ate: new Date(Date.UTC(ano!, m!, 1)),
    };
  }

  /** Quem entra na disputa, já respeitando pausa, exclusão e privacidade. */
  private async participantes(
    userId: string,
    escopo: EscopoDoRanking,
  ): Promise<Array<{ id: string; rankingName: string; mostrarNome: boolean }>> {
    const eu = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { regionGeohash: true, status: true },
    });

    const ids =
      escopo === 'friends'
        ? [userId, ...(await this.amigosDe(userId))]
        : undefined;

    const usuarios = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(ids ? { id: { in: ids } } : {}),
        ...(escopo === 'region'
          ? { regionGeohash: eu?.regionGeohash ?? '__sem_regiao__' }
          : {}),
      },
      select: {
        id: true,
        rankingName: true,
        preferences: { select: { showInRegion: true, showName: true } },
      },
    });

    return usuarios
      .filter((usuario) => {
        // Na região, quem se desligou não aparece. Entre amigos, aparece:
        // a pessoa escolheu cada um deles.
        if (escopo === 'region' && usuario.preferences?.showInRegion === false) {
          return usuario.id === userId;
        }
        return true;
      })
      .map((usuario) => ({
        id: usuario.id,
        rankingName: usuario.rankingName,
        mostrarNome: usuario.preferences?.showName !== false,
      }));
  }

  async calcular(
    userId: string,
    escopo: EscopoDoRanking = 'friends',
    categoria: CategoriaDoRanking = 'savings',
    mes = chaveDoMes(),
  ): Promise<{ podium: LinhaDoRanking[]; rows: LinhaDoRanking[]; me: LinhaDoRanking | null }> {
    const pessoas = await this.participantes(userId, escopo);
    if (pessoas.length === 0) return { podium: [], rows: [], me: null };

    const ids = pessoas.map((p) => p.id);
    const { de, ate } = this.intervaloDoMes(mes);

    const valores = new Map<string, number>();

    if (categoria === 'points') {
      const somas = await this.prisma.pointsLedger.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, createdAt: { gte: de, lt: ate } },
        _sum: { amount: true },
      });
      for (const linha of somas) valores.set(linha.userId, linha._sum.amount ?? 0);
    } else if (categoria === 'purchases') {
      const contagens = await this.prisma.receipt.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'DONE', issuedAt: { gte: de, lt: ate } },
        _count: { _all: true },
      });
      for (const linha of contagens) valores.set(linha.userId, linha._count._all);
    } else {
      const somas = await this.prisma.receipt.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'DONE', issuedAt: { gte: de, lt: ate } },
        _sum: { savingsCents: true },
      });
      // Economia pode ser negativa numa nota; no ranking conta só o positivo
      // (docs/07-GAMIFICACAO.md).
      for (const linha of somas) valores.set(linha.userId, Math.max(linha._sum.savingsCents ?? 0, 0));
    }

    const niveis = await this.niveisDe(ids);
    const apoiadores = await this.recompensas.apoiadoresEntre(ids);

    const classificados = pessoas
      .map((pessoa) => ({
        userId: pessoa.id,
        name: pessoa.mostrarNome ? pessoa.rankingName : ANONIMO,
        level: niveis.get(pessoa.id) ?? 1,
        value: valores.get(pessoa.id) ?? 0,
        isMe: pessoa.id === userId,
        supporter: apoiadores.has(pessoa.id),
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'))
      .map((linha, indice) => ({ ...linha, rank: indice + 1 }));

    return {
      podium: classificados.slice(0, 3),
      rows: classificados.slice(3),
      me: classificados.find((linha) => linha.isMe) ?? null,
    };
  }

  /** Nível de várias pessoas de uma vez, sem uma consulta por pessoa. */
  private async niveisDe(ids: string[]): Promise<Map<string, number>> {
    const { situacaoDoNivel } = await import('@gastemenos/shared');

    const somas = await this.prisma.pointsLedger.groupBy({
      by: ['userId'],
      where: { userId: { in: ids } },
      _sum: { amount: true },
    });

    return new Map(somas.map((s) => [s.userId, situacaoDoNivel(s._sum.amount ?? 0).nivel]));
  }

  /**
   * Grava o ranking do mês para consulta rápida.
   *
   * O snapshot é cache, não fonte: a tela lê o cálculo ao vivo, porque um
   * ranking que só atualiza de hora em hora frustra quem acabou de ler uma
   * nota. O snapshot serve para fechar o mês e distribuir o selo "Lenda do
   * Mês" sem recalcular o passado.
   */
  async gravarSnapshot(
    escopo: string,
    categoria: CategoriaDoRanking,
    mes: string,
    entradas: LinhaDoRanking[],
    fechado = false,
  ): Promise<void> {
    await this.prisma.rankingSnapshot.upsert({
      where: { month_scope_category: { month: mes, scope: escopo, category: categoria } },
      create: {
        month: mes,
        scope: escopo,
        category: categoria,
        entries: entradas.map((e) => ({ userId: e.userId, rank: e.rank, value: e.value })),
        closed: fechado,
      },
      update: {
        entries: entradas.map((e) => ({ userId: e.userId, rank: e.rank, value: e.value })),
        closed: fechado,
      },
    });
  }
}
