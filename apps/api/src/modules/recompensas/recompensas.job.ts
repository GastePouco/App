import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { configuracao } from '../../comum/configuracao.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RecompensasService } from './recompensas.service.js';

/**
 * Varredura noturna dos marcos pendentes (docs/18-RECOMPENSAS.md).
 *
 * O crédito normal acontece no fim da leitura da nota. Este job existe para os
 * dois casos em que ele não acontece:
 *
 * 1. **O teto do mês estourou.** O marco ficou para o ciclo seguinte, e sem uma
 *    varredura ele só sairia quando a pessoa lesse a nota seguinte — podendo
 *    ser nunca. Quem leu e tem direito recebe no dia 1, sem precisar voltar.
 * 2. **A regra mudou.** Baixar o primeiro marco de 25 para 20 notas torna
 *    elegível quem já estava parado; esperar a próxima nota seria premiar quem
 *    continua ativo e ignorar quem a campanha queria recuperar.
 *
 * Dois filtros antes do laço, porque `avaliarMarcos` faz três consultas por
 * pessoa: só conta ativa, e só quem tem notas suficientes para chegar ao
 * primeiro marco. O número de notas aqui é o bruto — a conferência exata (nota
 * que virou dado) fica no serviço, que é quem decide.
 */
@Injectable()
export class RecompensasJob {
  private readonly logger = new Logger(RecompensasJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recompensas: RecompensasService,
  ) {}

  @Cron('20 3 * * *', { name: 'rewards:pending-milestones' })
  async creditarPendentes(): Promise<void> {
    const regra = configuracao.recompensas.regra;

    try {
      const porPessoa = await this.prisma.receipt.groupBy({
        by: ['userId'],
        where: { status: 'DONE' },
        _count: { _all: true },
      });

      const candidatos = porPessoa
        .filter((linha) => linha._count._all >= regra.primeiroMarco)
        .map((linha) => linha.userId);

      if (candidatos.length === 0) return;

      const ativos = await this.prisma.user.findMany({
        where: { id: { in: candidatos }, status: 'ACTIVE' },
        select: { id: true },
      });

      let creditados = 0;
      for (const pessoa of ativos) {
        const marcos = await this.recompensas.avaliarMarcos(pessoa.id);
        creditados += marcos.length;
      }

      this.logger.log(
        `Varredura de marcos: ${ativos.length} pessoa(s) conferida(s), ${creditados} marco(s) creditado(s).`,
      );
    } catch (falha) {
      // Exceção aqui derrubaria o agendador, e as varreduras seguintes
      // parariam em silêncio — igual ao fechamento do mês.
      this.logger.error(
        'Falha na varredura de marcos pendentes.',
        falha instanceof Error ? falha.stack : String(falha),
      );
    }
  }
}
