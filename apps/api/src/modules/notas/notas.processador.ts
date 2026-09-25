import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { lerChaveDeAcesso } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotasService } from './notas.service.js';
import { BuscadorService } from './buscador.service.js';
import { RegistroDeAdaptadores } from './adaptadores/registro.js';
import { ErroDeLeitura } from './adaptadores/adaptador.js';
import { conferirHost } from './hosts.js';

export const FILA_DE_NOTAS = 'notas';

export interface TarefaDeLeitura {
  notaId: string;
  chave: string;
  qrUrl?: string;
}

/**
 * Consome a fila de leitura de notas.
 *
 * A leitura é assíncrona porque depende de um portal de terceiro que pode
 * demorar ou estar fora do ar — e a pessoa não pode ficar com a tela travada
 * esperando a SEFAZ. O app acompanha por SSE ou polling
 * (docs/02-ARQUITETURA.md).
 *
 * Erros de portal (`PORTAL_UNAVAILABLE`) sobem de novo para a fila tentar
 * outra vez; erros de interpretação (`PARSE_FAILED`) não, porque tentar de
 * novo com o mesmo HTML dá o mesmo resultado e só gasta visita ao portal.
 */
@Injectable()
@Processor(FILA_DE_NOTAS, { concurrency: 2 })
export class NotasProcessador extends WorkerHost {
  private readonly logger = new Logger(NotasProcessador.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notas: NotasService,
    private readonly buscador: BuscadorService,
    private readonly adaptadores: RegistroDeAdaptadores,
  ) {
    super();
  }

  async process(tarefa: Job<TarefaDeLeitura>): Promise<void> {
    const { notaId, chave, qrUrl } = tarefa.data;

    const leitura = lerChaveDeAcesso(chave);
    if (!leitura.ok) {
      await this.notas.marcarFalha(notaId, new ErroDeLeitura('PARSE_FAILED', 'Chave inválida.'));
      return;
    }

    const adaptador = this.adaptadores.para(leitura.chave.uf);
    if (!adaptador) {
      await this.notas.marcarFalha(notaId, new ErroDeLeitura('PARSE_FAILED', 'UF sem adaptador.'));
      return;
    }

    try {
      // A URL do QR é preferida: ela já vem com o hash assinado pelo emissor,
      // que é o que o portal confere. A consulta pela chave digitada nem sempre
      // existe — no DF, não existe.
      const url = adaptador.urlDaConsulta(chave, qrUrl);

      if (!url) {
        throw new ErroDeLeitura(
          'NEEDS_QR',
          `Em ${adaptador.uf} a consulta pela chave digitada exige verificação humana; o QR passa direto.`,
        );
      }

      // O buscador confere o host de novo, e a cada redirecionamento.
      conferirHost(url, adaptador.hostsPermitidos, adaptador.uf);

      const html = await this.buscador.buscar(
        url,
        chave,
        adaptador.uf,
        adaptador.hostsPermitidos,
      );

      const lida = adaptador.interpretar(html, chave);
      await this.notas.concluir(notaId, lida);

      this.logger.log(`Nota ${notaId} lida: ${lida.items.length} itens.`);
    } catch (falha) {
      if (falha instanceof ErroDeLeitura) {
        await this.notas.marcarFalha(notaId, falha);

        // Portal fora do ar volta para a fila; HTML ilegível não.
        if (falha.motivo === 'PORTAL_UNAVAILABLE') throw falha;
        return;
      }

      this.logger.error(
        `Falha inesperada na nota ${notaId}`,
        falha instanceof Error ? falha.stack : String(falha),
      );
      await this.notas.marcarFalha(notaId, new ErroDeLeitura('PARSE_FAILED'));
    }
  }
}
