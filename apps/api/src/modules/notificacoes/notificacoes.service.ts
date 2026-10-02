import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PreferenciasService } from '../conta/preferencias.service.js';

export type TipoDeNotificacao =
  | 'PRICE_DROP'
  | 'LIST_OFFER'
  | 'SHOPPING_REMINDER'
  | 'RANKING'
  | 'LEVEL_UP'
  | 'STREAK_RISK'
  | 'WEEKLY_SUMMARY'
  | 'SPONSORED'
  | 'ACCOUNT'
  | 'REWARD';

/** Qual interruptor manda em cada tipo (tela Notificações). */
const INTERRUPTOR: Partial<Record<TipoDeNotificacao, string>> = {
  PRICE_DROP: 'notifyPriceDrop',
  LIST_OFFER: 'notifyListOffer',
  SHOPPING_REMINDER: 'notifyReminder',
  RANKING: 'notifyRanking',
  STREAK_RISK: 'notifyStreak',
  SPONSORED: 'notifySponsored',
};

/**
 * Central de notificações.
 *
 * Três filtros antes de qualquer envio, nesta ordem:
 *
 * 1. **Conta pausada não recebe nada.** Pausar é sair de vista.
 * 2. **O interruptor do tipo.** `SPONSORED` começa desligado — conteúdo pago
 *    por notificação exige consentimento ativo (docs/09-SEGURANCA-LGPD.md).
 * 3. **Horário de silêncio.** A notificação é gravada na central mesmo assim,
 *    só não vibra o celular de madrugada: guardar e não avisar é diferente de
 *    não guardar.
 *
 * `ACCOUNT` (troca de senha, aparelho novo, pedido de exclusão) ignora os
 * interruptores: é aviso de segurança, não marketing.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferencias: PreferenciasService,
  ) {}

  async criar(
    userId: string,
    dados: { type: TipoDeNotificacao; title: string; href: string },
  ): Promise<{ gravada: boolean; enviada: boolean }> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });

    if (!usuario || usuario.status !== 'ACTIVE') return { gravada: false, enviada: false };

    if (dados.type !== 'ACCOUNT') {
      const campo = INTERRUPTOR[dados.type];
      if (campo) {
        const preferencias = await this.preferencias.ler(userId);
        const ligado = (preferencias as unknown as Record<string, boolean>)[campo];
        if (ligado === false) return { gravada: false, enviada: false };
      }
    }

    await this.prisma.notification.create({
      data: { userId, type: dados.type, title: dados.title, href: dados.href },
    });

    // Em silêncio a notificação fica na central, mas não vira push.
    const calado = await this.preferencias.emSilencio(userId);
    return { gravada: true, enviada: !calado };
  }

  async listar(userId: string, tipo?: 'all' | 'prices' | 'game', cursor?: string) {
    const porAba: Record<string, TipoDeNotificacao[]> = {
      prices: ['PRICE_DROP', 'LIST_OFFER', 'SPONSORED'],
      game: ['RANKING', 'LEVEL_UP', 'STREAK_RISK', 'REWARD'],
    };

    const filtro = tipo && tipo !== 'all' ? porAba[tipo] : undefined;

    const notificacoes = await this.prisma.notification.findMany({
      where: { userId, ...(filtro ? { type: { in: filtro } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 40,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, title: true, href: true, readAt: true, createdAt: true },
    });

    // Agrupamento "Hoje" e "Esta semana" fica no web: ele conhece o fuso da
    // pessoa, o servidor só conhece UTC.
    return {
      items: notificacoes,
      unreadCount: await this.prisma.notification.count({ where: { userId, readAt: null } }),
      nextCursor: notificacoes.length === 40 ? notificacoes.at(-1)?.id : null,
    };
  }

  async marcarComoLida(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async marcarTodasComoLidas(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * Inscrição para Web Push.
   *
   * A permissão só é pedida **depois da primeira nota lida**
   * (docs/02-ARQUITETURA.md): pedir na abertura queima a única chance que o
   * navegador dá, e quem ainda não viu valor no app diz não.
   */
  async inscreverParaPush(
    userId: string,
    dados: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dados.endpoint },
      create: {
        userId,
        endpoint: dados.endpoint,
        p256dh: dados.keys.p256dh,
        auth: dados.keys.auth,
      },
      update: { userId, p256dh: dados.keys.p256dh, auth: dados.keys.auth },
    });
  }

  async cancelarPush(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** A pessoa já pode ser convidada a ligar as notificações? */
  async podePedirPermissao(userId: string): Promise<boolean> {
    const notas = await this.prisma.receipt.count({ where: { userId, status: 'DONE' } });
    if (notas === 0) return false;

    const jaInscrito = await this.prisma.pushSubscription.count({ where: { userId } });
    return jaInscrito === 0;
  }
}
