import { Global, Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { RecompensasService } from './recompensas.service.js';
import { RecompensasController } from './recompensas.controller.js';
import { RecompensasJob } from './recompensas.job.js';

/**
 * Global pelo mesmo motivo do módulo de jogo: a leitura da nota credita o
 * marco, a tela de ofertas confere se a pessoa comprou "sem patrocínio" e o
 * ranking confere o selo de apoiador. Importar em cada um seria ruído.
 *
 * A dependência é de mão única — recompensas não conhece nota, oferta nem
 * ranking.
 */
@Global()
@Module({
  // A notificação do marco sai por aqui: é o único aviso que a pessoa recebe se
  // fechar o app antes da tela de resultado.
  imports: [NotificacoesModule],
  controllers: [RecompensasController],
  providers: [RecompensasService, RecompensasJob],
  exports: [RecompensasService],
})
export class RecompensasModule {}
