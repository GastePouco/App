import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { apagarUsuarioDeTeste } from './limpeza.js';
import { PONTOS, calcularDigitoVerificador } from '@gastemenos/shared';
import { configuracao } from '../src/comum/configuracao.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PontosService } from '../src/modules/jogo/pontos.service.js';
import { SequenciaService } from '../src/modules/jogo/sequencia.service.js';
import { AmigosService } from '../src/modules/jogo/amigos.service.js';
import { SelosService } from '../src/modules/jogo/selos.service.js';
import { NotasService } from '../src/modules/notas/notas.service.js';
import { ProdutosService } from '../src/modules/notas/produtos.service.js';
import { RegistroDeAdaptadores } from '../src/modules/notas/adaptadores/registro.js';
import { AdaptadorDoDf } from '../src/modules/notas/adaptadores/df.adaptador.js';
import { AdaptadorDeSp } from '../src/modules/notas/adaptadores/sp.adaptador.js';
import { ArmazenamentoService } from '../src/modules/armazenamento/armazenamento.service.js';
import { ErroDeLeitura } from '../src/modules/notas/adaptadores/adaptador.js';
import { provedoresDeRecompensa } from './provedores.js';

/**
 * Integração da leitura de nota contra o banco de verdade.
 *
 * O que o teste do parser não cobre e este cobre: se a nota é gravada com os
 * itens certos, se os pontos são creditados uma vez só, se a mesma chave é
 * recusada na segunda vez, se a observação de preço entra sem ligação com a
 * pessoa e se excluir a nota estorna os pontos.
 *
 * Roda contra o Postgres do docker-compose. Cria e apaga os próprios dados.
 */

/**
 * Monta uma chave válida fechando o dígito verificador.
 *
 * Chave inventada à mão é recusada pela própria validação — o que é o
 * comportamento certo, e a razão de existir esta função.
 */
function chaveDoDf(numero: string, aamm = '2609'): string {
  const uf = '53'; //          2  DF
  const cnpj = '08376451000129'; // 14  Supermercado Vila Nova, o da fixture
  const modelo = '65'; //      2  NFC-e
  const serie = '001'; //      3
  const tipoDeEmissao = '1'; // 1
  const codigo = '10000001'; // 8

  // 2 + 4 + 14 + 2 + 3 + 9 + 1 + 8 = 43, mais o dígito verificador = 44.
  const base =
    uf + aamm + cnpj + modelo + serie + numero.padStart(9, '0') + tipoDeEmissao + codigo;

  return base + calcularDigitoVerificador(base);
}

const CHAVE = chaveDoDf('000000123');

function fixture(nome: string): string {
  return readFileSync(join(__dirname, 'fixtures/nfce/df', nome), 'utf8');
}

describe('leitura de nota (integração)', () => {
  const prisma = new PrismaClient();
  let notas: NotasService;
  let pontos: PontosService;
  let userId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        NotasService,
        ...provedoresDeRecompensa(),
        ProdutosService,
        PontosService,
        // A leitura de nota agora credita a semana, premia quem convidou e
        // confere os selos — tudo numa passada só.
        SequenciaService,
        AmigosService,
        SelosService,
        RegistroDeAdaptadores,
        AdaptadorDoDf,
        AdaptadorDeSp,
        ArmazenamentoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    notas = modulo.get(NotasService);
    pontos = modulo.get(PontosService);

    // As categorias precisam existir para o casamento de produto classificar.
    for (const slug of ['mercearia', 'hortifruti', 'limpeza', 'bebidas', 'carnes', 'outros']) {
      await prisma.category.upsert({
        where: { slug },
        create: { slug, name: slug },
        update: {},
      });
    }
  });

  beforeEach(async () => {
    const usuario = await prisma.user.create({
      data: {
        email: `nota.teste.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@exemplo.test`,
        name: 'Nota Teste',
        rankingName: 'Nota T.',
        emailVerifiedAt: new Date(),
        inviteCode: `T${Date.now().toString(36).toUpperCase().slice(-7)}`,
        preferences: { create: {} },
      },
      select: { id: true },
    });
    userId = usuario.id;
  });

  afterEach(async () => {
    await apagarUsuarioDeTeste(prisma, userId);
  });

  afterAll(async () => {
    // Nada de apagar por loja aqui.
    //
    // A fixture usa o CNPJ do Supermercado Vila Nova, que é o mesmo do seed —
    // limpar "todas as notas desta loja" levava junto as 15 notas de setembro
    // da Camila e quebrava os testes de gastos. A limpeza certa é por usuário:
    // o `afterEach` apaga os usuários de teste, e o cascade leva notas, itens e
    // observações de preço. A linha da loja pode ficar; ela é a mesma que o
    // seed cria.
    await prisma.$disconnect();
  });

  async function lerAFixture(): Promise<string> {
    const { id } = await notas.registrar(userId, { accessKey: CHAVE, source: 'key' });
    const lida = new AdaptadorDoDf().interpretar(fixture('nota-sintetica.html'), CHAVE);
    await notas.concluir(id, lida);
    return id;
  }

  it('grava a nota com os itens e o total da página', async () => {
    const id = await lerAFixture();

    const nota = await prisma.receipt.findUniqueOrThrow({
      where: { id },
      include: { items: true, store: true },
    });

    expect(nota.status).toBe('DONE');
    expect(nota.totalCents).toBe(21089);
    expect(nota.items).toHaveLength(6);

    // A identidade da loja é o CNPJ, não o nome. Loja que já existe mantém o
    // nome que tem: a nota traz a razão social em maiúsculas
    // ("SUPERMERCADO VILA NOVA LTDA") e sobrescrever o nome curado
    // ("Supermercado Vila Nova") pioraria a tela a cada leitura.
    expect(nota.store?.cnpj).toBe('08376451000129');
    expect(nota.store?.uf).toBe('DF');
  });

  it('credita a nota, o mercado novo e a semana', async () => {
    await lerAFixture();

    // 60 pela nota + 20 pelo mercado novo + 40 pela semana com nota.
    expect(await pontos.total(userId)).toBe(
      PONTOS.NOTA_LIDA + PONTOS.MERCADO_NOVO + PONTOS.SEMANA_COM_NOTA,
    );
  });

  it('não repete o bônus de mercado novo na segunda compra na mesma loja', async () => {
    await lerAFixture();

    // Segunda nota, mesma loja, chave diferente.
    const outraChave = chaveDoDf('000000124');
    const { id } = await notas.registrar(userId, { accessKey: outraChave, source: 'key' });
    const lida = new AdaptadorDoDf().interpretar(fixture('nota-sintetica.html'), outraChave);
    await notas.concluir(id, lida);

    // A segunda nota é da mesma loja e da mesma semana: vale só os 60 dela.
    expect(await pontos.total(userId)).toBe(
      PONTOS.NOTA_LIDA * 2 + PONTOS.MERCADO_NOVO + PONTOS.SEMANA_COM_NOTA,
    );
  });

  it('recusa a mesma chave na segunda vez', async () => {
    await lerAFixture();

    await expect(notas.registrar(userId, { accessKey: CHAVE, source: 'key' })).rejects.toMatchObject(
      { response: { code: 'RECEIPT_ALREADY_READ' } },
    );
  });

  it('recusa a chave já lida mesmo por outra pessoa', async () => {
    await lerAFixture();

    const outra = await prisma.user.create({
      data: {
        email: `outra.${Date.now()}@exemplo.test`,
        name: 'Outra Pessoa',
        rankingName: 'Outra P.',
        emailVerifiedAt: new Date(),
        inviteCode: `O${Date.now().toString(36).toUpperCase().slice(-7)}`,
      },
      select: { id: true },
    });

    // Cada nota vale uma vez no sistema inteiro: senão a mesma observação de
    // preço entraria duas vezes na base da região.
    await expect(
      notas.registrar(outra.id, { accessKey: CHAVE, source: 'key' }),
    ).rejects.toMatchObject({ response: { code: 'RECEIPT_ALREADY_READ' } });

    await prisma.user.delete({ where: { id: outra.id } });
  });

  it('grava a observação de preço sem ligação com a pessoa', async () => {
    const id = await lerAFixture();

    const observacoes = await prisma.priceObservation.findMany({
      where: { receiptItem: { receiptId: id } },
      select: { userHash: true, unitPriceCents: true, geohash: true },
    });

    expect(observacoes).toHaveLength(6);

    for (const observacao of observacoes) {
      // O hash não pode ser o id do usuário, nem contê-lo.
      expect(observacao.userHash).not.toBe(userId);
      expect(observacao.userHash).not.toContain(userId);
      expect(observacao.geohash).toHaveLength(5);
    }

    // Todas da mesma pessoa e mesma nota compartilham o hash: é assim que a
    // agregação conta pessoas distintas sem saber quem são.
    expect(new Set(observacoes.map((o) => o.userHash)).size).toBe(1);
  });

  it('não guarda a URL do QR depois de processar', async () => {
    const { id } = await notas.registrar(userId, {
      qrUrl: `https://dfe.fazenda.df.gov.br/nfce/consulta?p=${CHAVE}`,
      source: 'qr',
    });
    const lida = new AdaptadorDoDf().interpretar(fixture('nota-sintetica.html'), CHAVE);
    await notas.concluir(id, lida);

    const nota = await prisma.receipt.findUniqueOrThrow({ where: { id } });
    expect(nota.qrUrl).toBeNull();
  });

  it('casa o mesmo produto entre notas diferentes pelo GTIN', async () => {
    await lerAFixture();

    const arroz = await prisma.product.findFirst({
      where: { gtin: '7896006711056' },
      select: { id: true, displayName: true },
    });

    expect(arroz).not.toBeNull();
    expect(arroz!.displayName).toBe('Arroz tipo 1 5kg');

    // Um produto só, não um por leitura.
    const quantos = await prisma.product.count({ where: { gtin: '7896006711056' } });
    expect(quantos).toBe(1);
  });

  /**
   * O CPF na página é a única verificação de identidade disponível aqui dentro:
   * a SEFAZ mostra o CPF do consumidor, e ou ele é o mesmo da conta, ou não é.
   * O número não é guardado em nenhum dos dois casos — o que viaja é o HMAC.
   *
   * A fixture do DF traz `123.456.789-00` (inventado, dígito inválido de
   * propósito: ninguém vai conferir isso num portal de verdade).
   */
  describe('CPF da nota contra o CPF da conta', () => {
    const hashDeCpf = (digitos: string): string =>
      createHmac('sha256', configuracao.segredoDoHashDeCpf).update(digitos).digest('hex');

    it('o CPF da página confirma o da conta, sem guardar o número', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { cpfHash: hashDeCpf('12345678900') },
      });

      await lerAFixture();

      const pessoa = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cpfVerifiedAt: true },
      });
      expect(pessoa.cpfVerifiedAt).not.toBeNull();
    });

    it('CPF diferente não confirma nada', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { cpfHash: hashDeCpf('52998224725') },
      });

      await lerAFixture();

      const pessoa = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cpfVerifiedAt: true },
      });
      expect(pessoa.cpfVerifiedAt).toBeNull();
    });

    it('sem CPF na conta, a nota é lida igual', async () => {
      const id = await lerAFixture();

      const nota = await prisma.receipt.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      expect(nota.status).toBe('DONE');
    });
  });

  it('marca a falha com o motivo que a tela sabe traduzir', async () => {
    const { id } = await notas.registrar(userId, { accessKey: CHAVE, source: 'key' });
    await notas.marcarFalha(id, new ErroDeLeitura('PORTAL_UNAVAILABLE'));

    const nota = await prisma.receipt.findUniqueOrThrow({ where: { id } });
    expect(nota.status).toBe('PORTAL_UNAVAILABLE');
    expect(nota.failureReason).toBe('PORTAL_UNAVAILABLE');
  });

  it('nota de mais de 6 meses entra no histórico, mas sem pontos', async () => {
    // AAMM = 2501, mais de 6 meses antes de setembro de 2026.
    const chaveAntiga = chaveDoDf('000000999', '2501');

    const { id } = await notas.registrar(userId, { accessKey: chaveAntiga, source: 'key' });
    const nota = await prisma.receipt.findUniqueOrThrow({ where: { id } });

    expect(nota.pointsEligible).toBe(false);

    const lida = new AdaptadorDoDf().interpretar(fixture('nota-sintetica.html'), chaveAntiga);
    await notas.concluir(id, lida);

    // A compra entra no histórico de gastos...
    const gravada = await prisma.receipt.findUniqueOrThrow({ where: { id } });
    expect(gravada.status).toBe('DONE');
    expect(gravada.totalCents).toBe(21089);
    // ...mas não vale ponto nenhum, nem o da semana.
    expect(await pontos.total(userId)).toBe(0);
  });
});

describe('média aparada', () => {
  // Importado aqui para o teste do cálculo ficar perto de quem o usa.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mediaAparada } = require('../src/modules/notas/notas.service.js') as {
    mediaAparada: (v: number[]) => number;
  };

  it('descarta as pontas antes de calcular', () => {
    // Um preço absurdo no meio de dez normais não pode puxar a média.
    const precos = [2000, 2100, 2100, 2200, 2200, 2200, 2300, 2300, 2400, 99999];
    const media = mediaAparada(precos);

    expect(media).toBeGreaterThan(2000);
    expect(media).toBeLessThan(2600);
  });

  it('com poucos valores, usa todos em vez de devolver nada', () => {
    expect(mediaAparada([2000, 2200])).toBe(2100);
  });

  it('lista vazia não quebra', () => {
    expect(mediaAparada([])).toBe(0);
  });
});
