import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { apagarUsuariosDeTeste } from './limpeza.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MetricasService } from '../src/modules/admin/metricas.service.js';
import { CatalogoService } from '../src/modules/admin/catalogo.service.js';
import { PessoasService } from '../src/modules/admin/pessoas.service.js';

/**
 * CRM: painel, catálogo e contas.
 *
 * O que está fixado aqui é o que não pode escapar quando alguém opera o sistema
 * por dentro: nenhum número do painel identifica pessoa, a busca de conta não
 * vira vitrine, a fusão de produto leva tudo junto e ninguém consegue se
 * trancar para fora do painel.
 */
describe('CRM', () => {
  const prisma = new PrismaClient();
  let metricas: MetricasService;
  let catalogo: CatalogoService;
  let pessoas: PessoasService;

  let adminId: string;
  let outroAdminId: string;
  let pessoaId: string;
  const criados: string[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        MetricasService,
        CatalogoService,
        PessoasService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    metricas = modulo.get(MetricasService);
    catalogo = modulo.get(CatalogoService);
    pessoas = modulo.get(PessoasService);
  });

  beforeEach(async () => {
    const marca = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

    const conta = async (prefixo: string, papel: 'USER' | 'ADMIN') =>
      (
        await prisma.user.create({
          data: {
            email: `${prefixo}.${marca}@exemplo.test`,
            name: `Pessoa ${prefixo}`,
            rankingName: prefixo,
            role: papel,
            emailVerifiedAt: new Date(),
            inviteCode: `${prefixo.slice(0, 1).toUpperCase()}${marca.toUpperCase().slice(-7)}`,
          },
          select: { id: true },
        })
      ).id;

    adminId = await conta('admin', 'ADMIN');
    outroAdminId = await conta('outro', 'ADMIN');
    pessoaId = await conta('pessoa', 'USER');
  });

  afterEach(async () => {
    if (criados.length) {
      await prisma.product.deleteMany({ where: { id: { in: criados.splice(0) } } });
    }
    await apagarUsuariosDeTeste(prisma, [adminId, outroAdminId, pessoaId]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('painel', () => {
    it('devolve os números sem identificar ninguém', async () => {
      const painel = await metricas.painel();

      expect(painel.pessoas.total).toBeGreaterThan(0);
      expect(painel.serie).toHaveLength(14);
      expect(painel.notas.taxaDeSucesso === null || painel.notas.taxaDeSucesso >= 0).toBe(true);

      // Nenhum e-mail, nome ou id de pessoa em lugar nenhum da resposta.
      const texto = JSON.stringify(painel);
      expect(texto).not.toMatch(/@exemplo\.test/);
      expect(texto).not.toMatch(/Pessoa admin/);
    });
  });

  describe('contas', () => {
    it('acha por e-mail exato e devolve o endereço mascarado', async () => {
      const email = (await prisma.user.findUniqueOrThrow({
        where: { id: pessoaId },
        select: { email: true },
      })).email;

      const achada = await pessoas.porEmail(adminId, email);

      expect(achada.id).toBe(pessoaId);
      expect(achada.email).toContain('•••');
      expect(achada.email).not.toBe(email);
    });

    it('não encontra por pedaço do e-mail: busca não é vitrine', async () => {
      await expect(pessoas.porEmail(adminId, '@exemplo.test')).rejects.toThrow();
    });

    it('a consulta a uma conta fica registrada, não só a alteração', async () => {
      const email = (await prisma.user.findUniqueOrThrow({
        where: { id: pessoaId },
        select: { email: true },
      })).email;

      await pessoas.porEmail(adminId, email);

      const registros = await prisma.adminLog.findMany({
        where: { adminId, action: 'user.read', target: pessoaId },
      });
      expect(registros).toHaveLength(1);
    });

    it('promove e rebaixa, registrando os dois lados da mudança', async () => {
      await pessoas.mudarPapel(adminId, pessoaId, 'ADMIN');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: pessoaId } })).role,
      ).toBe('ADMIN');

      await pessoas.mudarPapel(adminId, pessoaId, 'USER');

      const registro = await prisma.adminLog.findFirst({
        where: { adminId, action: 'user.role', target: pessoaId },
        orderBy: { createdAt: 'desc' },
      });
      expect(registro?.details).toMatchObject({ de: 'ADMIN', para: 'USER' });
    });

    it('ninguém tira o próprio acesso de admin', async () => {
      await expect(pessoas.mudarPapel(adminId, adminId, 'USER')).rejects.toThrow();

      // Mas outra pessoa pode: o bloqueio é contra se trancar para fora, não
      // contra perder o acesso.
      await expect(pessoas.mudarPapel(outroAdminId, adminId, 'USER')).resolves.toMatchObject({
        papel: 'USER',
      });
    });
  });

  describe('catálogo', () => {
    async function produto(nome: string, gtin?: string) {
      const criado = await prisma.product.create({
        data: {
          displayName: nome,
          normalizedName: nome.toLowerCase(),
          ...(gtin ? { gtin } : {}),
        },
        select: { id: true },
      });
      criados.push(criado.id);
      return criado.id;
    }

    it('a fila de revisão traz produto sem GTIN e diz o motivo', async () => {
      const id = await produto('Arroz sem código 5kg');

      const fila = await catalogo.paraRevisar(200);
      const achado = fila.find((item) => item.id === id);

      expect(achado).toBeDefined();
      expect(achado!.motivos).toContain('sem GTIN');
    });

    it('a fila vem ordenada por impacto, não por data', async () => {
      const fila = await catalogo.paraRevisar(200);
      const observacoes = fila.map((item) => item.observacoes);

      expect(observacoes).toEqual([...observacoes].sort((a, b) => b - a));
    });

    // Nomes inventados de propósito: com nome de produto de verdade o teste
    // esbarra no catálogo do seed e passa (ou falha) pelo motivo errado.
    it('propõe duplicados por nome parecido', async () => {
      const a = await produto('Zunfa Teste 5kg');
      const b = await produto('ZUNFA TESTE 5 KG');

      const grupos = await catalogo.possiveisDuplicados(200);
      const grupo = grupos.find((g) => g.produtos.some((p) => p.id === a));

      expect(grupo).toBeDefined();
      expect(grupo!.produtos.map((p) => p.id)).toEqual(expect.arrayContaining([a, b]));
    });

    it('não propõe quando os GTIN são diferentes: aí são produtos diferentes', async () => {
      const a = await produto('Zunfa Codigo 900ml', '7891000100103');
      const b = await produto('ZUNFA CODIGO 900 ML', '7891000999999');

      const grupos = await catalogo.possiveisDuplicados(200);
      const grupo = grupos.find((g) => g.produtos.some((p) => p.id === a || p.id === b));

      expect(grupo).toBeUndefined();
    });

    it('fundir move as observações e apaga o produto absorvido', async () => {
      const destino = await produto('Café torrado 500g');
      const origem = await produto('CAFE TORR 500 G');

      const loja = await prisma.store.findFirstOrThrow();

      /*
       * Nota **do teste**, não a primeira nota `DONE` que aparecer.
       *
       * Pegar uma nota do seed emprestada contamina o dado que as outras suítes
       * conferem: os números de gastos e da lista da Camila são o critério de
       * aceite das telas, e um item a mais na nota dela quebra outro arquivo de
       * teste — longe daqui, sem pista de por quê. É a mesma família do
       * incidente da fase 6: teste que alcança dado compartilhado.
       */
      const nota = await prisma.receipt.create({
        data: {
          userId: pessoaId,
          accessKey: `53260800000000000000650010000${Date.now().toString().slice(-9)}1`.slice(0, 44),
          status: 'DONE',
          source: 'key',
          storeId: loja.id,
          issuedAt: new Date(),
          totalCents: 2140,
        },
        select: { id: true },
      });

      const item = await prisma.receiptItem.create({
        data: {
          receiptId: nota.id,
          productId: origem,
          rawDescription: 'CAFE TORR 500 G',
          quantity: 1,
          unit: 'un.',
          unitPriceCents: 2140,
          totalCents: 2140,
        },
        select: { id: true },
      });
      await prisma.priceObservation.create({
        data: {
          productId: origem,
          storeId: loja.id,
          receiptItemId: item.id,
          userHash: 'hash-de-teste',
          unitPriceCents: 2140,
          observedAt: new Date(),
          geohash: '6vjyq',
        },
      });

      const resultado = await catalogo.fundir(adminId, destino, origem);

      expect(resultado.observacoes).toBe(1);
      expect(await prisma.product.findUnique({ where: { id: origem } })).toBeNull();
      expect(
        await prisma.priceObservation.count({ where: { productId: destino } }),
      ).toBeGreaterThanOrEqual(1);

      const registro = await prisma.adminLog.findFirst({
        where: { adminId, action: 'product.merge', target: destino },
      });
      expect(registro?.details).toMatchObject({ de: origem });

      await prisma.receiptItem.delete({ where: { id: item.id } }).catch(() => undefined);
    });

    it('recusa fundir um produto nele mesmo', async () => {
      const id = await produto('Produto solitário');
      await expect(catalogo.fundir(adminId, id, id)).rejects.toThrow();
    });
  });

  describe('auditoria', () => {
    it('é legível, com quem fez e o que fez', async () => {
      await pessoas.mudarPapel(adminId, pessoaId, 'ADMIN');

      const trilha = await pessoas.auditoria(50, 'user.role');
      const nossa = trilha.find((linha) => linha.alvo === pessoaId);

      expect(nossa).toBeDefined();
      expect(nossa!.quem).toContain('Pessoa admin');
      expect(nossa!.acao).toBe('user.role');
    });
  });
});
