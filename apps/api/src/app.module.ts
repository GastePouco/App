import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ArmazenamentoModule } from './modules/armazenamento/armazenamento.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SaudeModule } from './modules/saude/saude.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { JogoModule } from './modules/jogo/jogo.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ContaModule } from './modules/conta/conta.module.js';
import { DevModule } from './modules/dev/dev.module.js';
import { NotasModule } from './modules/notas/notas.module.js';
import { GastosModule } from './modules/gastos/gastos.module.js';
import { PrecosModule } from './modules/precos/precos.module.js';
import { ListaModule } from './modules/lista/lista.module.js';
import { OfertasModule } from './modules/ofertas/ofertas.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { PrivacidadeModule } from './modules/privacidade/privacidade.module.js';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module.js';
import { RecompensasModule } from './modules/recompensas/recompensas.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { configuracao } from './comum/configuracao.js';

/**
 * Módulo raiz. Os módulos de nota, preços, lista e ranking entram nas fases
 * seguintes — ver docs/11-ROADMAP-E-PROMPTS.md.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // Jobs agendados: agregação de preços a cada 15 min (docs/02-ARQUITETURA.md).
    ScheduleModule.forRoot(),
    // Teto global. Login, cadastro e leitura de nota apertam mais nos próprios
    // controllers (docs/09-SEGURANCA-LGPD.md).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Fila da leitura de notas: a consulta ao portal da SEFAZ é lenta e pode
    // falhar, então não pode acontecer dentro da requisição.
    BullModule.forRoot({
      connection: (() => {
        const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
        return { host: url.hostname, port: Number(url.port || 6379) };
      })(),
    }),
    PrismaModule,
    ArmazenamentoModule,
    EmailModule,
    JogoModule,
    SaudeModule,
    AuthModule,
    ContaModule,
    NotasModule,
    GastosModule,
    PrecosModule,
    ListaModule,
    OfertasModule,
    PrivacidadeModule,
    AdminModule,
    NotificacoesModule,
    RecompensasModule,
    // Atalhos de teste. Fora de produção, e o próprio controller confere de novo.
    ...(configuracao.ehProducao ? [] : [DevModule]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
