import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { apagarUsuarioDeTeste } from './limpeza.js';
import { LIMITES, PONTOS } from '@gastemenos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PontosService } from '../src/modules/jogo/pontos.service.js';
import { RankingService } from '../src/modules/jogo/ranking.service.js';
import { SelosService } from '../src/modules/jogo/selos.service.js';
import { AmigosService } from '../src/modules/jogo/amigos.service.js';
import { SequenciaService } from '../src/modules/jogo/sequencia.service.js';
import { provedoresDeRecompensa } from './provedores.js';

/**
 * Aceite da Fase 6: "ranking do seed igual à tela; limites anti-abuso
 * testados".
 *
 * O ranking é **calculado** a partir das notas e dos pontos dos amigos, não
 * plantado numa tabela de posições — é isso que faz o teste provar a agregação,
 * e não que alguém digitou o pódio certo.
 */

/** referencia/telas/Ranking.dc.html, visão Amigos. */
const TELA = {
  economia: [
    ['Rafa Lima', 21240],
    ['Bia Souza', 18710],
    ['João Pedro', 16480],
    ['Lu Andrade', 15130],
    ['Camila A.', 13820],
    ['Theo Martins', 9760],
  ] as Array<[string, number]>,
  compras: [
    ['Bia Souza', 19],
    ['Camila A.', 15],
    ['Rafa Lima', 13],
    ['Theo Martins', 12],
    ['João Pedro', 11],
    ['Lu Andrade', 9],
  ] as Array<[string, number]>,
  pontos: [
    ['Rafa Lima', 2340],
    ['João Pedro', 1980],
    ['Bia Souza', 1870],
    ['Camila A.', 1620],
    ['Lu Andrade', 1420],
    ['Theo Martins', 880],
  ] as Array<[string, number]>,
};

describe('jogo', () => {
  const prisma = new PrismaClient();
  let ranking: RankingService;
  let selos: SelosService;
  let amigos: AmigosService;
  let sequencia: SequenciaService;
  let pontos: PontosService;
  let camilaId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        RankingService,
        ...provedoresDeRecompensa(),
        SelosService,
        AmigosService,
        SequenciaService,
        PontosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    ranking = modulo.get(RankingService);
    selos = modulo.get(SelosService);
    amigos = modulo.get(AmigosService);
    sequencia = modulo.get(SequenciaService);
    pontos = modulo.get(PontosService);

    const camila = await prisma.user.findUnique({
      where: { email: 'camila.alves@email.com' },
      select: { id: true },
    });
    if (!camila) {
      throw new Error('O banco não está semeado. Rode: pnpm --filter @gastemenos/api db:seed');
    }
    camilaId = camila.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('ranking de setembro bate com a tela', () => {
    it('"Mais economizou" na ordem e nos valores da tela', async () => {
      const { podium, rows } = await ranking.calcular(camilaId, 'friends', 'savings', '2026-09');
      const todos = [...podium, ...rows];

      expect(todos.map((linha) => [linha.name, linha.value])).toEqual(TELA.economia);
    });

    it('"Mais compras" na ordem e nos valores da tela', async () => {
      const { podium, rows } = await ranking.calcular(camilaId, 'friends', 'purchases', '2026-09');
      const todos = [...podium, ...rows];

      expect(todos.map((linha) => [linha.name, linha.value])).toEqual(TELA.compras);
    });

    it('"Mais pontos" na ordem e nos valores da tela', async () => {
      const { podium, rows } = await ranking.calcular(camilaId, 'friends', 'points', '2026-09');
      const todos = [...podium, ...rows];

      expect(todos.map((linha) => [linha.name, linha.value])).toEqual(TELA.pontos);
    });

    it('o pódio são exatamente os três primeiros', async () => {
      const { podium } = await ranking.calcular(camilaId, 'friends', 'savings', '2026-09');
      expect(podium).toHaveLength(3);
      expect(podium.map((linha) => linha.rank)).toEqual([1, 2, 3]);
    });

    it('a pessoa se reconhece na lista', async () => {
      const { me } = await ranking.calcular(camilaId, 'friends', 'savings', '2026-09');
      expect(me).not.toBeNull();
      expect(me!.isMe).toBe(true);
      expect(me!.rank).toBe(5);
    });
  });

  describe('privacidade no ranking', () => {
    it('quem desligou "Mostrar meu nome" vira Economizador anônimo, sem perder a posição', async () => {
      const rafa = await prisma.user.findFirst({
        where: { name: 'Rafa Lima' },
        select: { id: true },
      });

      await prisma.preferences.update({
        where: { userId: rafa!.id },
        data: { showName: false },
      });

      const { podium } = await ranking.calcular(camilaId, 'friends', 'savings', '2026-09');

      // Continua em primeiro, só sem o nome.
      expect(podium[0]!.name).toBe('Economizador anônimo');
      expect(podium[0]!.rank).toBe(1);
      expect(podium[0]!.value).toBe(21240);

      await prisma.preferences.update({
        where: { userId: rafa!.id },
        data: { showName: true },
      });
    });

    it('conta pausada some do ranking', async () => {
      const bia = await prisma.user.findFirst({
        where: { name: 'Bia Souza' },
        select: { id: true },
      });

      await prisma.user.update({ where: { id: bia!.id }, data: { status: 'PAUSED' } });

      const { podium, rows } = await ranking.calcular(camilaId, 'friends', 'savings', '2026-09');
      const nomes = [...podium, ...rows].map((linha) => linha.name);
      expect(nomes).not.toContain('Bia Souza');

      await prisma.user.update({ where: { id: bia!.id }, data: { status: 'ACTIVE' } });
    });
  });

  describe('limites contra abuso', () => {
    let cobaia: string;

    beforeEach(async () => {
      const usuario = await prisma.user.create({
        data: {
          email: `cobaia.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@exemplo.test`,
          name: 'Cobaia',
          rankingName: 'Cobaia',
          emailVerifiedAt: new Date(),
          inviteCode: `C${Date.now().toString(36).toUpperCase().slice(-7)}`,
          preferences: { create: {} },
        },
        select: { id: true },
      });
      cobaia = usuario.id;
    });

    afterEach(async () => {
      await apagarUsuarioDeTeste(prisma, cobaia);
    });

    it('o mesmo evento não credita duas vezes', async () => {
      const primeira = await pontos.creditar(cobaia, PONTOS.NOTA_LIDA, 'RECEIPT', 'nota-x');
      const segunda = await pontos.creditar(cobaia, PONTOS.NOTA_LIDA, 'RECEIPT', 'nota-x');

      expect(primeira.creditado).toBe(true);
      // A restrição de unicidade do banco é o que impede o crédito duplo —
      // não uma checagem em memória, que perderia numa corrida.
      expect(segunda.creditado).toBe(false);
      expect(await pontos.total(cobaia)).toBe(PONTOS.NOTA_LIDA);
    });

    it('a semana credita uma vez, por mais notas que a pessoa leia', async () => {
      const segunda = new Date('2026-09-21T15:00:00Z');
      const quinta = new Date('2026-09-24T15:00:00Z');

      expect(await sequencia.creditarSemana(cobaia, segunda)).toBe(true);
      expect(await sequencia.creditarSemana(cobaia, quinta)).toBe(false);
      expect(await pontos.total(cobaia)).toBe(PONTOS.SEMANA_COM_NOTA);
    });

    it('semanas diferentes creditam separado', async () => {
      await sequencia.creditarSemana(cobaia, new Date('2026-09-21T15:00:00Z'));
      await sequencia.creditarSemana(cobaia, new Date('2026-09-28T15:00:00Z'));

      expect(await pontos.total(cobaia)).toBe(PONTOS.SEMANA_COM_NOTA * 2);
    });

    it('domingo à noite em Brasília ainda é a semana que está acabando', async () => {
      // 22h de domingo em Brasília é 01h de segunda em UTC. Sem o ajuste de
      // fuso, a nota cairia na semana seguinte e a pessoa perderia a sequência
      // por um detalhe invisível para ela.
      const domingoTarde = new Date('2026-09-27T22:00:00-03:00');
      const quartaAnterior = new Date('2026-09-23T15:00:00-03:00');

      expect(sequencia.chaveDaSemana(domingoTarde)).toBe(
        sequencia.chaveDaSemana(quartaAnterior),
      );
    });

    it('o limite diário de notas com pontos é respeitado', async () => {
      for (let i = 0; i < LIMITES.NOTAS_COM_PONTOS_POR_DIA; i++) {
        await pontos.creditar(cobaia, PONTOS.NOTA_LIDA, 'RECEIPT', `nota-${i}`);
      }

      expect(await pontos.podeCreditarNota(cobaia)).toBe(false);
    });

    it('estorno é lançamento negativo, não apagamento', async () => {
      await pontos.creditar(cobaia, PONTOS.NOTA_LIDA, 'RECEIPT', 'nota-y');
      await pontos.estornar(cobaia, PONTOS.NOTA_LIDA, 'nota-y');

      expect(await pontos.total(cobaia)).toBe(0);

      // A história continua no livro-razão: dois lançamentos, não zero.
      const lancamentos = await prisma.pointsLedger.count({ where: { userId: cobaia } });
      expect(lancamentos).toBe(2);
    });

    it('não dá para entrar no próprio convite', async () => {
      const usuario = await prisma.user.findUnique({
        where: { id: cobaia },
        select: { inviteCode: true },
      });

      await expect(amigos.entrarComCodigo(cobaia, usuario!.inviteCode)).rejects.toMatchObject({
        response: { code: 'INVITE_SELF' },
      });
    });

    it('código inexistente dá mensagem clara, não erro genérico', async () => {
      await expect(amigos.entrarComCodigo(cobaia, 'NAOEXISTE')).rejects.toMatchObject({
        response: { code: 'INVITE_NOT_FOUND' },
      });
    });
  });

  describe('selos', () => {
    it('a Camila tem os 9 selos listados, com progresso', async () => {
      const lista = await selos.listar(camilaId);
      expect(lista).toHaveLength(9);

      for (const selo of lista) {
        expect(selo.progress).toBeLessThanOrEqual(selo.target);
        expect(selo.progress).toBeGreaterThanOrEqual(0);
      }
    });

    /**
     * "Carrinho Esperto" conta nota **do mês corrente**, e o seed tem as 15
     * notas de setembro de 2026. A primeira versão deste teste exigia 15 fixo e
     * passou a falhar sozinha em 1º de outubro — teste que depende do calendário
     * acusa o relógio, não o código.
     *
     * A afirmação que interessa é outra: o progresso **sai dos dados**. Então
     * ele é conferido contra a contagem de notas do mês feita aqui, no banco.
     */
    it('o progresso é recalculado dos dados, não incrementado', async () => {
      const agora = new Date();
      const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
      const notasDoMes = await prisma.receipt.count({
        where: { userId: camilaId, status: 'DONE', issuedAt: { gte: inicioDoMes } },
      });

      const lista = await selos.listar(camilaId);
      const carrinho = lista.find((selo) => selo.id === 'carrinho_esperto');

      expect(carrinho).toBeDefined();
      expect(carrinho!.progress).toBe(Math.min(notasDoMes, carrinho!.target));
    });

    it('conferir de novo não concede o mesmo selo duas vezes', async () => {
      const primeira = await selos.conferirEConceder(camilaId);
      const segunda = await selos.conferirEConceder(camilaId);

      // A segunda passada não tem novidade nenhuma para comemorar.
      expect(segunda).toHaveLength(0);
      expect(primeira.length).toBeGreaterThanOrEqual(0);
    });
  });
});
