import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { erro } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Contas, do lado da operação.
 *
 * Aqui mora a parte mais delicada do CRM, e ela não é técnica: **quem opera vê
 * dado de gente**. As três regras que governam este arquivo:
 *
 * 1. **Não se navega pela base de pessoas.** A busca é por **e-mail exato** —
 *    quem procura já sabe quem procura, porque a pessoa pediu ajuda. Lista
 *    paginada de todo mundo transformaria suporte em vitrine.
 * 2. **O e-mail sai mascarado** em qualquer listagem. Confirmar uma conta não
 *    exige ler o endereço inteiro.
 * 3. **Toda consulta a uma conta fica registrada**, não só a alteração. Saber
 *    quem *olhou* é metade da proteção; a outra metade é as pessoas saberem
 *    que é registrado.
 */
@Injectable()
export class PessoasService {
  private readonly logger = new Logger(PessoasService.name);

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

  /** `maria.silva@exemplo.com` → `ma•••@exemplo.com`. */
  private mascarar(email: string): string {
    const [usuario, dominio] = email.split('@');
    if (!usuario || !dominio) return '•••';
    return `${usuario.slice(0, 2)}•••@${dominio}`;
  }

  /**
   * Busca por e-mail exato. Sem correspondência parcial, de propósito.
   *
   * `contains` deixaria alguém digitar "@gmail" e receber metade da base.
   */
  async porEmail(adminId: string, email: string) {
    const pessoa = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        pausedUntil: true,
        deletionAt: true,
        createdAt: true,
        regionGeohash: true,
        _count: { select: { receipts: true, points: true } },
      },
    });

    if (!pessoa) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    await this.registrar(adminId, 'user.read', pessoa.id, { motivo: 'busca por e-mail' });

    return {
      id: pessoa.id,
      email: this.mascarar(pessoa.email),
      nome: pessoa.name,
      papel: pessoa.role,
      estado: pessoa.status,
      pausadaAte: pessoa.pausedUntil,
      exclusaoEm: pessoa.deletionAt,
      criadaEm: pessoa.createdAt,
      regiao: pessoa.regionGeohash,
      notas: pessoa._count.receipts,
      lancamentosDePontos: pessoa._count.points,
    };
  }

  /**
   * Contas que precisam de atenção da operação: exclusão agendada e pausa com
   * prazo vencido. Não é "lista de usuários" — é fila de trabalho.
   */
  async fila(adminId: string) {
    const contas = await this.prisma.user.findMany({
      where: {
        OR: [
          { status: 'PENDING_DELETION' },
          { status: 'PAUSED', pausedUntil: { lte: new Date() } },
        ],
      },
      select: {
        id: true,
        email: true,
        status: true,
        pausedUntil: true,
        deletionAt: true,
      },
      orderBy: { deletionAt: 'asc' },
      take: 100,
    });

    await this.registrar(adminId, 'user.queue.read', 'fila', { total: contas.length });

    return contas.map((conta) => ({
      id: conta.id,
      email: this.mascarar(conta.email),
      estado: conta.status,
      pausadaAte: conta.pausedUntil,
      exclusaoEm: conta.deletionAt,
    }));
  }

  /**
   * Muda o papel de alguém.
   *
   * O admin **não pode tirar o próprio papel**: com uma conta de admin só, isso
   * tranca todo mundo para fora do painel, e destrancar exige acesso ao banco.
   */
  async mudarPapel(adminId: string, id: string, papel: 'USER' | 'ADMIN') {
    if (adminId === id && papel === 'USER') {
      throw new HttpException(
        {
          code: 'VALIDATION_FAILED',
          message: 'Você não pode tirar o próprio acesso de admin. Peça a outra pessoa.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const pessoa = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!pessoa) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    await this.prisma.user.update({ where: { id }, data: { role: papel } });
    await this.registrar(adminId, 'user.role', id, { de: pessoa.role, para: papel });

    this.logger.warn(`Papel de ${id} mudou de ${pessoa.role} para ${papel}.`);
    return { id, papel };
  }

  /** A trilha, que só serve se alguém puder lê-la. */
  async auditoria(limite = 100, acao?: string) {
    const registros = await this.prisma.adminLog.findMany({
      where: acao ? { action: acao } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(limite, 500),
    });

    const admins = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(registros.map((r) => r.adminId))] } },
      select: { id: true, name: true },
    });
    const nomes = new Map(admins.map((a) => [a.id, a.name]));

    return registros.map((registro) => ({
      id: registro.id,
      quando: registro.createdAt,
      // A conta pode já ter sido encerrada: a trilha sobrevive a ela de
      // propósito, então o nome pode faltar e o id fica.
      quem: nomes.get(registro.adminId) ?? '(conta encerrada)',
      quemId: registro.adminId,
      acao: registro.action,
      alvo: registro.target,
      detalhes: registro.details,
    }));
  }
}
