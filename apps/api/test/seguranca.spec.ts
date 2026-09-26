import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { apagarUsuarioDeTeste } from './limpeza.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { SessoesService } from '../src/modules/auth/sessoes.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { DadosPessoaisService } from '../src/modules/conta/dados-pessoais.service.js';
import { PontosService } from '../src/modules/jogo/pontos.service.js';
import { SelosService } from '../src/modules/jogo/selos.service.js';

/**
 * Regras de segurança que não podem regredir em silêncio.
 *
 * Elas existem porque a auditoria de 26/09/2026 encontrou os buracos —
 * `docs/16-SEGURANCA.md`. Teste de segurança serve menos para provar que hoje
 * está certo e mais para o dia em que alguém "simplifica" a verificação.
 */
describe('segurança', () => {
  const prisma = new PrismaClient();
  let auth: AuthService;
  let dadosPessoais: DadosPessoaisService;
  let pessoa: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        AuthService,
        SessoesService,
        PontosService,
        SelosService,
        DadosPessoaisService,
        EmailService,
        JwtService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    auth = modulo.get(AuthService);
    dadosPessoais = modulo.get(DadosPessoaisService);
  });

  beforeEach(async () => {
    const marca = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
    const criada = await prisma.user.create({
      data: {
        email: `seguranca.${marca}@exemplo.test`,
        name: 'Pessoa de Teste',
        rankingName: 'Pessoa T.',
        inviteCode: `S${marca.toUpperCase().slice(-7)}`,
        preferences: { create: {} },
      },
      select: { id: true },
    });
    pessoa = criada.id;
  });

  afterEach(async () => {
    await apagarUsuarioDeTeste(prisma, pessoa);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Um código de 6 dígitos guardado como hash, igual ao do fluxo real. */
  async function plantarCodigo(kind: 'EMAIL' | 'EMAIL_CHANGE', codigo = '123456') {
    return prisma.verificationCode.create({
      data: {
        userId: pessoa,
        kind,
        codeHash: createHash('sha256').update(codigo).digest('hex'),
        target: kind === 'EMAIL_CHANGE' ? 'novo.endereco@exemplo.test' : null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      select: { id: true },
    });
  }

  describe('força bruta no código de verificação', () => {
    it('o código morre depois de cinco erros, e o certo já não vale', async () => {
      const email = (
        await prisma.user.findUniqueOrThrow({ where: { id: pessoa }, select: { email: true } })
      ).email;
      await plantarCodigo('EMAIL');

      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        await expect(auth.confirmarEmail(email, '000000', 'teste')).rejects.toThrow();
      }

      // Sexta tentativa, agora com o código **certo**: já não existe mais.
      await expect(auth.confirmarEmail(email, '123456', 'teste')).rejects.toThrow();
      expect(
        await prisma.verificationCode.count({ where: { userId: pessoa, kind: 'EMAIL' } }),
      ).toBe(0);
    });

    it('o contador sobe a cada erro, e não a cada pedido', async () => {
      const email = (
        await prisma.user.findUniqueOrThrow({ where: { id: pessoa }, select: { email: true } })
      ).email;
      await plantarCodigo('EMAIL');

      await expect(auth.confirmarEmail(email, '999999', 'teste')).rejects.toThrow();

      const guardado = await prisma.verificationCode.findFirstOrThrow({
        where: { userId: pessoa, kind: 'EMAIL' },
      });
      expect(guardado.attempts).toBe(1);
    });

    it('a troca de e-mail tem o mesmo limite: é o caminho para tomar a conta', async () => {
      await plantarCodigo('EMAIL_CHANGE');

      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        await expect(dadosPessoais.confirmarTrocaDeEmail(pessoa, '000000')).rejects.toThrow();
      }

      expect(
        await prisma.verificationCode.count({ where: { userId: pessoa, kind: 'EMAIL_CHANGE' } }),
      ).toBe(0);

      // E o e-mail não mudou.
      const conta = await prisma.user.findUniqueOrThrow({
        where: { id: pessoa },
        select: { email: true },
      });
      expect(conta.email).not.toBe('novo.endereco@exemplo.test');
    });
  });

  describe('código certo continua funcionando', () => {
    it('confirma o e-mail e apaga o código usado', async () => {
      const email = (
        await prisma.user.findUniqueOrThrow({ where: { id: pessoa }, select: { email: true } })
      ).email;
      await plantarCodigo('EMAIL');

      const { user } = await auth.confirmarEmail(email, '123456', 'teste');

      expect(user.emailVerificado).toBe(true);
      expect(
        await prisma.verificationCode.count({ where: { userId: pessoa, kind: 'EMAIL' } }),
      ).toBe(0);
    });
  });
});
