import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { codificarGeohash, erro } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PontosService } from '../jogo/pontos.service.js';
import { emMinutos, expirou } from '../../comum/tempo.js';
import { SessoesService, type ParDeTokens } from './sessoes.service.js';

/** Erro de negócio já no formato `{ code, message }` que a tela mostra. */
function falha(code: string, status = HttpStatus.BAD_REQUEST): HttpException {
  return new HttpException(erro(code), status);
}

interface DadosDoUsuario {
  id: string;
  name: string;
  email: string;
  rankingName: string;
  emailVerificado: boolean;
}

/**
 * Cadastro, login e recuperação de senha.
 *
 * Três decisões que valem mais do que o código:
 *
 * 1. **Senha com Argon2id.** É o que o OWASP recomenda hoje; bcrypt ainda
 *    passa, MD5/SHA não passam nem como piada.
 * 2. **"Esqueci a senha" responde sempre 204**, exista a conta ou não. Se
 *    respondesse diferente, o endpoint viraria um verificador de quem tem
 *    conta aqui — e isso é dado pessoal.
 * 3. **O código de confirmação é guardado como hash.** Ele é pequeno (6
 *    dígitos) e vive pouco, mas vazamento do banco não pode entregar contas.
 */
/** Erros antes do código morrer. Cinco é folga para quem digita errado. */
const MAXIMO_DE_TENTATIVAS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessoes: SessoesService,
    private readonly email: EmailService,
    private readonly pontos: PontosService,
  ) {}

  // ------------------------------------------------------------- cadastro

  async registrar(dados: {
    name: string;
    email: string;
    password: string;
    cep?: string;
    acceptTerms: boolean;
  }): Promise<{ user: DadosDoUsuario }> {
    if (!dados.acceptTerms) throw falha('VALIDATION_FAILED');

    const email = dados.email.trim().toLowerCase();

    const jaExiste = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (jaExiste) throw falha('EMAIL_ALREADY_USED', HttpStatus.CONFLICT);

    const usuario = await this.prisma.user.create({
      data: {
        email,
        name: dados.name.trim(),
        rankingName: this.nomeParaRanking(dados.name),
        passwordHash: await argon2.hash(dados.password, { type: argon2.argon2id }),
        cep: dados.cep ?? null,
        inviteCode: await this.codigoDeConviteUnico(),
        accounts: { create: { provider: 'PASSWORD', providerAccountId: email } },
        preferences: { create: {} },
        consents: {
          create: [
            { kind: 'terms_v1', granted: true },
            { kind: 'privacy_v1', granted: true },
          ],
        },
      },
      select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true },
    });

    await this.enviarCodigo(usuario.id, usuario.email);

    return { user: this.paraFora(usuario) };
  }

  /** Código de 6 dígitos, guardado como hash, válido por 15 minutos. */
  private async enviarCodigo(userId: string, email: string): Promise<void> {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.prisma.verificationCode.deleteMany({ where: { userId, kind: 'EMAIL' } });
    await this.prisma.verificationCode.create({
      data: {
        userId,
        kind: 'EMAIL',
        codeHash: createHash('sha256').update(codigo).digest('hex'),
        expiresAt: emMinutos(15),
      },
    });

    await this.email.enviarCodigoDeConfirmacao(email, codigo);
  }

  async reenviarCodigo(emailBruto: string): Promise<void> {
    const email = emailBruto.trim().toLowerCase();
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    // Não revela se a conta existe; o limite de 1 por minuto é do throttler.
    if (!usuario || usuario.emailVerifiedAt) return;

    await this.enviarCodigo(usuario.id, usuario.email);
  }

  async confirmarEmail(
    emailBruto: string,
    codigo: string,
    aparelho: string,
  ): Promise<{ tokens: ParDeTokens; user: DadosDoUsuario }> {
    const email = emailBruto.trim().toLowerCase();
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true },
    });
    if (!usuario) throw falha('INVALID_CODE');

    const guardado = await this.prisma.verificationCode.findFirst({
      where: { userId: usuario.id, kind: 'EMAIL' },
      orderBy: { createdAt: 'desc' },
    });
    if (!guardado) throw falha('INVALID_CODE');
    if (expirou(guardado.expiresAt)) throw falha('CODE_EXPIRED');

    await this.conferirCodigoContandoTentativas(
      guardado.id,
      codigo,
      guardado.codeHash,
      guardado.attempts,
    );

    const confirmado = await this.prisma.user.update({
      where: { id: usuario.id },
      data: { emailVerifiedAt: new Date() },
      select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true },
    });

    await this.prisma.verificationCode.deleteMany({ where: { userId: usuario.id, kind: 'EMAIL' } });
    await this.pontos.darBoasVindas(usuario.id);

    return {
      tokens: await this.sessoes.criar(confirmado.id, confirmado.email, aparelho),
      user: this.paraFora(confirmado),
    };
  }

  // ---------------------------------------------------------------- login

  async entrar(
    emailBruto: string,
    senha: string,
    aparelho: string,
  ): Promise<{ tokens: ParDeTokens; user: DadosDoUsuario }> {
    const email = emailBruto.trim().toLowerCase();
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        rankingName: true,
        passwordHash: true,
        emailVerifiedAt: true,
        status: true,
      },
    });

    // Mesma mensagem para e-mail inexistente e senha errada: qualquer
    // diferença aqui vira um endpoint de descobrir quem tem conta.
    if (!usuario?.passwordHash) throw falha('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);

    const confere = await argon2.verify(usuario.passwordHash, senha).catch(() => false);
    if (!confere) throw falha('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);

    if (!usuario.emailVerifiedAt) throw falha('EMAIL_NOT_VERIFIED', HttpStatus.FORBIDDEN);

    // Entrar cancela a exclusão agendada — é a forma de "desfazer" prometida
    // na tela Encerrar conta (docs/09-SEGURANCA-LGPD.md).
    if (usuario.status === 'PENDING_DELETION') {
      await this.prisma.user.update({
        where: { id: usuario.id },
        data: { status: 'ACTIVE', deletionAt: null },
      });
      this.logger.log('Exclusão cancelada por novo acesso.');
    }

    return {
      tokens: await this.sessoes.criar(usuario.id, usuario.email, aparelho),
      user: this.paraFora(usuario),
    };
  }

  // ------------------------------------------------------ Google (OAuth 2)

  async entrarComGoogle(
    perfil: { providerAccountId: string; email: string; name: string },
    aparelho: string,
  ): Promise<{ tokens: ParDeTokens; user: DadosDoUsuario; primeiroAcesso: boolean }> {
    const email = perfil.email.trim().toLowerCase();

    const vinculo = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'GOOGLE',
          providerAccountId: perfil.providerAccountId,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true } },
      },
    });

    if (vinculo) {
      return {
        tokens: await this.sessoes.criar(vinculo.user.id, vinculo.user.email, aparelho),
        user: this.paraFora(vinculo.user),
        primeiroAcesso: false,
      };
    }

    const existente = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true },
    });

    // Ligar o Google a uma conta que já existe só quando o e-mail é o mesmo e
    // já está confirmado; senão quem controla o Google entraria na conta de
    // outra pessoa (docs/09-SEGURANCA-LGPD.md).
    if (existente) {
      if (!existente.emailVerifiedAt) throw falha('EMAIL_NOT_VERIFIED', HttpStatus.FORBIDDEN);

      await this.prisma.authAccount.create({
        data: {
          userId: existente.id,
          provider: 'GOOGLE',
          providerAccountId: perfil.providerAccountId,
          email,
        },
      });

      return {
        tokens: await this.sessoes.criar(existente.id, existente.email, aparelho),
        user: this.paraFora(existente),
        primeiroAcesso: false,
      };
    }

    const novo = await this.prisma.user.create({
      data: {
        email,
        name: perfil.name,
        rankingName: this.nomeParaRanking(perfil.name),
        // O Google já confirmou o e-mail; pedir código de novo seria atrito à toa.
        emailVerifiedAt: new Date(),
        inviteCode: await this.codigoDeConviteUnico(),
        accounts: {
          create: { provider: 'GOOGLE', providerAccountId: perfil.providerAccountId, email },
        },
        preferences: { create: {} },
        consents: {
          create: [
            { kind: 'terms_v1', granted: true },
            { kind: 'privacy_v1', granted: true },
          ],
        },
      },
      select: { id: true, name: true, email: true, rankingName: true, emailVerifiedAt: true },
    });

    await this.pontos.darBoasVindas(novo.id);

    return {
      tokens: await this.sessoes.criar(novo.id, novo.email, aparelho),
      user: this.paraFora(novo),
      primeiroAcesso: true,
    };
  }

  // ------------------------------------------------------- senha esquecida

  async pedirNovaSenha(emailBruto: string): Promise<void> {
    const email = emailBruto.trim().toLowerCase();
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Silêncio de propósito: o controller responde 204 dos dois jeitos.
    if (!usuario) return;

    const token = randomBytes(32).toString('base64url');

    await this.prisma.verificationCode.deleteMany({
      where: { userId: usuario.id, kind: 'PASSWORD_RESET' },
    });
    await this.prisma.verificationCode.create({
      data: {
        userId: usuario.id,
        kind: 'PASSWORD_RESET',
        codeHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: emMinutos(60),
      },
    });

    await this.email.enviarLinkDeNovaSenha(usuario.email, token);
  }

  async definirNovaSenha(token: string, senha: string): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex');
    const guardado = await this.prisma.verificationCode.findFirst({
      where: { kind: 'PASSWORD_RESET', codeHash: hash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!guardado) throw falha('INVALID_CODE');
    if (expirou(guardado.expiresAt)) throw falha('CODE_EXPIRED');

    await this.prisma.user.update({
      where: { id: guardado.userId },
      data: { passwordHash: await argon2.hash(senha, { type: argon2.argon2id }) },
    });

    await this.prisma.verificationCode.deleteMany({
      where: { userId: guardado.userId, kind: 'PASSWORD_RESET' },
    });

    // Trocar a senha derruba todas as sessões: se alguém entrou com a senha
    // antiga, é agora que ele sai.
    await this.sessoes.revogarTodas(guardado.userId);

    await this.email.avisar(
      guardado.user.email,
      'Sua senha do GasteMenos foi alterada',
      'Se não foi você, entre em contato com a gente agora.',
    );
  }

  // ------------------------------------------------------------- apoio

  /** "Camila Alves" → "Camila A." — é o nome que aparece no ranking. */
  private nomeParaRanking(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    const primeiro = partes[0] ?? 'Economizador';
    const sobrenome = partes.at(-1);
    return partes.length > 1 && sobrenome ? `${primeiro} ${sobrenome[0]}.` : primeiro;
  }

  private async codigoDeConviteUnico(): Promise<string> {
    // Sem I, O, 0 e 1: o código é ditado por telefone e escrito à mão.
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const codigo = Array.from(
        { length: 8 },
        () => alfabeto[randomInt(0, alfabeto.length)],
      ).join('');
      const usado = await this.prisma.user.findUnique({
        where: { inviteCode: codigo },
        select: { id: true },
      });
      if (!usado) return codigo;
    }
    throw falha('INTERNAL', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /** Comparação de tempo constante: evita medir acerto pelo tempo de resposta. */
  /**
   * Confere o código contando tentativas, e queima o código ao esgotá-las.
   *
   * Seis dígitos são um milhão de combinações — pouco, para quem tem paciência.
   * O limite por IP sozinho não resolve: quem ataca distribui entre IPs, e um
   * código sem contador aceita tentativa até expirar. Cinco erros e ele morre;
   * a pessoa pede outro, que é barato para ela e caro para quem adivinha.
   */
  private async conferirCodigoContandoTentativas(
    id: string,
    codigo: string,
    codeHash: string,
    tentativas: number,
  ): Promise<void> {
    if (tentativas >= MAXIMO_DE_TENTATIVAS) {
      await this.prisma.verificationCode.delete({ where: { id } }).catch(() => undefined);
      throw falha('TOO_MANY_ATTEMPTS', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (this.conferirHash(codigo, codeHash)) return;

    const depois = await this.prisma.verificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    if (depois.attempts >= MAXIMO_DE_TENTATIVAS) {
      await this.prisma.verificationCode.delete({ where: { id } }).catch(() => undefined);
      this.logger.warn(`Código queimado por tentativas demais (${id}).`);
    }

    throw falha('INVALID_CODE');
  }

  private conferirHash(valor: string, hashGuardado: string): boolean {
    const calculado = createHash('sha256').update(valor).digest();
    const guardado = Buffer.from(hashGuardado, 'hex');
    if (calculado.length !== guardado.length) return false;
    return timingSafeEqual(calculado, guardado);
  }

  private paraFora(usuario: {
    id: string;
    name: string;
    email: string;
    rankingName: string;
    emailVerifiedAt: Date | null;
  }): DadosDoUsuario {
    return {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      rankingName: usuario.rankingName,
      emailVerificado: Boolean(usuario.emailVerifiedAt),
    };
  }

  /** Região a partir do CEP, para os preços. Só o geohash é guardado. */
  async definirRegiaoPeloCep(userId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { regionGeohash: codificarGeohash(lat, lng) },
    });
  }
}
