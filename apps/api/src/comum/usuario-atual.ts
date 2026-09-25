import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface UsuarioAutenticado {
  id: string;
  email: string;
  /** `ADMIN` só existe no CRM; toda ação dele fica registrada em `AdminLog`. */
  papel: 'USER' | 'ADMIN';
}

/** `@UsuarioAtual() usuario: UsuarioAutenticado` no controller. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const requisicao = contexto.switchToHttp().getRequest<{ user: UsuarioAutenticado }>();
    return requisicao.user;
  },
);
