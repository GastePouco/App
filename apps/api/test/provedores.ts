import type { Provider } from '@nestjs/common';
import { RecompensasService } from '../src/modules/recompensas/recompensas.service.js';
import { NotificacoesService } from '../src/modules/notificacoes/notificacoes.service.js';

/**
 * Recompensa como dependência de outros serviços.
 *
 * Ofertas, ranking e leitura de nota passaram a consultar a recompensa — oferta
 * patrocinada some para quem comprou "sem patrocínio", o ranking mostra o selo
 * de apoiador, a nota lida credita o marco. Quem monta esses serviços num teste
 * precisa deste par, e repetir o dublê em quatro arquivos é como um dia ele
 * diverge em um só.
 *
 * O dublê é só o da notificação: ela não é o objeto de nenhum desses testes, e
 * ligar o serviço real arrastaria preferências e push para dentro de um teste
 * de ranking.
 *
 * **Quem testa notificação não usa esta função.** O dublê é registrado por
 * último e sobrescreve o `NotificacoesService` de verdade — em `conta.spec.ts`
 * isso derrubou quatro testes que estavam certos. Lá entra só o
 * `RecompensasService`.
 */
export function provedoresDeRecompensa(): Provider[] {
  return [
    RecompensasService,
    {
      provide: NotificacoesService,
      useValue: { criar: async () => ({ gravada: true, enviada: false }) },
    },
  ];
}
