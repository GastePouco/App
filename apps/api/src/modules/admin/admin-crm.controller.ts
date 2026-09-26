import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual, type UsuarioAutenticado } from '../../comum/usuario-atual.js';
import { JwtGuarda } from '../auth/guardas/jwt.guarda.js';
import { AdminGuarda } from './admin.guarda.js';
import { MetricasService } from './metricas.service.js';
import { CatalogoService } from './catalogo.service.js';
import { PessoasService } from './pessoas.service.js';
import { CorrigirProdutoDto, FundirProdutoDto, MudarPapelDto } from './dto/admin.dto.js';

/** Painel, catálogo e contas (docs/15-CRM.md). Só papel `ADMIN`. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtGuarda, AdminGuarda)
export class AdminCrmController {
  constructor(
    private readonly metricas: MetricasService,
    private readonly catalogo: CatalogoService,
    private readonly pessoas: PessoasService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Números do painel, nenhum deles identificando pessoa' })
  async painel() {
    return this.metricas.painel();
  }

  // ------------------------------------------------------------- catálogo

  @Get('products/review')
  @ApiOperation({
    summary: 'Fila de revisão de produtos',
    description: 'Ordenada por observações de preço: corrigir o produto de 300 conserta 300 números.',
  })
  async paraRevisar(@Query('limit') limite?: string) {
    return this.catalogo.paraRevisar(Number(limite) || 50);
  }

  @Get('products/duplicates')
  @ApiOperation({ summary: 'Prováveis duplicados, para decisão humana' })
  async duplicados(@Query('limit') limite?: string) {
    return this.catalogo.possiveisDuplicados(Number(limite) || 30);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Corrige nome, categoria ou GTIN' })
  async corrigir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dados: CorrigirProdutoDto,
  ) {
    return this.catalogo.corrigir(usuario.id, id, dados);
  }

  @Post('products/:id/merge')
  @ApiOperation({
    summary: 'Funde outro produto neste',
    description: 'Move itens, observações, apelidos, listas, alertas e ofertas. Não tem desfazer.',
  })
  async fundir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dados: FundirProdutoDto,
  ) {
    return this.catalogo.fundir(usuario.id, id, dados.fromId);
  }

  // -------------------------------------------------------------- pessoas

  @Get('users')
  @ApiOperation({
    summary: 'Busca uma conta por e-mail **exato**',
    description:
      'Sem correspondência parcial de propósito: quem procura já sabe quem procura. A consulta fica registrada.',
  })
  async porEmail(@UsuarioAtual() usuario: UsuarioAutenticado, @Query('email') email: string) {
    return this.pessoas.porEmail(usuario.id, email ?? '');
  }

  @Get('users/queue')
  @ApiOperation({ summary: 'Contas com exclusão agendada ou pausa vencida' })
  async fila(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.pessoas.fila(usuario.id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Muda o papel de uma conta' })
  async mudarPapel(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dados: MudarPapelDto,
  ) {
    return this.pessoas.mudarPapel(usuario.id, id, dados.role);
  }

  // ------------------------------------------------------------ auditoria

  @Get('logs')
  @ApiOperation({
    summary: 'Trilha de auditoria',
    description: 'Existe para ser lida: trilha que ninguém consulta é enfeite.',
  })
  async auditoria(@Query('limit') limite?: string, @Query('action') acao?: string) {
    return this.pessoas.auditoria(Number(limite) || 100, acao);
  }
}
