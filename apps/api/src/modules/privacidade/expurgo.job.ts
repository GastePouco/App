import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrivacidadeService } from './privacidade.service.js';

/**
 * Expurgo diário (docs/02-ARQUITETURA.md, "Jobs agendados").
 *
 * Apaga as contas cujo prazo de 30 dias venceu, os arquivos de exportação que
 * passaram dos 7 dias e as páginas guardadas de notas que falharam há mais de
 * 30 dias. Roda às 3h, quando o uso é mínimo — apagar em
 * cascata uma conta com anos de nota é a operação mais pesada do sistema.
 */
@Injectable()
export class ExpurgoJob {
  private readonly logger = new Logger(ExpurgoJob.name);

  constructor(private readonly privacidade: PrivacidadeService) {}

  @Cron('0 3 * * *', { name: 'privacy:purge' })
  async expurgar(): Promise<void> {
    try {
      const contas = await this.privacidade.apagarVencidos();
      const arquivos = await this.privacidade.limparExportacoesVencidas();
      const paginas = await this.privacidade.limparPaginasDeDepuracao();

      this.logger.log(
        `Expurgo: ${contas} conta(s), ${arquivos} arquivo(s), ${paginas} página(s) de depuração.`,
      );
    } catch (falha) {
      // Nunca deixar subir: derrubaria o agendador e o expurgo pararia em
      // silêncio — o que é um problema de conformidade, não só um bug.
      this.logger.error(
        'Falha no expurgo diário.',
        falha instanceof Error ? falha.stack : String(falha),
      );
    }
  }
}
