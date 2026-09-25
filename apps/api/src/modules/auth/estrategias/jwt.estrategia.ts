import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { erro } from '@gastemenos/shared';
import { configuracao } from '../../../comum/configuracao.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { UsuarioAutenticado } from '../../../comum/usuario-atual.js';

/**
 * Valida o access token e confere a conta a cada requisição.
 *
 * Ir ao banco em toda chamada é de propósito: sem isso, quem foi encerrado ou
 * pausado continuaria usando o app por até 15 minutos com um token ainda
 * válido — e "pausar" tem que valer na hora (docs/09-SEGURANCA-LGPD.md).
 */
@Injectable()
export class JwtEstrategia extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configuracao.jwt.segredo,
    });
  }

  async validate(payload: { sub: string; email: string }): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true, pausedUntil: true, role: true },
    });

    if (!usuario) throw new UnauthorizedException(erro('SESSION_EXPIRED'));

    const pausaAcabou = usuario.pausedUntil && usuario.pausedUntil.getTime() < Date.now();
    if (usuario.status === 'PAUSED' && !pausaAcabou) {
      throw new UnauthorizedException(erro('ACCOUNT_PAUSED'));
    }

    // O papel vem do banco a cada requisição, não do token: tirar alguém do
    // admin tem de valer na hora, não em 15 minutos.
    return { id: usuario.id, email: usuario.email, papel: usuario.role };
  }
}
