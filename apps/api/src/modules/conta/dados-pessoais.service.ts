import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { erro } from '@gastemenos/shared';
import { emMinutos, expirou } from '../../comum/tempo.js';
import { configuracao } from '../../comum/configuracao.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { SessoesService } from '../auth/sessoes.service.js';

/**
 * Dados pessoais, senha, e-mail e formas de entrar.
 *
 * Três coisas aqui existem para proteger a pessoa dela mesma e de terceiros:
 *
 * 1. **Trocar a senha exige a senha atual.** Sem isso, um celular esquecido
 *    destravado vira uma conta perdida para sempre.
 * 2. **Trocar o e-mail exige confirmar no endereço novo.** Um e-mail digitado
 *    errado sem confirmação deixaria a pessoa sem recuperação de senha.
 * 3. **Não dá para remover a última forma de entrar.** Desconectar o Google de
 *    uma conta que nunca teve senha é trancar a porta com a chave dentro.
 */
/** Mesmo teto do AuthService: cinco erros e o código morre. */
const MAXIMO_DE_TENTATIVAS = 5;

@Injectable()
export class DadosPessoaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sessoes: SessoesService,
  ) {}

  async atualizar(
    userId: string,
    dados: { name?: string; rankingName?: string; phone?: string; cep?: string; cpf?: string },
  ) {
    const mudanca: Record<string, unknown> = {};

    if (dados.name !== undefined) mudanca.name = dados.name.trim();
    if (dados.rankingName !== undefined) mudanca.rankingName = dados.rankingName.trim();
    if (dados.phone !== undefined) mudanca.phone = dados.phone.replace(/\D/g, '') || null;
    if (dados.cep !== undefined) mudanca.cep = dados.cep.replace(/\D/g, '') || null;

    // O CPF nunca é guardado em claro. O hash com sal serve só para,
    // no futuro, casar as notas emitidas no CPF da pessoa
    // (docs/09-SEGURANCA-LGPD.md).
    if (dados.cpf !== undefined) {
      const limpo = dados.cpf.replace(/\D/g, '');
      mudanca.cpfHash = limpo
        ? createHash('sha256')
            .update(`${configuracao.segredoDoHashDeUsuario}:${limpo}`)
            .digest('hex')
        : null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: mudanca,
      select: {
        id: true,
        name: true,
        rankingName: true,
        email: true,
        phone: true,
        cep: true,
        avatarUrl: true,
      },
    });
  }

  async trocarSenha(userId: string, atual: string, nova: string): Promise<void> {
    const usuario = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    // Conta só com Google ainda não tem senha: aqui ela cria a primeira, e
    // pedir "a senha atual" não faria sentido.
    if (usuario.passwordHash) {
      const confere = await argon2.verify(usuario.passwordHash, atual).catch(() => false);
      if (!confere) {
        throw new HttpException(
          { code: 'WRONG_PASSWORD', message: 'A senha atual não confere.' },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(nova, { type: argon2.argon2id }) },
    });

    await this.prisma.authAccount.upsert({
      where: {
        provider_providerAccountId: { provider: 'PASSWORD', providerAccountId: usuario.email },
      },
      create: { userId, provider: 'PASSWORD', providerAccountId: usuario.email },
      update: {},
    });

    // Derruba os outros aparelhos: se alguém entrou com a senha antiga, sai
    // agora. A sessão atual sobrevive para a pessoa não ser expulsa da própria
    // troca de senha.
    await this.sessoes.revogarTodas(userId);

    await this.email.avisar(
      usuario.email,
      'Sua senha do GasteMenos foi alterada',
      'Se não foi você, entre em contato com a gente agora.',
    );
  }

  async pedirTrocaDeEmail(userId: string, novoEmail: string): Promise<void> {
    const email = novoEmail.trim().toLowerCase();

    const jaUsado = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (jaUsado) throw new HttpException(erro('EMAIL_ALREADY_USED'), HttpStatus.CONFLICT);

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.prisma.verificationCode.deleteMany({ where: { userId, kind: 'EMAIL_CHANGE' } });
    await this.prisma.verificationCode.create({
      data: {
        userId,
        kind: 'EMAIL_CHANGE',
        codeHash: createHash('sha256').update(codigo).digest('hex'),
        // O endereço novo fica guardado aqui até a confirmação: mudar o
        // usuário antes de confirmar deixaria a pessoa sem acesso se ela
        // tivesse digitado errado.
        target: email,
        expiresAt: emMinutos(15),
      },
    });

    await this.email.enviarCodigoDeConfirmacao(email, codigo);
  }

  async confirmarTrocaDeEmail(userId: string, codigo: string) {
    const guardado = await this.prisma.verificationCode.findFirst({
      where: { userId, kind: 'EMAIL_CHANGE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!guardado?.target) throw new HttpException(erro('INVALID_CODE'), HttpStatus.BAD_REQUEST);
    if (expirou(guardado.expiresAt)) {
      throw new HttpException(erro('CODE_EXPIRED'), HttpStatus.BAD_REQUEST);
    }

    // Mesmo contador do código de e-mail: seis dígitos sem limite de tentativa
    // é um milhão de combinações à disposição de quem tem paciência, e a troca
    // de e-mail é justamente o caminho para tomar uma conta.
    if (guardado.attempts >= MAXIMO_DE_TENTATIVAS) {
      await this.prisma.verificationCode.delete({ where: { id: guardado.id } }).catch(() => undefined);
      throw new HttpException(erro('TOO_MANY_ATTEMPTS'), HttpStatus.TOO_MANY_REQUESTS);
    }

    const calculado = createHash('sha256').update(codigo).digest();
    const esperado = Buffer.from(guardado.codeHash, 'hex');
    const confere =
      calculado.length === esperado.length && timingSafeEqual(calculado, esperado);

    if (!confere) {
      const depois = await this.prisma.verificationCode.update({
        where: { id: guardado.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (depois.attempts >= MAXIMO_DE_TENTATIVAS) {
        await this.prisma.verificationCode
          .delete({ where: { id: guardado.id } })
          .catch(() => undefined);
      }
      throw new HttpException(erro('INVALID_CODE'), HttpStatus.BAD_REQUEST);
    }

    const antigo = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const atualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { email: guardado.target, emailVerifiedAt: new Date() },
      select: { id: true, email: true },
    });

    await this.prisma.verificationCode.deleteMany({ where: { userId, kind: 'EMAIL_CHANGE' } });

    // Avisa o endereço **antigo** também: se a troca não foi a pessoa, é por
    // ali que ela descobre.
    await this.email.avisar(
      antigo.email,
      'O e-mail da sua conta do GasteMenos foi alterado',
      `A conta passou a usar ${guardado.target}. Se não foi você, entre em contato com a gente agora.`,
    );

    return atualizado;
  }

  async formasDeEntrar(userId: string) {
    return this.prisma.authAccount.findMany({
      where: { userId },
      select: { provider: true, email: true, createdAt: true },
    });
  }

  async desconectar(userId: string, provider: 'PASSWORD' | 'GOOGLE' | 'APPLE'): Promise<void> {
    const formas = await this.prisma.authAccount.count({ where: { userId } });

    if (formas <= 1) {
      // Trancar a porta com a chave dentro.
      throw new HttpException(erro('LAST_AUTH_METHOD'), HttpStatus.BAD_REQUEST);
    }

    await this.prisma.authAccount.deleteMany({ where: { userId, provider } });

    if (provider === 'PASSWORD') {
      await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: null } });
    }
  }
}
