import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { apagarUsuariosDeTeste } from './limpeza.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PontosService } from '../src/modules/jogo/pontos.service.js';
import { RankingService } from '../src/modules/jogo/ranking.service.js';
import { OfertasService } from '../src/modules/ofertas/ofertas.service.js';
import { NotificacoesService } from '../src/modules/notificacoes/notificacoes.service.js';
import { RecompensasService } from '../src/modules/recompensas/recompensas.service.js';

/**
 * Recompensa por notas lidas (docs/18-RECOMPENSAS.md, fase 1).
 *
 * O que está fixado aqui é dinheiro, então os testes olham para as três coisas
 * que custam caro quando saem erradas: **pagar duas vezes**, **pagar por nota
 * que não virou dado** e **gastar saldo que não existe**. O resto é
 * consequência.
 *
 * Os limites vêm do ambiente, e o teste os aperta para 2 e 3 notas — montar 25
 * notas de mentira por caso de teste testaria o laço do fixture, não a regra.
 */
describe('recompensas', () => {
  const prisma = new PrismaClient();
  let recompensas: RecompensasService;
  let ofertas: OfertasService;
  let ranking: RankingService;
  let avisos: jest.Mock;

  let pessoaId: string;
  let lojaId: string;
  let produtoId: string;
  let marca: string;

  const ambienteOriginal = { ...process.env };

  beforeAll(async () => {
    process.env.REWARD_FIRST_MILESTONE = '2';
    process.env.REWARD_MILESTONE_STEP = '3';
    process.env.REWARD_MILESTONE_CENTS = '200';

    avisos = jest.fn(async () => ({ gravada: true, enviada: false }));

    const modulo = await Test.createTestingModule({
      providers: [
        RecompensasService,
        OfertasService,
        RankingService,
        PontosService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificacoesService, useValue: { criar: avisos } },
      ],
    }).compile();

    recompensas = modulo.get(RecompensasService);
    ofertas = modulo.get(OfertasService);
    ranking = modulo.get(RankingService);
  });

  beforeEach(async () => {
    avisos.mockClear();
    marca = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

    const pessoa = await prisma.user.create({
      data: {
        email: `recompensa.${marca}@exemplo.test`,
        name: 'Pessoa de Teste',
        rankingName: 'Teste',
        regionGeohash: '6vjyq',
        emailVerifiedAt: new Date(),
        inviteCode: `R${marca.toUpperCase().slice(-7)}`,
      },
      select: { id: true },
    });
    pessoaId = pessoa.id;

    const loja = await prisma.store.create({
      data: {
        cnpj: `${Date.now()}${++sequencia}`.padStart(14, '9').slice(-14),
        name: `Mercado ${marca}`,
        uf: 'DF',
        geohash: '6vjyq',
      },
      select: { id: true },
    });
    lojaId = loja.id;

    const produto = await prisma.product.create({
      data: { normalizedName: `arroz-${marca}`, displayName: 'Arroz 5 kg' },
      select: { id: true },
    });
    produtoId = produto.id;
  });

  afterEach(async () => {
    await prisma.priceObservation.deleteMany({ where: { storeId: lojaId } });
    await prisma.receipt.deleteMany({ where: { userId: pessoaId } });
    await prisma.rewardBenefit.deleteMany({ where: { userId: pessoaId } });
    await prisma.rewardLedger.deleteMany({ where: { userId: pessoaId } });
    await prisma.offer.deleteMany({ where: { storeId: lojaId } });
    await prisma.store.deleteMany({ where: { id: lojaId } });
    await prisma.product.deleteMany({ where: { id: produtoId } });
    await apagarUsuariosDeTeste(prisma, [pessoaId]);
  });

  afterAll(async () => {
    process.env = ambienteOriginal;
    await prisma.$disconnect();
  });

  /** Chave sintética com 44 dígitos: nenhuma nota de pessoa real nos testes. */
  let sequencia = 0;
  const chave = (): string =>
    `35${String(Date.now()).slice(-10)}${String(++sequencia).padStart(32, '0')}`.slice(0, 44);

  /**
   * Nota que virou dado: nota concluída, item e observação de preço.
   *
   * `virouDado: false` monta a nota sem observação — é o caso da nota lida numa
   * loja sem região, que entra no histórico da pessoa e **não** vale recompensa.
   */
  async function lerNota(virouDado = true): Promise<void> {
    const nota = await prisma.receipt.create({
      data: {
        accessKey: chave(),
        userId: pessoaId,
        storeId: lojaId,
        status: 'DONE',
        source: 'qr',
        issuedAt: new Date(),
        totalCents: 2500,
        processedAt: new Date(),
      },
      select: { id: true },
    });

    const item = await prisma.receiptItem.create({
      data: {
        receiptId: nota.id,
        productId: produtoId,
        rawDescription: 'ARROZ 5KG',
        quantity: 1,
        unit: 'un',
        unitPriceCents: 2500,
        totalCents: 2500,
      },
      select: { id: true },
    });

    if (virouDado) {
      await prisma.priceObservation.create({
        data: {
          productId: produtoId,
          storeId: lojaId,
          receiptItemId: item.id,
          userHash: `hash-${marca}`,
          unitPriceCents: 2500,
          observedAt: new Date(),
          geohash: '6vjyq',
        },
      });
    }
  }

  describe('elegibilidade', () => {
    it('conta nota que virou observação de preço', async () => {
      await lerNota();
      await lerNota();

      expect(await recompensas.notasQueViraramDado(pessoaId)).toBe(2);
    });

    it('não conta nota sem observação — ler não basta, precisa virar dado', async () => {
      await lerNota(true);
      await lerNota(false);
      await lerNota(false);

      expect(await recompensas.notasQueViraramDado(pessoaId)).toBe(1);
      expect(await recompensas.avaliarMarcos(pessoaId)).toEqual([]);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(0);
    });

    it('nota que falhou na leitura não conta', async () => {
      await lerNota();
      await prisma.receipt.create({
        data: {
          accessKey: chave(),
          userId: pessoaId,
          status: 'PARSE_FAILED',
          source: 'qr',
          failureReason: 'PARSE_FAILED',
        },
      });

      expect(await recompensas.notasQueViraramDado(pessoaId)).toBe(1);
    });
  });

  describe('crédito do marco', () => {
    it('credita no marco e avisa a pessoa', async () => {
      await lerNota();
      await lerNota();

      const marcos = await recompensas.avaliarMarcos(pessoaId);

      expect(marcos).toEqual([{ milestone: 1, receipts: 2, amountCents: 200 }]);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(200);
      expect(avisos).toHaveBeenCalledTimes(1);
      expect(avisos.mock.calls[0]?.[1]).toMatchObject({
        type: 'REWARD',
        href: '/recompensas',
      });
    });

    it('avaliar de novo não paga duas vezes', async () => {
      await lerNota();
      await lerNota();

      await recompensas.avaliarMarcos(pessoaId);
      const segunda = await recompensas.avaliarMarcos(pessoaId);
      const terceira = await recompensas.avaliarMarcos(pessoaId);

      expect(segunda).toEqual([]);
      expect(terceira).toEqual([]);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(200);
    });

    it('o marco seguinte vem no passo configurado, não a cada nota', async () => {
      await lerNota();
      await lerNota();
      await recompensas.avaliarMarcos(pessoaId);

      await lerNota();
      await lerNota();
      expect(await recompensas.avaliarMarcos(pessoaId)).toEqual([]);

      await lerNota();
      const segundo = await recompensas.avaliarMarcos(pessoaId);

      expect(segundo).toEqual([{ milestone: 2, receipts: 5, amountCents: 200 }]);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(400);
    });

    /**
     * O caso que o job noturno existe para resolver. Teto estourado não pode
     * perder o marco nem pagá-lo: ele espera o ciclo seguinte.
     */
    it('teto do mês segura o crédito, e o marco é pago depois', async () => {
      await lerNota();
      await lerNota();

      process.env.REWARD_MONTHLY_BUDGET_CENTS = '1';
      expect(await recompensas.avaliarMarcos(pessoaId)).toEqual([]);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(0);

      delete process.env.REWARD_MONTHLY_BUDGET_CENTS;
      expect(await recompensas.avaliarMarcos(pessoaId)).toHaveLength(1);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(200);
    });

    it('mudar a regra não repaga marco já recebido', async () => {
      await lerNota();
      await lerNota();
      await recompensas.avaliarMarcos(pessoaId);

      // Campanha nova, limite mais baixo: quem já recebeu o primeiro marco não
      // recebe de novo porque a chave é o índice, não a quantidade de notas.
      process.env.REWARD_FIRST_MILESTONE = '1';
      const depois = await recompensas.avaliarMarcos(pessoaId);
      process.env.REWARD_FIRST_MILESTONE = '2';

      expect(depois.map((marco) => marco.milestone)).not.toContain(1);
      expect(await recompensas.saldoCentavos(pessoaId)).toBeLessThanOrEqual(400);
    });
  });

  describe('gastar no app', () => {
    async function comSaldo(): Promise<void> {
      await lerNota();
      await lerNota();
      await recompensas.avaliarMarcos(pessoaId);
    }

    it('compra debita o saldo e liga o benefício', async () => {
      await comSaldo();

      const compra = await recompensas.comprar(pessoaId, 'SELO_APOIADOR');

      expect(compra.balanceCents).toBe(100);
      expect(await recompensas.beneficioAtivo(pessoaId, 'SELO_APOIADOR')).toBe(true);
      expect(new Date(compra.endsAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('recusa quem não tem saldo, e nada é debitado', async () => {
      await expect(recompensas.comprar(pessoaId, 'SEM_PATROCINIO')).rejects.toThrow();

      expect(await recompensas.saldoCentavos(pessoaId)).toBe(0);
      expect(await recompensas.beneficioAtivo(pessoaId, 'SEM_PATROCINIO')).toBe(false);
    });

    it('item que não existe na loja não é comprável', async () => {
      await comSaldo();
      await expect(recompensas.comprar(pessoaId, 'DESCONTO_SECRETO')).rejects.toThrow();
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(200);
    });

    it('toque duplo no botão não cobra duas vezes', async () => {
      await comSaldo();

      const primeira = await recompensas.comprar(pessoaId, 'SELO_APOIADOR');
      const segunda = await recompensas.comprar(pessoaId, 'SELO_APOIADOR');

      expect(segunda.repeated).toBe(true);
      expect(segunda.endsAt).toBe(primeira.endsAt);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(100);
    });

    it('comprar de novo soma ao prazo que ainda falta, em vez de perdê-lo', async () => {
      await comSaldo();
      await recompensas.comprar(pessoaId, 'SELO_APOIADOR');

      // Volta o relógio do benefício em 10 dias para simular uma segunda compra
      // noutro minuto, sem esperar um minuto de verdade no teste.
      const antes = await prisma.rewardBenefit.findFirstOrThrow({
        where: { userId: pessoaId, code: 'SELO_APOIADOR' },
      });
      await prisma.rewardLedger.updateMany({
        where: { userId: pessoaId, reason: 'PURCHASE' },
        data: { refId: 'SELO_APOIADOR:2020-01-01T00:00' },
      });

      const segunda = await recompensas.comprar(pessoaId, 'SELO_APOIADOR');

      expect(segunda.repeated).toBe(false);
      // 90 dias somados ao que ainda faltava, não 90 contados de hoje.
      const somado = new Date(segunda.endsAt).getTime() - antes.endsAt.getTime();
      expect(Math.round(somado / (24 * 60 * 60 * 1000))).toBe(90);
      expect(await recompensas.saldoCentavos(pessoaId)).toBe(0);
    });
  });

  describe('o que o benefício muda nas telas', () => {
    it('quem comprou "sem patrocínio" não recebe oferta patrocinada', async () => {
      const parceiro = await prisma.partner.create({
        data: { name: `Parceiro ${marca}` },
        select: { id: true },
      });
      const oferta = await prisma.offer.create({
        data: {
          partnerId: parceiro.id,
          sponsored: true,
          title: 'Arroz 5 kg por R$ 19,90',
          storeId: lojaId,
          geohashes: ['6vjyq'],
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 86_400_000),
        },
        select: { id: true, impressions: true },
      });

      try {
        const antes = await ofertas.listar(pessoaId);
        expect(antes.sponsored).toHaveLength(1);

        await prisma.rewardBenefit.create({
          data: {
            userId: pessoaId,
            code: 'SEM_PATROCINIO',
            endsAt: new Date(Date.now() + 86_400_000),
          },
        });

        const depois = await ofertas.listar(pessoaId);
        expect(depois.sponsored).toHaveLength(0);

        // E a oferta não some contando impressão: o parceiro paga por quem viu.
        const final = await prisma.offer.findUniqueOrThrow({
          where: { id: oferta.id },
          select: { impressions: true },
        });
        expect(final.impressions).toBe(1);
      } finally {
        await prisma.offer.deleteMany({ where: { id: oferta.id } });
        await prisma.partner.deleteMany({ where: { id: parceiro.id } });
      }
    });

    it('o selo de apoiador aparece no ranking e não mexe na posição', async () => {
      await prisma.rewardBenefit.create({
        data: {
          userId: pessoaId,
          code: 'SELO_APOIADOR',
          endsAt: new Date(Date.now() + 86_400_000),
        },
      });

      const semSelo = await recompensas.apoiadoresEntre(['nao-existe']);
      expect(semSelo.size).toBe(0);

      const comSelo = await recompensas.apoiadoresEntre([pessoaId]);
      expect(comSelo.has(pessoaId)).toBe(true);

      const { podium, rows, me } = await ranking.calcular(pessoaId, 'friends', 'points');
      const minhaLinha = me ?? [...podium, ...rows].find((linha) => linha.userId === pessoaId);

      expect(minhaLinha?.supporter).toBe(true);
    });

    it('benefício vencido não vale mais', async () => {
      await prisma.rewardBenefit.create({
        data: {
          userId: pessoaId,
          code: 'SEM_PATROCINIO',
          startsAt: new Date(Date.now() - 2 * 86_400_000),
          endsAt: new Date(Date.now() - 86_400_000),
        },
      });

      expect(await recompensas.beneficioAtivo(pessoaId, 'SEM_PATROCINIO')).toBe(false);
      expect(await recompensas.beneficiosAtivos(pessoaId)).toHaveLength(0);
    });
  });

  describe('a tela', () => {
    it('mostra saldo, progresso, loja e extrato', async () => {
      await lerNota();
      await lerNota();
      await recompensas.avaliarMarcos(pessoaId);
      await recompensas.comprar(pessoaId, 'SELO_APOIADOR');

      const situacao = await recompensas.situacao(pessoaId);

      expect(situacao.balanceCents).toBe(100);
      expect(situacao.receiptsCounted).toBe(2);
      expect(situacao.milestonesReached).toBe(1);
      expect(situacao.nextMilestone).toMatchObject({ index: 2, receipts: 5, missing: 3 });
      expect(situacao.history.map((linha) => linha.reason)).toEqual(['PURCHASE', 'MILESTONE']);
      expect(situacao.history[0]?.description).toBe('Selo de apoiador no ranking');
      expect(situacao.history[1]?.description).toBe('Marco 1 de notas lidas');

      const selo = situacao.store.find((item) => item.code === 'SELO_APOIADOR');
      expect(selo?.activeUntil).not.toBeNull();
      expect(selo?.affordable).toBe(true);

      const semPatrocinio = situacao.store.find((item) => item.code === 'SEM_PATROCINIO');
      expect(semPatrocinio?.affordable).toBe(false);
      expect(semPatrocinio?.activeUntil).toBeNull();
    });

    it('sem nota nenhuma, o progresso começa em zero e nada quebra', async () => {
      const situacao = await recompensas.situacao(pessoaId);

      expect(situacao.balanceCents).toBe(0);
      expect(situacao.progress).toBe(0);
      expect(situacao.history).toEqual([]);
      expect(situacao.nextMilestone.missing).toBe(2);
    });
  });
});
