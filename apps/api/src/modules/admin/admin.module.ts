import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminGuarda } from './admin.guarda.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuarda],
  exports: [AdminService],
})
export class AdminModule {}
