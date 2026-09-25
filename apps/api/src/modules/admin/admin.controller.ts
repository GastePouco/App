import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual, type UsuarioAutenticado } from '../../comum/usuario-atual.js';
import { JwtGuarda } from '../auth/guardas/jwt.guarda.js';
import { AdminGuarda } from './admin.guarda.js';
import { AdminService } from './admin.service.js';
import { CriarOfertaDto, CriarParceiroDto, EditarOfertaDto } from './dto/admin.dto.js';

/**
 * Rotas do painel (docs/04-API.md, "Admin").
 *
 * `JwtGuarda` primeiro, `AdminGuarda` depois: um diz quem é, o outro diz se
 * pode. Nenhuma rota daqui aparece para conta comum, e toda alteração fica em
 * `AdminLog`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtGuarda, AdminGuarda)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('partners')
  @ApiOperation({ summary: 'Parceiros cadastrados' })
  async listarParceiros() {
    return this.admin.listarParceiros();
  }

  @Post('partners')
  @ApiOperation({ summary: 'Cadastra um parceiro' })
  async criarParceiro(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: CriarParceiroDto,
  ) {
    return this.admin.criarParceiro(usuario.id, dados);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Ofertas, com impressões, cliques e confirmações' })
  async listarOfertas() {
    return this.admin.listarOfertas();
  }

  @Post('offers')
  @ApiOperation({
    summary: 'Cria uma oferta',
    description:
      'Com `partnerId`, a oferta nasce `sponsored: true` e a tela é obrigada a mostrar o selo. Não há como cadastrar oferta paga sem selo.',
  })
  async criarOferta(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dados: CriarOfertaDto) {
    return this.admin.criarOferta(usuario.id, dados);
  }

  @Patch('offers/:id')
  @ApiOperation({ summary: 'Edita uma oferta' })
  async editarOferta(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dados: EditarOfertaDto,
  ) {
    return this.admin.editarOferta(usuario.id, id, dados);
  }

  @Delete('offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma oferta' })
  async excluirOferta(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.admin.excluirOferta(usuario.id, id);
  }

  @Get('receipts/failed')
  @ApiOperation({ summary: 'Notas que a leitura não conseguiu interpretar' })
  async notasQueFalharam(@Query('limit') limite?: string) {
    return this.admin.notasQueFalharam(Number(limite) || 50);
  }

  @Get('receipts/:id/page')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'A página guardada da nota que falhou',
    description: 'Guardada por 30 dias, sem o CPF do consumidor. A leitura fica registrada.',
  })
  async paginaDaNota(@UsuarioAtual() usuario: UsuarioAutenticado, @Param('id') id: string) {
    return this.admin.paginaDaNota(usuario.id, id);
  }
}
