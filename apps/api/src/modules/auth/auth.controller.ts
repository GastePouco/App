import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { erro } from '@gastemenos/shared';
import { configuracao } from '../../comum/configuracao.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../../comum/usuario-atual.js';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { SessoesService, type ParDeTokens } from './sessoes.service.js';
import { JwtGuarda } from './guardas/jwt.guarda.js';
import { GoogleConfiguradoGuarda } from './guardas/google-configurado.guarda.js';
import type { PerfilDoGoogle } from './estrategias/google.estrategia.js';
import {
  ConfirmarEmailDto,
  EntrarDto,
  EsqueciSenhaDto,
  NovaSenhaDto,
  ReenviarCodigoDto,
  RegistrarDto,
} from './dto/auth.dto.js';

const COOKIE_DE_REFRESH = 'gm_refresh';

/**
 * Cookie de aviso, **legível pelo javascript** e sem segredo nenhum: só diz
 * "existe sessão neste aparelho".
 *
 * Ele existe porque o app precisa saber se vale a pena pedir renovação ao
 * abrir. A marca ficava em `localStorage`, escrita quando o javascript
 * guardava o token — e isso quebrou o login com Google: ali a sessão nasce no
 * **servidor**, no callback, sem nenhum javascript do app ter rodado. A pessoa
 * escolhia a conta, voltava, e caía na tela de login com o cookie de sessão
 * no navegador.
 *
 * Como cookie, ele acompanha o refresh em qualquer caminho de entrada, some
 * junto no logout e sobrevive a limpar o armazenamento local.
 */
const COOKIE_DE_AVISO = 'gm_sessao';

/** Limite de produção, multiplicado só quando a suíte pede (ver configuracao). */
function limite(requisicoes: number): number {
  return requisicoes * configuracao.fatorDeLimite;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessoes: SessoesService,
  ) {}

  /**
   * O refresh token vai em cookie httpOnly, nunca no corpo da resposta.
   *
   * Em cookie httpOnly o JavaScript da página não alcança o token, então um XSS
   * não consegue roubar a sessão — que é a diferença entre um bug de tela e um
   * vazamento de contas. `SameSite=Lax` cobre CSRF nas requisições que
   * importam (docs/09-SEGURANCA-LGPD.md).
   */
  private gravarCookie(resposta: Response, refresh: string): void {
    const validade = configuracao.jwt.validadeDoRefreshEmDias * 24 * 60 * 60 * 1000;

    resposta.cookie(COOKIE_DE_REFRESH, refresh, {
      httpOnly: true,
      secure: configuracao.ehProducao,
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: validade,
    });

    // Sem `httpOnly` de propósito: é o único cookie que o app precisa ler, e
    // não carrega segredo — só a informação de que existe sessão. `path: '/'`
    // porque quem lê é a página, não a rota de autenticação.
    resposta.cookie(COOKIE_DE_AVISO, '1', {
      httpOnly: false,
      secure: configuracao.ehProducao,
      sameSite: 'lax',
      path: '/',
      maxAge: validade,
    });
  }

  private limparCookie(resposta: Response): void {
    resposta.clearCookie(COOKIE_DE_REFRESH, { path: '/v1/auth' });
    resposta.clearCookie(COOKIE_DE_AVISO, { path: '/' });
  }

  private responder(resposta: Response, tokens: ParDeTokens): { access: string } {
    this.gravarCookie(resposta, tokens.refresh);
    return { access: tokens.access };
  }

  /** Rótulo do aparelho para a tela "Login e segurança". */
  private aparelho(requisicao: Request): string {
    const agente = requisicao.headers['user-agent'] ?? '';
    if (/android|iphone|ipad|mobile/i.test(agente)) return 'Este celular';
    return 'Navegador no computador';
  }

  // ----------------------------------------------------------- cadastro

  @Post('register')
  @Throttle({ default: { limit: limite(5), ttl: 60_000 } })
  @ApiOperation({ summary: 'Cria a conta e envia o código de confirmação' })
  async registrar(@Body() dados: RegistrarDto) {
    return this.auth.registrar(dados);
  }

  @Post('verify-email')
  @Throttle({ default: { limit: limite(10), ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirma o e-mail e dá os 50 pontos de boas-vindas' })
  async confirmarEmail(
    @Body() dados: ConfirmarEmailDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    const { tokens, user } = await this.auth.confirmarEmail(
      dados.email,
      dados.code,
      this.aparelho(requisicao),
    );
    return { ...this.responder(resposta, tokens), user };
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: limite(1), ttl: 60_000 } })
  @ApiOperation({ summary: 'Reenvia o código (1 por minuto)' })
  async reenviarCodigo(@Body() dados: ReenviarCodigoDto): Promise<void> {
    await this.auth.reenviarCodigo(dados.email);
  }

  // -------------------------------------------------------------- login

  @Post('login')
  // 5 tentativas por 15 minutos, como manda docs/09-SEGURANCA-LGPD.md.
  @Throttle({ default: { limit: limite(5), ttl: 900_000 } })
  @ApiOperation({ summary: 'Entra com e-mail e senha' })
  async entrar(
    @Body() dados: EntrarDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    const { tokens, user } = await this.auth.entrar(
      dados.email,
      dados.password,
      this.aparelho(requisicao),
    );
    return { ...this.responder(resposta, tokens), user };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Troca o refresh do cookie por um access novo' })
  async renovar(@Req() requisicao: Request, @Res({ passthrough: true }) resposta: Response) {
    const refresh = (requisicao.cookies as Record<string, string> | undefined)?.[COOKIE_DE_REFRESH];
    if (!refresh) throw new UnauthorizedException(erro('SESSION_EXPIRED'));

    const tokens = await this.sessoes.rotacionar(refresh);
    if (!tokens) {
      this.limparCookie(resposta);
      throw new UnauthorizedException(erro('SESSION_EXPIRED'));
    }

    return this.responder(resposta, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sai deste aparelho' })
  async sair(
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    const refresh = (requisicao.cookies as Record<string, string> | undefined)?.[COOKIE_DE_REFRESH];
    if (refresh) await this.sessoes.revogar(refresh);
    this.limparCookie(resposta);
  }

  // ------------------------------------------------------ senha esquecida

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: limite(3), ttl: 900_000 } })
  @ApiOperation({
    summary: 'Pede o link de nova senha',
    description:
      'Responde 204 exista a conta ou não: responder diferente transformaria o endpoint num verificador de quem tem conta aqui.',
  })
  async esqueciSenha(@Body() dados: EsqueciSenhaDto): Promise<void> {
    await this.auth.pedirNovaSenha(dados.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: limite(5), ttl: 900_000 } })
  @ApiOperation({ summary: 'Define a nova senha e derruba todas as sessões' })
  async novaSenha(@Body() dados: NovaSenhaDto): Promise<void> {
    await this.auth.definirNovaSenha(dados.token, dados.password);
  }

  // ------------------------------------------------------ Google (OAuth 2)

  @Get('google')
  @UseGuards(GoogleConfiguradoGuarda, AuthGuard('google'))
  @ApiOperation({ summary: 'Manda para o Google (PKCE + state)' })
  entrarComGoogle(): void {
    // O guard redireciona. Nada para fazer aqui.
  }

  @Get('google/callback')
  @UseGuards(GoogleConfiguradoGuarda, AuthGuard('google'))
  @ApiOperation({
    summary: 'Volta do Google, cria a sessão e devolve o navegador ao app',
    description:
      'Redireciona em vez de responder JSON: quem chega aqui é o navegador vindo do Google, não o fetch do app.',
  })
  async retornoDoGoogle(
    @Req() requisicao: Request & { user?: PerfilDoGoogle },
    @Res() resposta: Response,
  ): Promise<void> {
    const perfil = requisicao.user;
    if (!perfil) {
      resposta.redirect(`${configuracao.enderecoDoApp}/entrar?erro=google`);
      return;
    }

    const { tokens, primeiroAcesso } = await this.auth.entrarComGoogle(
      perfil,
      this.aparelho(requisicao),
    );

    this.gravarCookie(resposta, tokens.refresh);

    // Sem access na URL: query string vai para histórico, log de servidor e
    // cabeçalho Referer. O app chama /auth/refresh e pega o access pelo cookie.
    const destino = primeiroAcesso ? '/perfil-de-consumo' : '/inicio';
    resposta.redirect(`${configuracao.enderecoDoApp}${destino}`);
  }

  // ------------------------------------------------------------ sessões

  @Get('sessions')
  @UseGuards(JwtGuarda)
  @ApiOperation({ summary: 'Aparelhos conectados' })
  async aparelhos(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.sessoes.listarAparelhos(usuario.id);
  }
}
