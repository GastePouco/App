import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminGuarda } from './admin.guarda.js';
import { AdminCrmController } from './admin-crm.controller.js';
import { MetricasService } from './metricas.service.js';
import { CatalogoService } from './catalogo.service.js';
import { PessoasService } from './pessoas.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminCrmController],
  providers: [AdminService, AdminGuarda, MetricasService, CatalogoService, PessoasService],
  exports: [AdminService, MetricasService, CatalogoService, PessoasService],
})
export class AdminModule {}
