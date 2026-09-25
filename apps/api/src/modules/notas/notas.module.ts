import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotasController } from './notas.controller.js';
import { NotasService } from './notas.service.js';
import { NotasProcessador, FILA_DE_NOTAS } from './notas.processador.js';
import { BuscadorService } from './buscador.service.js';
import { ProdutosService } from './produtos.service.js';
import { RegistroDeAdaptadores } from './adaptadores/registro.js';
import { AdaptadorDoDf } from './adaptadores/df.adaptador.js';
import { AdaptadorDeSp } from './adaptadores/sp.adaptador.js';

@Module({
  imports: [BullModule.registerQueue({ name: FILA_DE_NOTAS })],
  controllers: [NotasController],
  providers: [
    NotasService,
    NotasProcessador,
    BuscadorService,
    ProdutosService,
    RegistroDeAdaptadores,
    AdaptadorDoDf,
    AdaptadorDeSp,
  ],
  exports: [NotasService, ProdutosService],
})
export class NotasModule {}
