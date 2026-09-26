import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { erro } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Catálogo de produtos: revisão e correção.
 *
 * Este é o módulo do CRM que mais muda o produto para quem usa o app. O
 * casamento de produto é o ponto de que todo o resto depende: se "ARROZ TIPO 1
 * 5KG" e "ARR T1 5 KG" viram dois produtos, a média da região é calculada sobre
 * metade das notas e a tela de preços mente com cara de certeza.
 *
 * O importador acerta a maioria e erra a minoria — e é exatamente a minoria que
 * precisa de gente olhando. Daí a fila de revisão.
 */
@Injectable()
export class CatalogoService {
  private readonly logger = new Logger(CatalogoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async registrar(
    adminId: string,
    action: string,
    target: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.adminLog.create({
      data: { adminId, action, target, details: details as never },
    });
  }

  /**
   * Produtos que merecem olho humano, em ordem de impacto.
   *
   * Impacto = quantas observações de preço dependem daquele produto. Corrigir
   * um produto com 300 observações conserta 300 números; corrigir um com 2
   * conserta 2. Fila ordenada por outra coisa faria a pessoa gastar o dia no
   * lugar errado.
   */
  async paraRevisar(limite = 50) {
    const produtos = await this.prisma.product.findMany({
      where: {
        OR: [
          { gtin: null },
          { categoryId: null },
          { category: { slug: 'outros' } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        normalizedName: true,
        gtin: true,
        category: { select: { slug: true, name: true } },
        _count: { select: { observations: true, aliases: true } },
      },
      take: Math.min(limite, 200),
    });

    const comMotivo = produtos.map((produto) => ({
      id: produto.id,
      displayName: produto.displayName,
      normalizedName: produto.normalizedName,
      gtin: produto.gtin,
      categoria: produto.category?.slug ?? null,
      observacoes: produto._count.observations,
      apelidos: produto._count.aliases,
      motivos: [
        produto.gtin ? null : 'sem GTIN',
        produto.category ? null : 'sem categoria',
        produto.category?.slug === 'outros' ? 'categoria "outros"' : null,
      ].filter((motivo): motivo is string => motivo !== null),
    }));

    return comMotivo.sort((a, b) => b.observacoes - a.observacoes);
  }

  /**
   * Prováveis duplicados: produtos cujo nome normalizado começa igual.
   *
   * Heurística simples de propósito. Comparação por similaridade de verdade
   * pediria `pg_trgm`, e a decisão final é humana de qualquer jeito — o que a
   * máquina precisa fazer aqui é **levantar o candidato**, não decidir.
   */
  async possiveisDuplicados(limite = 30) {
    const produtos = await this.prisma.product.findMany({
      select: {
        id: true,
        displayName: true,
        normalizedName: true,
        gtin: true,
        _count: { select: { observations: true } },
      },
      take: 2000,
    });

    const porAssinatura = new Map<string, typeof produtos>();

    for (const produto of produtos) {
      // Duas primeiras palavras + o primeiro número com unidade. "arroz tipo 1
      // 5 kg" e "arroz tipo1 5kg" caem na mesma assinatura.
      const palavras = produto.normalizedName.split(' ').filter(Boolean);
      const medida = produto.normalizedName.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|un)\b/);
      const assinatura = `${palavras.slice(0, 2).join(' ')}|${medida ? `${medida[1]}${medida[2]}` : ''}`;

      const grupo = porAssinatura.get(assinatura) ?? [];
      grupo.push(produto);
      porAssinatura.set(assinatura, grupo);
    }

    return [...porAssinatura.entries()]
      .filter(([, grupo]) => grupo.length > 1)
      // GTIN diferente é sinal de que são produtos diferentes mesmo.
      .filter(([, grupo]) => new Set(grupo.map((p) => p.gtin).filter(Boolean)).size <= 1)
      .slice(0, limite)
      .map(([assinatura, grupo]) => ({
        assinatura,
        produtos: grupo
          .map((p) => ({
            id: p.id,
            displayName: p.displayName,
            gtin: p.gtin,
            observacoes: p._count.observations,
          }))
          .sort((a, b) => b.observacoes - a.observacoes),
      }));
  }

  async corrigir(
    adminId: string,
    id: string,
    dados: { displayName?: string; categorySlug?: string; gtin?: string | null },
  ) {
    const atual = await this.prisma.product.findUnique({ where: { id } });
    if (!atual) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    let categoryId: string | undefined;
    if (dados.categorySlug) {
      const categoria = await this.prisma.category.findUnique({
        where: { slug: dados.categorySlug },
        select: { id: true },
      });
      if (!categoria) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);
      categoryId = categoria.id;
    }

    const produto = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dados.displayName ? { displayName: dados.displayName } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(dados.gtin !== undefined ? { gtin: dados.gtin } : {}),
      },
      select: { id: true, displayName: true, gtin: true, category: { select: { slug: true } } },
    });

    await this.registrar(adminId, 'product.update', id, { campos: Object.keys(dados) });
    return produto;
  }

  /**
   * Funde dois produtos: tudo do `deId` passa para o `paraId`.
   *
   * **Separar depois é fácil; desfazer uma fusão errada não é** — por isso a
   * fusão é explícita, feita por gente, numa transação, e registrada com os dois
   * ids. O mesmo cuidado que o casamento automático tem ao preferir criar
   * produto novo em vez de juntar dois parecidos.
   */
  async fundir(adminId: string, paraId: string, deId: string) {
    if (paraId === deId) {
      throw new HttpException(
        { code: 'VALIDATION_FAILED', message: 'Escolha dois produtos diferentes.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const [destino, origem] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: paraId }, select: { id: true, displayName: true } }),
      this.prisma.product.findUnique({ where: { id: deId }, select: { id: true, displayName: true } }),
    ]);

    if (!destino || !origem) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const movidos = await this.prisma.$transaction(async (tx) => {
      const itens = await tx.receiptItem.updateMany({
        where: { productId: deId },
        data: { productId: paraId },
      });
      const observacoes = await tx.priceObservation.updateMany({
        where: { productId: deId },
        data: { productId: paraId },
      });
      await tx.productAlias.updateMany({ where: { productId: deId }, data: { productId: paraId } });
      await tx.shoppingListItem.updateMany({ where: { productId: deId }, data: { productId: paraId } });
      await tx.priceAlert.updateMany({ where: { productId: deId }, data: { productId: paraId } });
      await tx.offer.updateMany({ where: { productId: deId }, data: { productId: paraId } });

      // As estatísticas do produto antigo saem: elas serão recalculadas para o
      // destino no próximo ciclo do job. Mantê-las seria publicar dois preços
      // para o mesmo produto.
      await tx.priceStat.deleteMany({ where: { productId: deId } });
      await tx.product.delete({ where: { id: deId } });

      return { itens: itens.count, observacoes: observacoes.count };
    });

    await this.registrar(adminId, 'product.merge', paraId, {
      de: deId,
      nomeDeOrigem: origem.displayName,
      ...movidos,
    });

    this.logger.log(`Produto ${deId} fundido em ${paraId}: ${movidos.observacoes} observações.`);
    return { destino: destino.id, ...movidos };
  }
}
