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
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { configuracao } from '../../comum/configuracao.js';
import type { Response } from 'express';
import { UsuarioAtual, type UsuarioAutenticado } from '../../comum/usuario-atual.js';
import { JwtGuarda } from '../auth/guardas/jwt.guarda.js';
import { SessoesService } from '../auth/sessoes.service.js';
import { PrivacidadeService } from '../privacidade/privacidade.service.js';
import { ContaService } from './conta.service.js';
import { DadosPessoaisService } from './dados-pessoais.service.js';
import { PreferenciasService } from './preferencias.service.js';
import { AlterarPreferenciasDto } from './dto/preferencias.dto.js';
import {
  AtualizarDadosDto,
  ConfirmarEmailNovoDto,
  EncerrarContaDto,
  PausarContaDto,
  PerfilDeConsumoDto,
  TrocarEmailDto,
  TrocarSenhaDto,
  VincularCpfDto,
} from './dto/conta.dto.js';

@ApiTags('conta')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtGuarda)
export class ContaController {
  constructor(
    private readonly conta: ContaService,
    private readonly dados: DadosPessoaisService,
    private readonly preferencias: PreferenciasService,
    private readonly privacidade: PrivacidadeService,
    private readonly sessoes: SessoesService,
  ) {}

  // -------------------------------------------------------------- perfil

  @Get('me')
  @ApiOperation({ summary: 'Usuário, nível, pontos, sequência e status' })
  async eu(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.conta.resumo(usuario.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Nome, nome no ranking, celular e CEP' })
  async atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: AtualizarDadosDto,
  ) {
    return this.dados.atualizar(usuario.id, dados);
  }

  /**
   * CPF — só para a recompensa (docs/18-RECOMPENSAS.md).
   *
   * Limite apertado de propósito: a resposta distingue "CPF livre" de "CPF já
   * está em outra conta", e sem limite isso viraria um jeito de sondar quem tem
   * conta aqui. Cinco por minuto serve para quem está digitando o próprio e não
   * serve para quem está varrendo uma lista.
   */
  @Put('me/cpf')
  @Throttle({ default: { limit: 5 * configuracao.fatorDeLimite, ttl: 60_000 } })
  @ApiOperation({ summary: 'Vincula o CPF (guardado como HMAC) para a recompensa' })
  async vincularCpf(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() corpo: VincularCpfDto,
  ) {
    return this.dados.vincularCpf(usuario.id, corpo.cpf);
  }

  @Delete('me/cpf')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desvincula o CPF e perde a elegibilidade à recompensa' })
  async desvincularCpf(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    await this.dados.desvincularCpf(usuario.id);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Perfil de consumo (as 5 perguntas)' })
  async perfil(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.conta.lerPerfil(usuario.id);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Salva o perfil; a primeira vez vale 100 pontos' })
  async salvarPerfil(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: PerfilDeConsumoDto,
  ) {
    return this.conta.salvarPerfil(usuario.id, dados);
  }

  // -------------------------------------------------------- preferências

  @Get('me/preferences')
  @ApiOperation({ summary: 'Tema, texto, acessibilidade, notificações, privacidade' })
  async lerPreferencias(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.preferencias.ler(usuario.id);
  }

  @Patch('me/preferences')
  @ApiOperation({
    summary: 'Altera preferências',
    description:
      'Mudar um interruptor de compartilhamento grava uma linha em Consent: o ônus de provar o consentimento é do controlador (LGPD, art. 8º, §2º).',
  })
  async alterarPreferencias(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: AlterarPreferenciasDto,
  ) {
    return this.preferencias.alterar(usuario.id, dados);
  }

  // --------------------------------------------------------------- senha

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Troca a senha e derruba os outros aparelhos' })
  async trocarSenha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: TrocarSenhaDto,
  ): Promise<void> {
    await this.dados.trocarSenha(usuario.id, dados.current, dados.next);
  }

  // -------------------------------------------------------------- e-mail

  @Post('me/email-change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Pede a troca; o código vai para o endereço novo' })
  async pedirTrocaDeEmail(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: TrocarEmailDto,
  ): Promise<void> {
    await this.dados.pedirTrocaDeEmail(usuario.id, dados.newEmail);
  }

  @Post('me/email-change/confirm')
  @ApiOperation({ summary: 'Confirma o e-mail novo com o código' })
  async confirmarTrocaDeEmail(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: ConfirmarEmailNovoDto,
  ) {
    return this.dados.confirmarTrocaDeEmail(usuario.id, dados.code);
  }

  // ----------------------------------------------------------- aparelhos

  @Get('me/sessions')
  @ApiOperation({ summary: 'Aparelhos conectados' })
  async aparelhos(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.sessoes.listarAparelhos(usuario.id);
  }

  @Delete('me/sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sai de um aparelho' })
  async sairDeUm(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.sessoes.revogarUma(usuario.id, id);
  }

  @Delete('me/sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sai de todos os aparelhos' })
  async sairDeTodos(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    await this.sessoes.revogarTodas(usuario.id);
  }

  @Get('me/auth-accounts')
  @ApiOperation({ summary: 'Formas de entrar' })
  async formasDeEntrar(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.dados.formasDeEntrar(usuario.id);
  }

  @Delete('me/auth-accounts/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desconecta uma forma de entrar',
    description: 'Recusa se for a última: trancaria a porta com a chave dentro.',
  })
  async desconectar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('provider') provider: string,
  ): Promise<void> {
    await this.dados.desconectar(
      usuario.id,
      provider.toUpperCase() as 'PASSWORD' | 'GOOGLE' | 'APPLE',
    );
  }

  // -------------------------------------------------- pausar e encerrar

  @Post('me/pause')
  @ApiOperation({ summary: 'Pausa a conta: some do ranking, notificações param' })
  async pausar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dados: PausarContaDto) {
    return this.privacidade.pausar(usuario.id, dados.until ? new Date(dados.until) : null);
  }

  @Post('me/resume')
  @ApiOperation({ summary: 'Reativa a conta' })
  async reativar(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.privacidade.reativar(usuario.id);
  }

  @Post('me/delete')
  @ApiOperation({
    summary: 'Agenda a exclusão em 30 dias',
    description: 'Exige a palavra ENCERRAR. Entrar de novo dentro do prazo cancela.',
  })
  async encerrar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dados: EncerrarContaDto) {
    return this.privacidade.agendarExclusao(usuario.id, dados.confirm, dados.reason);
  }

  @Post('me/delete/cancel')
  @ApiOperation({ summary: 'Desfaz o pedido de exclusão' })
  async cancelarExclusao(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.privacidade.cancelarExclusao(usuario.id);
  }

  // ------------------------------------------------------- baixar dados

  @Post('me/export')
  @ApiOperation({ summary: 'Pede o arquivo com todos os seus dados' })
  async exportar(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.privacidade.exportar(usuario.id);
  }

  @Get('me/export/:id')
  @ApiOperation({ summary: 'Situação do arquivo' })
  async situacaoDaExportacao(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ) {
    return this.privacidade.situacaoDaExportacao(usuario.id, id);
  }

  @Get('me/export/:id/download')
  @Header('Content-Type', 'application/zip')
  @Header('Content-Disposition', 'attachment; filename="meus-dados-gastemenos.zip"')
  @ApiOperation({ summary: 'Baixa o arquivo' })
  async baixarExportacao(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const arquivo = await this.privacidade.baixar(usuario.id, id);
    resposta.send(arquivo);
  }
}
