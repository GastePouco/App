import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import JSZip from 'jszip';
import { apagarUsuarioDeTeste } from './limpeza.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { SessoesService } from '../src/modules/auth/sessoes.service.js';
import { PrivacidadeService } from '../src/modules/privacidade/privacidade.service.js';
import { ArmazenamentoService } from '../src/modules/armazenamento/armazenamento.service.js';
import { PreferenciasService } from '../src/modules/conta/preferencias.service.js';
import { DadosPessoaisService } from '../src/modules/conta/dados-pessoais.service.js';
import { RankingService } from '../src/modules/jogo/ranking.service.js';
import { NotificacoesService } from '../src/modules/notificacoes/notificacoes.service.js';
import { RecompensasService } from '../src/modules/recompensas/recompensas.service.js';

/**
 * Aceite da Fase 7:
 * "pausar tira do ranking e para notificações; encerrar exige ENCERRAR e pode
 * ser desfeito entrando de novo; exportação gera ZIP; trocar e-mail exige
 * código; todas as preferências de acessibilidade persistem entre aparelhos."
 */

describe('conta, privacidade e notificações', () => {
  const prisma = new PrismaClient();
  let privacidade: PrivacidadeService;
  let preferencias: PreferenciasService;
  let dadosPessoais: DadosPessoaisService;
  let notificacoes: NotificacoesService;
  let ranking: RankingService;
  let pessoa: string;

  const ambienteOriginal = { ...process.env };
  let pastaDeTeste: string;

  beforeAll(async () => {
    // O ZIP de "baixar meus dados" vai para o Supabase Storage quando há
    // credenciais no `.env` — e passou a haver. O teste então dependia de rede e
    // de uma conta externa: a exportação ficava em `PENDING` com "fetch failed"
    // numa máquina sem acesso. Disco local aqui, como em armazenamento.spec.ts.
    pastaDeTeste = await mkdtemp(join(tmpdir(), 'gastemenos-conta-'));
    process.env.EXPORT_DIR = pastaDeTeste;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const modulo = await Test.createTestingModule({
      providers: [
        PrivacidadeService,
        ArmazenamentoService,
        PreferenciasService,
        DadosPessoaisService,
        NotificacoesService,
        RankingService,
        // Aqui entra o serviço de verdade, sem dublê de notificação: este
        // arquivo testa notificação, e o dublê de `provedores.ts` sobrescreveria
        // o serviço real — foi o que aconteceu na primeira tentativa.
        RecompensasService,
        SessoesService,
        EmailService,
        JwtService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    privacidade = modulo.get(PrivacidadeService);
    preferencias = modulo.get(PreferenciasService);
    dadosPessoais = modulo.get(DadosPessoaisService);
    notificacoes = modulo.get(NotificacoesService);
    ranking = modulo.get(RankingService);
  });

  beforeEach(async () => {
    const usuario = await prisma.user.create({
      data: {
        email: `conta.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@exemplo.test`,
        name: 'Pessoa de Teste',
        rankingName: 'Pessoa T.',
        emailVerifiedAt: new Date(),
        inviteCode: `P${Date.now().toString(36).toUpperCase().slice(-7)}`,
        regionGeohash: '6vjyq',
        preferences: { create: {} },
        accounts: { create: { provider: 'GOOGLE', providerAccountId: `g-${Date.now()}` } },
      },
      select: { id: true },
    });
    pessoa = usuario.id;
  });

  afterEach(async () => {
    await apagarUsuarioDeTeste(prisma, pessoa);
  });

  afterAll(async () => {
    process.env = { ...ambienteOriginal };
    await rm(pastaDeTeste, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  describe('pausar', () => {
    it('some do ranking da região', async () => {
      const antes = await ranking.calcular(pessoa, 'region', 'savings', '2026-09');
      expect([...antes.podium, ...antes.rows].some((linha) => linha.isMe)).toBe(true);

      await privacidade.pausar(pessoa, null);

      const depois = await ranking.calcular(pessoa, 'region', 'savings', '2026-09');
      expect([...depois.podium, ...depois.rows].some((linha) => linha.isMe)).toBe(false);
    });

    it('para de receber notificação', async () => {
      const ativa = await notificacoes.criar(pessoa, {
        type: 'PRICE_DROP',
        title: 'Café mais barato',
        href: '/ofertas',
      });
      expect(ativa.gravada).toBe(true);

      await privacidade.pausar(pessoa, null);

      const pausada = await notificacoes.criar(pessoa, {
        type: 'PRICE_DROP',
        title: 'Café mais barato de novo',
        href: '/ofertas',
      });
      expect(pausada.gravada).toBe(false);
    });

    it('reativar devolve tudo, com os dados intactos', async () => {
      await privacidade.pausar(pessoa, null);
      await privacidade.reativar(pessoa);

      const usuario = await prisma.user.findUniqueOrThrow({ where: { id: pessoa } });
      expect(usuario.status).toBe('ACTIVE');
      expect(usuario.pausedUntil).toBeNull();

      const volta = await notificacoes.criar(pessoa, {
        type: 'PRICE_DROP',
        title: 'Voltou',
        href: '/ofertas',
      });
      expect(volta.gravada).toBe(true);
    });
  });

  describe('encerrar conta', () => {
    it('sem a palavra ENCERRAR, não acontece nada', async () => {
      await expect(privacidade.agendarExclusao(pessoa, 'encerrar')).rejects.toMatchObject({
        response: { code: 'CONFIRMATION_MISMATCH' },
      });
      await expect(privacidade.agendarExclusao(pessoa, 'sim')).rejects.toMatchObject({
        response: { code: 'CONFIRMATION_MISMATCH' },
      });

      const usuario = await prisma.user.findUniqueOrThrow({ where: { id: pessoa } });
      expect(usuario.status).toBe('ACTIVE');
    });

    it('agenda para 30 dias, não apaga na hora', async () => {
      const { deletionAt } = await privacidade.agendarExclusao(pessoa, 'ENCERRAR');

      const usuario = await prisma.user.findUniqueOrThrow({ where: { id: pessoa } });
      expect(usuario.status).toBe('PENDING_DELETION');

      const dias = Math.round((deletionAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(dias).toBe(30);
    });

    it('dá para desfazer dentro do prazo', async () => {
      await privacidade.agendarExclusao(pessoa, 'ENCERRAR');
      await privacidade.cancelarExclusao(pessoa);

      const usuario = await prisma.user.findUniqueOrThrow({ where: { id: pessoa } });
      expect(usuario.status).toBe('ACTIVE');
      expect(usuario.deletionAt).toBeNull();
    });

    it('o expurgo não toca em quem ainda está no prazo', async () => {
      await privacidade.agendarExclusao(pessoa, 'ENCERRAR');
      await privacidade.apagarVencidos();

      const aindaExiste = await prisma.user.findUnique({ where: { id: pessoa } });
      expect(aindaExiste).not.toBeNull();
    });

    it('o expurgo apaga quem passou do prazo', async () => {
      await privacidade.agendarExclusao(pessoa, 'ENCERRAR');
      // Volta o relógio: o prazo venceu ontem.
      await prisma.user.update({
        where: { id: pessoa },
        data: { deletionAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const apagadas = await privacidade.apagarVencidos();
      expect(apagadas).toBeGreaterThanOrEqual(1);

      expect(await prisma.user.findUnique({ where: { id: pessoa } })).toBeNull();
    });
  });

  describe('baixar meus dados', () => {
    it('gera um ZIP legível, com JSON e CSV', async () => {
      const pedido = await privacidade.exportar(pessoa);
      expect(pedido.status).toBe('PENDING');

      // A geração é assíncrona; espera ficar pronta.
      let situacao = await privacidade.situacaoDaExportacao(pessoa, pedido.id);
      for (let i = 0; i < 40 && situacao.status !== 'READY'; i++) {
        await new Promise((resolver) => setTimeout(resolver, 100));
        situacao = await privacidade.situacaoDaExportacao(pessoa, pedido.id);
      }
      expect(situacao.status).toBe('READY');

      const arquivo = await privacidade.baixar(pessoa, pedido.id);
      const zip = await JSZip.loadAsync(arquivo);

      const nomes = Object.keys(zip.files);
      expect(nomes).toEqual(
        expect.arrayContaining([
          'leia-me.txt',
          'conta.json',
          'notas.json',
          'notas.csv',
          'itens.csv',
          'listas.json',
          'pontos.json',
          // Saldo de recompensa é dinheiro da pessoa: sai no pacote sem ela
          // precisar pedir à parte (docs/18-RECOMPENSAS.md).
          'recompensa.json',
        ]),
      );

      const conta = JSON.parse(await zip.file('conta.json')!.async('string')) as {
        email: string;
      };
      expect(conta.email).toContain('@exemplo.test');

      // O CSV precisa abrir no Excel em português: BOM e ponto e vírgula.
      const csv = await zip.file('notas.csv')!.async('string');
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.split('\r\n')[0]).toContain(';');
    }, 20_000);

    it('a exportação de uma pessoa não é acessível por outra', async () => {
      const pedido = await privacidade.exportar(pessoa);

      const intruso = await prisma.user.create({
        data: {
          email: `intruso.${Date.now()}@exemplo.test`,
          name: 'Intruso',
          rankingName: 'Intruso',
          inviteCode: `X${Date.now().toString(36).toUpperCase().slice(-7)}`,
        },
        select: { id: true },
      });

      await expect(
        privacidade.situacaoDaExportacao(intruso.id, pedido.id),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });

      await apagarUsuarioDeTeste(prisma, intruso.id);
    });
  });

  /**
   * CPF — entra por uma finalidade só (a recompensa) e nunca em claro.
   *
   * O CPF 529.982.247-25 é inventado, com dígito verificador calculado para o
   * teste; nenhum CPF de pessoa real entra em arquivo deste repositório.
   */
  describe('CPF para a recompensa', () => {
    const CPF = '529.982.247-25';
    const OUTRO = '111.444.777-35';

    it('vincula, devolve mascarado e guarda só o hash', async () => {
      const resposta = await dadosPessoais.vincularCpf(pessoa, CPF);

      expect(resposta.cpfMascarado).toBe('***.***.247-25');

      const guardado = await prisma.user.findUniqueOrThrow({
        where: { id: pessoa },
        select: { cpfHash: true },
      });
      expect(guardado.cpfHash).toMatch(/^[0-9a-f]{64}$/);
      expect(guardado.cpfHash).not.toContain('529');
      expect(guardado.cpfHash).not.toContain('52998224725');
    });

    it('registra o consentimento ao vincular e ao remover', async () => {
      await dadosPessoais.vincularCpf(pessoa, CPF);
      await dadosPessoais.desvincularCpf(pessoa);

      const consentimentos = await prisma.consent.findMany({
        where: { userId: pessoa, kind: 'reward_cpf_v1' },
        orderBy: { createdAt: 'asc' },
        select: { granted: true },
      });
      expect(consentimentos.map((c) => c.granted)).toEqual([true, false]);
    });

    it('recusa CPF com dígito errado e sequência de um só algarismo', async () => {
      await expect(dadosPessoais.vincularCpf(pessoa, '529.982.247-24')).rejects.toThrow();
      await expect(dadosPessoais.vincularCpf(pessoa, '111.111.111-11')).rejects.toThrow();

      const guardado = await prisma.user.findUniqueOrThrow({
        where: { id: pessoa },
        select: { cpfHash: true },
      });
      expect(guardado.cpfHash).toBeNull();
    });

    /** A recompensa é uma por pessoa: é isto que impede dez contas, dez prêmios. */
    it('recusa um CPF que já está em outra conta', async () => {
      const outra = await prisma.user.create({
        data: {
          email: `cpf.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@exemplo.test`,
          name: 'Outra Pessoa',
          rankingName: 'Outra P.',
          emailVerifiedAt: new Date(),
          inviteCode: `O${Date.now().toString(36).toUpperCase().slice(-7)}`,
        },
        select: { id: true },
      });

      try {
        await dadosPessoais.vincularCpf(outra.id, CPF);
        await expect(dadosPessoais.vincularCpf(pessoa, CPF)).rejects.toThrow();

        // E o outro CPF continua livre: a recusa é do número, não da conta.
        await expect(dadosPessoais.vincularCpf(pessoa, OUTRO)).resolves.toBeDefined();
      } finally {
        await apagarUsuarioDeTeste(prisma, outra.id);
      }
    });

    it('vincular de novo o mesmo CPF na mesma conta não é conflito', async () => {
      await dadosPessoais.vincularCpf(pessoa, CPF);
      await expect(dadosPessoais.vincularCpf(pessoa, CPF)).resolves.toBeDefined();
    });

    it('remover apaga o hash e a confirmação junto', async () => {
      await dadosPessoais.vincularCpf(pessoa, CPF);
      await prisma.user.update({ where: { id: pessoa }, data: { cpfVerifiedAt: new Date() } });

      await dadosPessoais.desvincularCpf(pessoa);

      const depois = await prisma.user.findUniqueOrThrow({
        where: { id: pessoa },
        select: { cpfHash: true, cpfVerifiedAt: true },
      });
      // A confirmação era daquele CPF: mantê-la sem o vínculo afirmaria uma
      // prova que não existe mais.
      expect(depois.cpfHash).toBeNull();
      expect(depois.cpfVerifiedAt).toBeNull();
    });
  });

  describe('trocar de e-mail', () => {
    it('exige o código, e o e-mail só muda depois da confirmação', async () => {
      const novo = `novo.${Date.now()}@exemplo.test`;
      await dadosPessoais.pedirTrocaDeEmail(pessoa, novo);

      // Ainda não mudou: se tivesse mudado antes de confirmar, um endereço
      // digitado errado deixaria a pessoa sem recuperação de senha.
      const durante = await prisma.user.findUniqueOrThrow({ where: { id: pessoa } });
      expect(durante.email).not.toBe(novo);

      await expect(dadosPessoais.confirmarTrocaDeEmail(pessoa, '000000')).rejects.toMatchObject({
        response: { code: 'INVALID_CODE' },
      });

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: pessoa } })).email,
      ).not.toBe(novo);
    });

    it('recusa um e-mail que já tem conta', async () => {
      const outro = await prisma.user.create({
        data: {
          email: `ocupado.${Date.now()}@exemplo.test`,
          name: 'Ocupado',
          rankingName: 'Ocupado',
          inviteCode: `O${Date.now().toString(36).toUpperCase().slice(-7)}`,
        },
        select: { id: true, email: true },
      });

      await expect(dadosPessoais.pedirTrocaDeEmail(pessoa, outro.email)).rejects.toMatchObject({
        response: { code: 'EMAIL_ALREADY_USED' },
      });

      await apagarUsuarioDeTeste(prisma, outro.id);
    });
  });

  describe('formas de entrar', () => {
    it('não deixa remover a última', async () => {
      // A pessoa de teste só tem o Google.
      await expect(dadosPessoais.desconectar(pessoa, 'GOOGLE')).rejects.toMatchObject({
        response: { code: 'LAST_AUTH_METHOD' },
      });
    });

    it('deixa remover quando há outra', async () => {
      await dadosPessoais.trocarSenha(pessoa, '', 'Economia2026');

      await dadosPessoais.desconectar(pessoa, 'GOOGLE');
      expect(await dadosPessoais.formasDeEntrar(pessoa)).toHaveLength(1);
    });
  });

  describe('preferências', () => {
    it('ficam no servidor, então valem em qualquer aparelho', async () => {
      await preferencias.alterar(pessoa, {
        textSize: 'MUITO_GRANDE',
        theme: 'CONTRAST',
        easyMode: true,
        reduceMotion: true,
      });

      // Uma segunda leitura é o que outro aparelho faria.
      const deOutroAparelho = await preferencias.ler(pessoa);

      expect(deOutroAparelho.textSize).toBe('MUITO_GRANDE');
      expect(deOutroAparelho.theme).toBe('CONTRAST');
      expect(deOutroAparelho.easyMode).toBe(true);
      expect(deOutroAparelho.reduceMotion).toBe(true);
    });

    it('compartilhar com parceiros começa desligado', async () => {
      const padrao = await preferencias.ler(pessoa);
      expect(padrao.sharePartners).toBe(false);
      expect(padrao.notifySponsored).toBe(false);
    });

    it('mexer num interruptor de compartilhamento grava o consentimento', async () => {
      await preferencias.alterar(pessoa, { sharePartners: true });

      const registros = await prisma.consent.findMany({
        where: { userId: pessoa, kind: 'sharePartners' },
      });
      expect(registros).toHaveLength(1);
      expect(registros[0]!.granted).toBe(true);

      await preferencias.alterar(pessoa, { sharePartners: false });

      // A revogação também fica registrada: o histórico é a prova.
      const depois = await prisma.consent.findMany({
        where: { userId: pessoa, kind: 'sharePartners' },
        orderBy: { createdAt: 'asc' },
      });
      expect(depois).toHaveLength(2);
      expect(depois[1]!.granted).toBe(false);
    });
  });

  describe('horário de silêncio', () => {
    it('atravessa a meia-noite', async () => {
      // Padrão 22:00–08:00. Comparar "maior que 22 e menor que 8" daria
      // sempre falso — por isso o caso existe.
      const duasDaManha = new Date('2026-09-24T05:00:00Z'); // 02:00 em Brasília
      const meioDia = new Date('2026-09-24T15:00:00Z'); // 12:00 em Brasília

      expect(await preferencias.emSilencio(pessoa, duasDaManha)).toBe(true);
      expect(await preferencias.emSilencio(pessoa, meioDia)).toBe(false);
    });

    it('em silêncio a notificação é guardada, só não vira push', async () => {
      const resultado = await notificacoes.criar(pessoa, {
        type: 'PRICE_DROP',
        title: 'Guardada de madrugada',
        href: '/ofertas',
      });

      // Guardar e não avisar é diferente de não guardar.
      expect(resultado.gravada).toBe(true);
    });
  });

  describe('notificações', () => {
    it('aviso de segurança ignora os interruptores', async () => {
      await preferencias.alterar(pessoa, {
        notifyPriceDrop: false,
        notifyRanking: false,
        notifyStreak: false,
      });

      const preco = await notificacoes.criar(pessoa, {
        type: 'PRICE_DROP',
        title: 'Não deveria chegar',
        href: '/ofertas',
      });
      expect(preco.gravada).toBe(false);

      const conta = await notificacoes.criar(pessoa, {
        type: 'ACCOUNT',
        title: 'Sua senha foi alterada',
        href: '/perfil/seguranca',
      });
      expect(conta.gravada).toBe(true);
    });

    it('a permissão de push só é pedida depois da primeira nota', async () => {
      expect(await notificacoes.podePedirPermissao(pessoa)).toBe(false);
    });
  });
});
