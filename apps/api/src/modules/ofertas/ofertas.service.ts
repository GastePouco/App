import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LIMITES, PONTOS, erro, regiaoDoGeohash } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PontosService } from '../jogo/pontos.service.js';
import { RecompensasService } from '../recompensas/recompensas.service.js';

/**
 * Ofertas.
 *
 * Duas fontes que **não** se misturam:
 *
 * - **Patrocinada**: parceiro pagou. Leva `sponsored: true` e a tela é
 *   obrigada a mostrar o selo "Patrocinado" (docs/09, "Transparência").
 * - **Da comunidade**: queda de preço detectada nas notas lidas. Ninguém
 *   pagou para aparecer.
 *
 * O `sponsored` sai em toda resposta, sempre, e no máximo **uma patrocinada
 * por página** — misturar cinco anúncios com dois preços reais faria a tela
 * ser um encarte, não uma ferramenta.
 */
@Injectable()
export class OfertasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pontos: PontosService,
    private readonly recompensas: RecompensasService,
  ) {}

  async listar(
    userId: string,
    filtros: { category?: string; onlyMyList?: boolean; q?: string } = {},
  ) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { regionGeohash: true, preferences: { select: { notifySponsored: true } } },
    });

    const regiao = usuario?.regionGeohash ? regiaoDoGeohash(usuario.regionGeohash) : [];
    const agora = new Date();

    // Quem comprou "sem ofertas patrocinadas" com o saldo de recompensa não vê
    // anúncio nenhum — nem com selo (docs/18-RECOMPENSAS.md). Some antes da
    // consulta, não na hora de montar a resposta: oferta não mostrada não pode
    // contar impressão, senão o parceiro paga por quem nunca viu.
    const semPatrocinio = await this.recompensas.beneficioAtivo(userId, 'SEM_PATROCINIO');

    const patrocinadas = regiao.length && !semPatrocinio
      ? await this.prisma.offer.findMany({
          where: {
            sponsored: true,
            startsAt: { lte: agora },
            endsAt: { gte: agora },
            geohashes: { hasSome: regiao },
            ...(filtros.q ? { title: { contains: filtros.q, mode: 'insensitive' } } : {}),
          },
          // Uma só por página, como manda docs/04-API.md.
          take: 1,
          orderBy: { startsAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            priceCents: true,
            sponsored: true,
            product: { select: { id: true, displayName: true } },
            store: { select: { id: true, name: true } },
            partner: { select: { name: true } },
          },
        })
      : [];

    const comunitarias = await this.quedasDePreco(userId, filtros);

    // Uma impressão por oferta mostrada: é o que o parceiro compra.
    if (patrocinadas.length) {
      await this.prisma.offer.updateMany({
        where: { id: { in: patrocinadas.map((o) => o.id) } },
        data: { impressions: { increment: 1 } },
      });
    }

    return {
      sponsored: patrocinadas.map((oferta) => ({
        ...oferta,
        // Redundante com o campo do banco, e de propósito: quem consumir esta
        // API não consegue receber uma oferta paga sem saber que é paga.
        sponsored: true,
        sponsorName: oferta.partner?.name ?? null,
      })),
      community: comunitarias,
    };
  }

  /**
   * Quedas de preço nos produtos que a pessoa compra.
   *
   * Compara a média dos últimos 7 dias com a dos 30 anteriores, na região.
   * Só entra queda de 5% ou mais: variação de centavos não é notícia e encheria
   * a tela de ruído.
   */
  private async quedasDePreco(
    userId: string,
    filtros: { category?: string; onlyMyList?: boolean; q?: string },
  ) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { regionGeohash: true },
    });
    if (!usuario?.regionGeohash) return [];

    const regiao = regiaoDoGeohash(usuario.regionGeohash);

    const meusProdutos = filtros.onlyMyList
      ? (
          await this.prisma.shoppingListItem.findMany({
            where: { list: { userId } },
            select: { productId: true },
          })
        )
          .map((item) => item.productId)
          .filter((id): id is string => Boolean(id))
      : (
          await this.prisma.receiptItem.findMany({
            where: { receipt: { userId, status: 'DONE' } },
            select: { productId: true },
            distinct: ['productId'],
            take: 80,
          })
        )
          .map((item) => item.productId)
          .filter((id): id is string => Boolean(id));

    if (meusProdutos.length === 0) return [];

    const hoje = new Date();
    const seteDias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    const trintaEsete = new Date(hoje.getTime() - 37 * 24 * 60 * 60 * 1000);

    const observacoes = await this.prisma.priceObservation.findMany({
      where: {
        productId: { in: meusProdutos },
        geohash: { in: regiao },
        observedAt: { gte: trintaEsete },
      },
      select: {
        productId: true,
        unitPriceCents: true,
        observedAt: true,
        store: { select: { id: true, name: true } },
        product: {
          select: { id: true, displayName: true, category: { select: { slug: true } } },
        },
      },
    });

    const porProduto = new Map<
      string,
      {
        nome: string;
        categoria: string | null;
        recentes: number[];
        antigos: number[];
        melhorLoja: { id: string; nome: string; preco: number } | null;
      }
    >();

    for (const observacao of observacoes) {
      const atual = porProduto.get(observacao.productId) ?? {
        nome: observacao.product.displayName,
        categoria: observacao.product.category?.slug ?? null,
        recentes: [],
        antigos: [],
        melhorLoja: null,
      };

      if (observacao.observedAt >= seteDias) {
        atual.recentes.push(observacao.unitPriceCents);
        if (!atual.melhorLoja || observacao.unitPriceCents < atual.melhorLoja.preco) {
          atual.melhorLoja = {
            id: observacao.store.id,
            nome: observacao.store.name,
            preco: observacao.unitPriceCents,
          };
        }
      } else {
        atual.antigos.push(observacao.unitPriceCents);
      }

      porProduto.set(observacao.productId, atual);
    }

    const quedas = [];

    for (const [productId, dados] of porProduto) {
      if (filtros.category && dados.categoria !== filtros.category) continue;
      if (filtros.q && !dados.nome.toLowerCase().includes(filtros.q.toLowerCase())) continue;

      // Precisa de amostra dos dois lados, senão não há comparação.
      if (dados.recentes.length < 3 || dados.antigos.length < 3) continue;

      const media = (valores: number[]): number =>
        Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);

      const agora = media(dados.recentes);
      const antes = media(dados.antigos);
      const queda = Math.round(((agora - antes) / antes) * 100);

      if (queda > -5) continue;

      quedas.push({
        productId,
        name: dados.nome,
        nowCents: agora,
        beforeCents: antes,
        dropPercent: Math.abs(queda),
        cheapestStore: dados.melhorLoja
          ? { id: dados.melhorLoja.id, name: dados.melhorLoja.nome, priceCents: dados.melhorLoja.preco }
          : null,
        sponsored: false,
      });
    }

    return quedas.sort((a, b) => b.dropPercent - a.dropPercent).slice(0, 12);
  }

  async registrarClique(offerId: string): Promise<void> {
    await this.prisma.offer.updateMany({
      where: { id: offerId },
      data: { clicks: { increment: 1 } },
    });
  }

  /**
   * "O preço está certo?" — vale 10 pontos, até 5 por dia.
   *
   * O limite não é implicância: sem ele, confirmar preços viraria a forma mais
   * barata de subir no ranking, e o valor da confirmação (dizer que o preço
   * está certo) desapareceria (docs/07-GAMIFICACAO.md).
   */
  async confirmarPreco(userId: string, offerId: string) {
    const oferta = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true },
    });
    if (!oferta) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const inicioDoDia = new Date();
    inicioDoDia.setUTCHours(0, 0, 0, 0);

    const hoje = await this.prisma.pointsLedger.count({
      where: { userId, reason: 'OFFER_CONFIRM', createdAt: { gte: inicioDoDia } },
    });

    if (hoje >= LIMITES.CONFIRMACOES_DE_PRECO_POR_DIA) {
      return { pointsAwarded: 0, limitReached: true };
    }

    await this.prisma.offer.update({
      where: { id: offerId },
      data: { confirmations: { increment: 1 } },
    });

    const { creditado, levelUp } = await this.pontos.creditar(
      userId,
      PONTOS.CONFIRMAR_PRECO,
      'OFFER_CONFIRM',
      offerId,
    );

    return {
      pointsAwarded: creditado ? PONTOS.CONFIRMAR_PRECO : 0,
      limitReached: false,
      levelUp,
    };
  }
}
