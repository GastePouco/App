import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { erro } from '@gastemenos/shared';
import type { UsuarioAutenticado } from '../../comum/usuario-atual.js';

/**
 * Só passa quem tem papel `ADMIN`.
 *
 * Vem **depois** do `JwtGuarda`, que já foi ao banco buscar o papel na própria
 * requisição. É por isso que tirar alguém do admin vale na hora, e não em até
 * 15 minutos, que é o tempo de vida do access token.
 *
 * Responde 403 e registra a tentativa: pedido de admin vindo de conta comum é
 * exatamente o tipo de coisa que alguém precisa ver no log.
 */
@Injectable()
export class AdminGuarda implements CanActivate {
  private readonly logger = new Logger(AdminGuarda.name);

  canActivate(contexto: ExecutionContext): boolean {
    const requisicao = contexto.switchToHttp().getRequest<{
      user?: UsuarioAutenticado;
      method: string;
      url: string;
    }>();

    if (requisicao.user?.papel === 'ADMIN') return true;

    this.logger.warn(
      `Conta ${requisicao.user?.id ?? 'sem sessão'} tentou ${requisicao.method} ${requisicao.url}.`,
    );
    throw new HttpException(erro('FORBIDDEN'), HttpStatus.FORBIDDEN);
  }
}
