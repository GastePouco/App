import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual, type UsuarioAutenticado } from '../../comum/usuario-atual.js';
import { JwtGuarda } from '../auth/guardas/jwt.guarda.js';
import { RecompensasService } from './recompensas.service.js';
import { ComprarRecompensaDto } from './dto/comprar.dto.js';

/**
 * Recompensa por notas lidas (docs/18-RECOMPENSAS.md).
 *
 * Uma rota de leitura só: saldo, progresso, loja, benefícios e extrato vão
 * juntos porque a tela mostra tudo de uma vez, e três requisições num celular
 * em 3G são três chances de meia tela.
 *
 * **Nenhum GET credita nada.** O crédito acontece quando a nota termina de ser
 * lida e no job noturno. Dinheiro aparecendo porque alguém abriu uma tela é o
 * tipo de efeito colateral que ninguém encontra depois.
 */
@ApiTags('recompensas')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtGuarda)
export class RecompensasController {
  constructor(private readonly recompensas: RecompensasService) {}

  @Get('rewards')
  @ApiOperation({ summary: 'Saldo, progresso até o próximo marco, loja e extrato' })
  async situacao(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.recompensas.situacao(usuario.id);
  }

  @Post('rewards/purchase')
  @ApiOperation({ summary: 'Gasta o saldo num benefício do app' })
  async comprar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() corpo: ComprarRecompensaDto) {
    return this.recompensas.comprar(usuario.id, corpo.code);
  }
}
