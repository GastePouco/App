import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Números do painel.
 *
 * Duas regras que decidem o que entra aqui:
 *
 * **Métrica que ninguém usa para decidir não entra.** Painel cheio de número
 * bonito vira papel de parede: em duas semanas ninguém olha, e aí o número que
 * importava passa despercebido junto com o resto.
 *
 * **Nenhum número identifica pessoa.** Contagem agregada, série por dia, nada
 * de "quem leu mais notas". Quem precisa achar uma pessoa tem a busca por
 * e-mail exato, que é outra coisa e fica registrada (docs/09-SEGURANCA-LGPD.md).
 */
@Injectable()
export class MetricasService {
  constructor(private readonly prisma: PrismaService) {}

  async painel() {
    const agora = new Date();
    const trintaDias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const seteDias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      pessoas,
      pausadas,
      encerrando,
      notasPorEstado,
      notasNoMes,
      observacoes,
      produtos,
      semGtin,
      lojas,
      ofertasNoAr,
      contribuintes,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'PAUSED' } }),
      this.prisma.user.count({ where: { status: 'PENDING_DELETION' } }),
      this.prisma.receipt.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.receipt.count({ where: { createdAt: { gte: trintaDias } } }),
      this.prisma.priceObservation.count(),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { gtin: null } }),
      this.prisma.store.count(),
      this.prisma.offer.count({ where: { startsAt: { lte: agora }, endsAt: { gte: agora } } }),
      // Pessoas distintas que contribuíram com preço na semana. É o número que
      // diz se a base de preços está viva — nota lida não basta se vem sempre
      // das mesmas três pessoas.
      this.prisma.priceObservation
        .findMany({
          where: { observedAt: { gte: seteDias } },
          select: { userHash: true },
          distinct: ['userHash'],
        })
        .then((linhas) => linhas.length),
    ]);

    const porEstado = Object.fromEntries(
      notasPorEstado.map((linha) => [linha.status, linha._count._all]),
    );

    const lidas = porEstado.DONE ?? 0;
    const falhas =
      (porEstado.PARSE_FAILED ?? 0) + (porEstado.PORTAL_UNAVAILABLE ?? 0) + (porEstado.NEEDS_QR ?? 0);

    return {
      pessoas: { total: pessoas, pausadas, encerrando },
      notas: {
        porEstado,
        noMes: notasNoMes,
        // A taxa de sucesso é o que revela parser quebrado antes de alguém
        // reclamar (meta de 90% em docs/01-PRD.md).
        taxaDeSucesso: lidas + falhas === 0 ? null : Math.round((lidas / (lidas + falhas)) * 100),
      },
      precos: { observacoes, contribuintesNaSemana: contribuintes },
      catalogo: { produtos, semGtin, lojas },
      ofertas: { noAr: ofertasNoAr },
      serie: await this.notasPorDia(14),
    };
  }

  /** Série de notas por dia, para ver queda antes de virar reclamação. */
  private async notasPorDia(dias: number) {
    const desde = new Date();
    desde.setUTCHours(0, 0, 0, 0);
    desde.setUTCDate(desde.getUTCDate() - (dias - 1));

    const notas = await this.prisma.receipt.findMany({
      where: { createdAt: { gte: desde } },
      select: { createdAt: true, status: true },
    });

    const porDia = new Map<string, { lidas: number; falhas: number }>();
    for (let i = 0; i < dias; i++) {
      const dia = new Date(desde);
      dia.setUTCDate(desde.getUTCDate() + i);
      porDia.set(dia.toISOString().slice(0, 10), { lidas: 0, falhas: 0 });
    }

    for (const nota of notas) {
      const chave = nota.createdAt.toISOString().slice(0, 10);
      const linha = porDia.get(chave);
      if (!linha) continue;
      if (nota.status === 'DONE') linha.lidas += 1;
      else if (nota.status !== 'PENDING') linha.falhas += 1;
    }

    return [...porDia.entries()].map(([dia, valores]) => ({ dia, ...valores }));
  }
}
