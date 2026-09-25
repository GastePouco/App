import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { erro } from '@gastemenos/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ArmazenamentoService } from '../armazenamento/armazenamento.service.js';
import type { CriarOfertaDto, CriarParceiroDto, EditarOfertaDto } from './dto/admin.dto.js';

/**
 * Operação do dia a dia: ofertas patrocinadas, parceiros e triagem de leitura.
 *
 * Duas regras valem em tudo que está aqui:
 *
 * 1. **Toda ação fica registrada** em `AdminLog`, com quem, o quê e quando.
 *    Quem entra aqui mexe em dado que aparece para outras pessoas; "quem apagou
 *    isso?" precisa ter resposta.
 * 2. **Oferta com parceiro é patrocinada, e ponto.** O selo não é uma caixinha
 *    que alguém marca ou desmarca: se há parceiro pagando, `sponsored` é
 *    verdadeiro. Deixar isso no arbítrio de quem cadastra é como o selo
 *    desaparece na prática (docs/09-SEGURANCA-LGPD.md, "Transparência").
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly armazenamento: ArmazenamentoService,
  ) {}

  private async registrar(
    adminId: string,
    action: string,
    target?: string,
    details?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.adminLog.create({
      data: { adminId, action, target: target ?? null, details },
    });
  }

  // ------------------------------------------------------------ parceiros

  async listarParceiros() {
    return this.prisma.partner.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, cnpj: true, active: true, _count: { select: { offers: true } } },
    });
  }

  async criarParceiro(adminId: string, dados: CriarParceiroDto) {
    const parceiro = await this.prisma.partner.create({
      data: { name: dados.name, cnpj: dados.cnpj, active: dados.active ?? true },
      select: { id: true, name: true, cnpj: true, active: true },
    });

    await this.registrar(adminId, 'partner.create', parceiro.id, { name: parceiro.name });
    return parceiro;
  }

  // -------------------------------------------------------------- ofertas

  async listarOfertas() {
    return this.prisma.offer.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        sponsored: true,
        priceCents: true,
        geohashes: true,
        startsAt: true,
        endsAt: true,
        impressions: true,
        clicks: true,
        confirmations: true,
        partner: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        product: { select: { id: true, displayName: true } },
      },
    });
  }

  async criarOferta(adminId: string, dados: CriarOfertaDto) {
    this.conferirPeriodo(dados.startsAt, dados.endsAt);

    if (dados.partnerId) {
      const parceiro = await this.prisma.partner.findUnique({ where: { id: dados.partnerId } });
      if (!parceiro) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);
    }

    const oferta = await this.prisma.offer.create({
      data: {
        title: dados.title,
        description: dados.description ?? null,
        partnerId: dados.partnerId ?? null,
        productId: dados.productId ?? null,
        storeId: dados.storeId ?? null,
        priceCents: dados.priceCents ?? null,
        geohashes: dados.geohashes,
        startsAt: new Date(dados.startsAt),
        endsAt: new Date(dados.endsAt),
        // Quem paga, aparece marcado. Não é escolha de quem cadastra.
        sponsored: Boolean(dados.partnerId),
      },
      select: { id: true, title: true, sponsored: true },
    });

    await this.registrar(adminId, 'offer.create', oferta.id, { title: oferta.title });
    return oferta;
  }

  async editarOferta(adminId: string, id: string, dados: EditarOfertaDto) {
    const atual = await this.prisma.offer.findUnique({ where: { id } });
    if (!atual) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const inicio = dados.startsAt ?? atual.startsAt.toISOString();
    const fim = dados.endsAt ?? atual.endsAt.toISOString();
    this.conferirPeriodo(inicio, fim);

    const oferta = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dados.title !== undefined ? { title: dados.title } : {}),
        ...(dados.description !== undefined ? { description: dados.description } : {}),
        ...(dados.priceCents !== undefined ? { priceCents: dados.priceCents } : {}),
        ...(dados.geohashes !== undefined ? { geohashes: dados.geohashes } : {}),
        ...(dados.startsAt !== undefined ? { startsAt: new Date(dados.startsAt) } : {}),
        ...(dados.endsAt !== undefined ? { endsAt: new Date(dados.endsAt) } : {}),
        ...(dados.partnerId !== undefined
          ? { partnerId: dados.partnerId, sponsored: Boolean(dados.partnerId) }
          : {}),
      },
      select: { id: true, title: true, sponsored: true },
    });

    await this.registrar(adminId, 'offer.update', id, { campos: Object.keys(dados) });
    return oferta;
  }

  async excluirOferta(adminId: string, id: string): Promise<void> {
    const oferta = await this.prisma.offer.findUnique({ where: { id }, select: { title: true } });
    if (!oferta) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    await this.prisma.offer.delete({ where: { id } });
    await this.registrar(adminId, 'offer.delete', id, { title: oferta.title });
  }

  private conferirPeriodo(inicio: string, fim: string): void {
    if (new Date(fim).getTime() <= new Date(inicio).getTime()) {
      throw new HttpException(
        { code: 'VALIDATION_FAILED', message: 'A oferta precisa terminar depois de começar.' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ------------------------------------------------------ triagem de notas

  /**
   * Notas que a leitura não conseguiu interpretar.
   *
   * Sem a chave de acesso e sem nome de pessoa: o que interessa aqui é o
   * formato da página que quebrou, não quem leu a nota.
   */
  async notasQueFalharam(limite = 50) {
    const notas = await this.prisma.receipt.findMany({
      where: { status: { in: ['PARSE_FAILED', 'PORTAL_UNAVAILABLE', 'NEEDS_QR'] } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limite, 200),
      select: {
        id: true,
        status: true,
        failureReason: true,
        source: true,
        createdAt: true,
        rawStorageKey: true,
        accessKey: true,
      },
    });

    return notas.map((nota) => ({
      id: nota.id,
      status: nota.status,
      failureReason: nota.failureReason,
      source: nota.source,
      createdAt: nota.createdAt,
      uf: nota.accessKey.slice(0, 2),
      temPagina: Boolean(nota.rawStorageKey),
    }));
  }

  /** A página guardada, para quem for corrigir o parser. */
  async paginaDaNota(adminId: string, id: string): Promise<string> {
    const nota = await this.prisma.receipt.findUnique({
      where: { id },
      select: { rawStorageKey: true },
    });

    if (!nota?.rawStorageKey) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    await this.registrar(adminId, 'receipt.html.read', id);
    return (await this.armazenamento.ler(nota.rawStorageKey)).toString('utf8');
  }
}
