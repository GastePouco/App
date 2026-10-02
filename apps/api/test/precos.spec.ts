import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PontosService } from '../src/modules/jogo/pontos.service.js';
import { PrecosService, ANONIMATO_MINIMO } from '../src/modules/precos/precos.service.js';
import { ListaService } from '../src/modules/lista/lista.service.js';
import { OfertasService } from '../src/modules/ofertas/ofertas.service.js';
import { provedoresDeRecompensa } from './provedores.js';

/**
 * Aceite da Fase 5:
 * "histórico do café igual ao da tela; loja mais barata correta; lista estima
 * R$ 146,72 no seed; oferta patrocinada sempre com selo; região sem dados
 * mostra a mensagem certa."
 *
 * Roda contra o banco semeado.
 */

/** O gráfico da tela Preços (docs/03-MODELO-DE-DADOS.md). */
const HISTORICO_DO_CAFE: Record<string, number> = {
  'month:2026-04': 2290,
  'month:2026-05': 2380,
  'month:2026-06': 2490,
  'month:2026-07': 2340,
  'month:2026-08': 2210,
  'month:2026-09': 2140,
};

const LISTA_DA_SEMANA = 14672;

describe('preços, lista e ofertas', () => {
  const prisma = new PrismaClient();
  let precos: PrecosService;
  let lista: ListaService;
  let ofertas: OfertasService;
  let camilaId: string;
  let cafeId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        PrecosService,
        ListaService,
        OfertasService,
        ...provedoresDeRecompensa(),
        PontosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    precos = modulo.get(PrecosService);
    lista = modulo.get(ListaService);
    ofertas = modulo.get(OfertasService);

    const camila = await prisma.user.findUnique({
      where: { email: 'camila.alves@email.com' },
      select: { id: true },
    });
    if (!camila) {
      throw new Error('O banco não está semeado. Rode: pnpm --filter @gastemenos/api db:seed');
    }
    camilaId = camila.id;

    const cafe = await prisma.product.findFirst({
      where: { displayName: 'Café torrado e moído 500g' },
      select: { id: true },
    });
    if (!cafe) throw new Error('Café do seed não encontrado.');
    cafeId = cafe.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('histórico de preço', () => {
    it('reproduz a queda do café de R$ 24,90 em junho para R$ 21,40 em setembro', async () => {
      const historico = await precos.historico(camilaId, cafeId, '6m');

      expect(historico.enoughData).toBe(true);

      const porPeriodo = Object.fromEntries(
        historico.points.map((ponto) => [ponto.period, ponto.avgCents]),
      );
      expect(porPeriodo).toMatchObject(HISTORICO_DO_CAFE);
    });

    it('a série vem em ordem cronológica, para o gráfico não desenhar de trás para frente', async () => {
      const historico = await precos.historico(camilaId, cafeId, '6m');
      const periodos = historico.points.map((p) => p.period);
      expect(periodos).toEqual([...periodos].sort());
    });

    it('traz o que a própria pessoa pagou, para comparar com a região', async () => {
      const historico = await precos.historico(camilaId, cafeId, '6m');
      expect(historico.userPaidCents).toBe(2140);
    });

    it('todo ponto publicado cumpre o anonimato mínimo', async () => {
      const historico = await precos.historico(camilaId, cafeId, '6m');

      for (const ponto of historico.points) {
        expect(ponto.receiptCount).toBeGreaterThanOrEqual(ANONIMATO_MINIMO.notas);
        expect(ponto.userCount).toBeGreaterThanOrEqual(ANONIMATO_MINIMO.pessoas);
      }
    });

    it('quem não tem região não recebe preço nenhum, e a tela sabe disso', async () => {
      const semRegiao = await prisma.user.create({
        data: {
          email: `sem.regiao.${Date.now()}@exemplo.test`,
          name: 'Sem Região',
          rankingName: 'Sem R.',
          emailVerifiedAt: new Date(),
          inviteCode: `SR${Date.now().toString(36).toUpperCase().slice(-6)}`,
        },
        select: { id: true },
      });

      const historico = await precos.historico(semRegiao.id, cafeId, '6m');

      // `enoughData: false` é o que faz a tela dizer "Ainda juntando preços
      // desta região" em vez de desenhar um gráfico vazio.
      expect(historico.enoughData).toBe(false);
      expect(historico.points).toHaveLength(0);
      expect(await precos.lojasMaisBaratas(semRegiao.id, cafeId)).toHaveLength(0);

      await prisma.user.delete({ where: { id: semRegiao.id } });
    });

    it('produto sem histórico não quebra a tela', async () => {
      const historico = await precos.historico(camilaId, 'produto-que-nao-existe', '6m');
      expect(historico.enoughData).toBe(false);
      expect(historico.points).toHaveLength(0);
    });
  });

  describe('lojas mais baratas', () => {
    it('vem ordenado do mais barato para o mais caro', async () => {
      const lojas = await precos.lojasMaisBaratas(camilaId, cafeId);
      const precosOrdenados = lojas.map((loja) => loja.priceCents);
      expect(precosOrdenados).toEqual([...precosOrdenados].sort((a, b) => a - b));
    });
  });

  describe('lista de compras', () => {
    it('estima R$ 146,72, como na tela', async () => {
      const atual = await lista.atual(camilaId);
      expect(atual.estimatedCents).toBe(LISTA_DA_SEMANA);
    });

    it('mudar a quantidade acompanha a estimativa', async () => {
      const atual = await lista.atual(camilaId);
      const item = atual.items.find((i) => i.label === 'Café torrado e moído 500g');
      expect(item).toBeDefined();

      const unitario = item!.estimatedCents! / item!.quantity;

      await lista.alterar(camilaId, item!.id, { quantity: 4 });
      const depois = await lista.atual(camilaId);
      const atualizado = depois.items.find((i) => i.id === item!.id);

      expect(atualizado!.estimatedCents).toBe(Math.round(unitario * 4));

      // Devolve ao estado do seed para os outros testes.
      await lista.alterar(camilaId, item!.id, { quantity: item!.quantity });
    });

    it('marcar como comprado não some com o item', async () => {
      const atual = await lista.atual(camilaId);
      const item = atual.items[0]!;

      await lista.alterar(camilaId, item.id, { checked: true });
      const depois = await lista.atual(camilaId);

      expect(depois.items).toHaveLength(atual.items.length);
      expect(depois.checkedCount).toBeGreaterThan(0);

      await lista.alterar(camilaId, item.id, { checked: false });
    });

    it('não deixa uma pessoa alterar a lista de outra', async () => {
      const atual = await lista.atual(camilaId);
      const intruso = await prisma.user.create({
        data: {
          email: `intruso.${Date.now()}@exemplo.test`,
          name: 'Intruso',
          rankingName: 'Intruso',
          emailVerifiedAt: new Date(),
          inviteCode: `IN${Date.now().toString(36).toUpperCase().slice(-6)}`,
        },
        select: { id: true },
      });

      // Conhecer o id do item não basta: o dono é conferido pelo caminho
      // item → lista → usuário.
      const resultado = await lista.alterar(intruso.id, atual.items[0]!.id, { checked: true });
      expect(resultado).toBeNull();

      await prisma.user.delete({ where: { id: intruso.id } });
    });
  });

  describe('ofertas', () => {
    it('toda oferta patrocinada carrega o selo, sem exceção', async () => {
      const resposta = await ofertas.listar(camilaId);

      expect(resposta.sponsored.length).toBeGreaterThan(0);
      for (const oferta of resposta.sponsored) {
        expect(oferta.sponsored).toBe(true);
      }
    });

    it('no máximo uma patrocinada por página', async () => {
      const resposta = await ofertas.listar(camilaId);
      expect(resposta.sponsored.length).toBeLessThanOrEqual(1);
    });

    it('oferta da comunidade nunca é marcada como patrocinada', async () => {
      const resposta = await ofertas.listar(camilaId);
      for (const oferta of resposta.community) {
        expect(oferta.sponsored).toBe(false);
      }
    });
  });
});
