/**
 * Seed de desenvolvimento (docs/03-MODELO-DE-DADOS.md).
 *
 * Os números não são decorativos: as telas de referência mostram R$ 1.284,60
 * em setembro, 42% em Mercearia e o café caindo de R$ 24,90 em junho para
 * R$ 21,40 em setembro. Se o seed não reproduzir isso, não dá para comparar a
 * tela construída com a tela aprovada — que é o critério de aceite de todas as
 * fases.
 *
 * Por isso o seed confere os próprios totais no fim (`conferir`). Mexeu num
 * preço e o total saiu do lugar? Ele falha aqui, alto e claro, em vez de deixar
 * a tela errada e você procurando o motivo três fases depois.
 *
 * Dados fictícios, só para desenvolvimento. Nunca rode em produção.
 */
import { PrismaClient, type PrismaPromise } from '@prisma/client';
import argon2 from 'argon2';
import { createHmac } from 'node:crypto';
import {
  PONTOS,
  SELOS,
  calcularDigitoVerificador,
  codificarGeohash,
  pontosParaChegarAoNivel,
} from '@gastemenos/shared';

const prisma = new PrismaClient();

// ------------------------------------------------------------------ apoio

/** Datas do seed em UTC, como tudo que vai para o banco. */
function data(ano: number, mes: number, dia: number, hora = 18): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, hora, 0, 0));
}

let sequencialDaNota = 0;

/**
 * Monta uma chave de acesso válida de verdade — 44 dígitos, modelo 65,
 * dígito verificador fechado. Assim o seed exercita a mesma validação que a
 * API usa na leitura, em vez de plantar chaves que só existem no banco.
 */
function chaveDeAcesso(cnpj: string, emitidaEm: Date): string {
  sequencialDaNota += 1;
  const aa = String(emitidaEm.getUTCFullYear()).slice(2);
  const mm = String(emitidaEm.getUTCMonth() + 1).padStart(2, '0');
  const numero = String(sequencialDaNota).padStart(9, '0');
  const codigo = String(10_000_000 + sequencialDaNota * 7919).slice(0, 8);
  const base = `53${aa}${mm}${cnpj}65001${numero}1${codigo}`;
  return base + calcularDigitoVerificador(base);
}

/** O mesmo HMAC que a API usa: conta pessoas sem ligar o preço à conta. */
function hashDoUsuario(userId: string): string {
  const segredo = process.env.USER_HASH_SECRET ?? 'seed-local';
  return createHmac('sha256', segredo).update(userId).digest('hex').slice(0, 32);
}

const problemas: string[] = [];
function conferir(condicao: boolean, oQueDeveria: string): void {
  if (!condicao) problemas.push(oQueDeveria);
}

// ------------------------------------------------------- catálogo de apoio

const CATEGORIAS = [
  { slug: 'mercearia', name: 'Mercearia' },
  { slug: 'bebidas', name: 'Bebidas' },
  { slug: 'hortifruti', name: 'Hortifrúti' },
  { slug: 'laticinios', name: 'Laticínios' },
  { slug: 'carnes', name: 'Carnes' },
  { slug: 'limpeza', name: 'Limpeza' },
  { slug: 'higiene', name: 'Higiene' },
  { slug: 'padaria', name: 'Padaria' },
  { slug: 'outros', name: 'Outros' },
] as const;

/** Brasília, Asa Norte — é a região dos exemplos das telas. */
const LOJAS = [
  {
    cnpj: '08376451000129',
    name: 'Supermercado Vila Nova',
    address: 'CLN 208, Bloco A, Asa Norte',
    lat: -15.7601,
    lng: -47.877,
  },
  {
    cnpj: '19274836000158',
    name: 'Atacarejo Planalto',
    address: 'SIA Trecho 3, Guará',
    lat: -15.7955,
    lng: -47.9234,
  },
  {
    cnpj: '27593014000162',
    name: 'Mercado Bom Dia',
    address: 'CLN 112, Bloco C, Asa Norte',
    lat: -15.7724,
    lng: -47.8836,
  },
  {
    cnpj: '35841927000144',
    name: 'Padaria Pão Dourado',
    address: 'CLN 204, Bloco B, Asa Norte',
    lat: -15.7648,
    lng: -47.8801,
  },
] as const;

type SlugDeCategoria = (typeof CATEGORIAS)[number]['slug'];

/** Uma linha de item da nota. `centavos` é o preço unitário. */
interface LinhaDeItem {
  produto: string;
  categoria: SlugDeCategoria;
  unidade: string;
  centavos: number;
  quantidade: number;
  /** Índice da nota de setembro que recebe esta linha (0 a 14). */
  nota: number;
}

/**
 * Compras de setembro de 2026, item a item.
 *
 * Os totais por categoria são os da tela Gastos: Mercearia R$ 539,53,
 * Bebidas R$ 231,23, Hortifrúti R$ 192,69, Limpeza R$ 179,84,
 * Higiene R$ 141,31 — somando R$ 1.284,60.
 */
const ITENS_DE_SETEMBRO: LinhaDeItem[] = [
  // --- Mercearia (R$ 539,53)
  { produto: 'Café torrado e moído 500g', categoria: 'mercearia', unidade: 'un.', centavos: 2140, quantidade: 2, nota: 0 },
  { produto: 'Arroz tipo 1 5kg', categoria: 'mercearia', unidade: 'un.', centavos: 2890, quantidade: 2, nota: 0 },
  { produto: 'Feijão carioca 1kg', categoria: 'mercearia', unidade: 'un.', centavos: 849, quantidade: 3, nota: 0 },
  { produto: 'Açúcar refinado 1kg', categoria: 'mercearia', unidade: 'un.', centavos: 459, quantidade: 2, nota: 1 },
  { produto: 'Óleo de soja 900ml', categoria: 'mercearia', unidade: 'un.', centavos: 729, quantidade: 3, nota: 1 },
  { produto: 'Macarrão espaguete 500g', categoria: 'mercearia', unidade: 'un.', centavos: 429, quantidade: 4, nota: 1 },
  { produto: 'Farinha de trigo 1kg', categoria: 'mercearia', unidade: 'un.', centavos: 519, quantidade: 2, nota: 2 },
  { produto: 'Molho de tomate 340g', categoria: 'mercearia', unidade: 'un.', centavos: 349, quantidade: 5, nota: 2 },
  { produto: 'Biscoito recheado 130g', categoria: 'mercearia', unidade: 'un.', centavos: 289, quantidade: 6, nota: 3 },
  { produto: 'Leite integral 1L', categoria: 'mercearia', unidade: 'un.', centavos: 549, quantidade: 12, nota: 3 },
  { produto: 'Ovos brancos dúzia', categoria: 'mercearia', unidade: 'dz', centavos: 1290, quantidade: 2, nota: 4 },
  { produto: 'Sal refinado 1kg', categoria: 'mercearia', unidade: 'un.', centavos: 299, quantidade: 1, nota: 4 },
  { produto: 'Café solúvel 200g', categoria: 'mercearia', unidade: 'un.', centavos: 1890, quantidade: 1, nota: 5 },
  { produto: 'Achocolatado em pó 400g', categoria: 'mercearia', unidade: 'un.', centavos: 899, quantidade: 2, nota: 5 },
  { produto: 'Margarina 500g', categoria: 'mercearia', unidade: 'un.', centavos: 799, quantidade: 2, nota: 6 },
  { produto: 'Queijo mussarela fatiado 150g', categoria: 'mercearia', unidade: 'un.', centavos: 1190, quantidade: 2, nota: 6 },
  { produto: 'Presunto fatiado 200g', categoria: 'mercearia', unidade: 'un.', centavos: 1390, quantidade: 1, nota: 6 },
  { produto: 'Iogurte natural 170g', categoria: 'mercearia', unidade: 'un.', centavos: 279, quantidade: 6, nota: 7 },
  { produto: 'Requeijão cremoso 200g', categoria: 'mercearia', unidade: 'un.', centavos: 949, quantidade: 1, nota: 7 },
  { produto: 'Atum em lata 170g', categoria: 'mercearia', unidade: 'un.', centavos: 1090, quantidade: 2, nota: 8 },
  { produto: 'Milho verde lata 200g', categoria: 'mercearia', unidade: 'un.', centavos: 399, quantidade: 3, nota: 8 },
  { produto: 'Ervilha lata 200g', categoria: 'mercearia', unidade: 'un.', centavos: 399, quantidade: 2, nota: 9 },
  { produto: 'Maionese 500g', categoria: 'mercearia', unidade: 'un.', centavos: 1190, quantidade: 1, nota: 9 },
  { produto: 'Vinagre 750ml', categoria: 'mercearia', unidade: 'un.', centavos: 399, quantidade: 1, nota: 10 },
  { produto: 'Azeite extra virgem 500ml', categoria: 'mercearia', unidade: 'un.', centavos: 2990, quantidade: 1, nota: 10 },
  { produto: 'Leite condensado 395g', categoria: 'mercearia', unidade: 'un.', centavos: 1054, quantidade: 2, nota: 11 },

  // --- Bebidas (R$ 231,23)
  { produto: 'Refrigerante cola 2L', categoria: 'bebidas', unidade: 'un.', centavos: 899, quantidade: 4, nota: 0 },
  { produto: 'Suco de laranja 1L', categoria: 'bebidas', unidade: 'un.', centavos: 799, quantidade: 3, nota: 1 },
  { produto: 'Água mineral 1,5L', categoria: 'bebidas', unidade: 'un.', centavos: 299, quantidade: 6, nota: 2 },
  { produto: 'Cerveja lata 350ml', categoria: 'bebidas', unidade: 'un.', centavos: 449, quantidade: 12, nota: 3 },
  { produto: 'Suco de uva integral 1L', categoria: 'bebidas', unidade: 'un.', centavos: 1690, quantidade: 2, nota: 5 },
  { produto: 'Refrigerante guaraná 2L', categoria: 'bebidas', unidade: 'un.', centavos: 799, quantidade: 3, nota: 7 },
  { produto: 'Água de coco 1L', categoria: 'bebidas', unidade: 'un.', centavos: 990, quantidade: 2, nota: 9 },
  { produto: 'Chá gelado 1,5L', categoria: 'bebidas', unidade: 'un.', centavos: 699, quantidade: 2, nota: 11 },
  { produto: 'Energético 250ml', categoria: 'bebidas', unidade: 'un.', centavos: 793, quantidade: 1, nota: 12 },

  // --- Hortifrúti (R$ 192,69)
  { produto: 'Banana prata', categoria: 'hortifruti', unidade: 'kg', centavos: 598, quantidade: 2.5, nota: 0 },
  { produto: 'Tomate', categoria: 'hortifruti', unidade: 'kg', centavos: 749, quantidade: 2, nota: 0 },
  { produto: 'Batata', categoria: 'hortifruti', unidade: 'kg', centavos: 449, quantidade: 3, nota: 1 },
  { produto: 'Cebola', categoria: 'hortifruti', unidade: 'kg', centavos: 529, quantidade: 2, nota: 2 },
  { produto: 'Maçã gala', categoria: 'hortifruti', unidade: 'kg', centavos: 898, quantidade: 1.5, nota: 2 },
  { produto: 'Laranja pera', categoria: 'hortifruti', unidade: 'kg', centavos: 399, quantidade: 4, nota: 3 },
  { produto: 'Cenoura', categoria: 'hortifruti', unidade: 'kg', centavos: 499, quantidade: 1, nota: 4 },
  { produto: 'Alface crespa', categoria: 'hortifruti', unidade: 'un.', centavos: 349, quantidade: 2, nota: 4 },
  { produto: 'Mamão formosa', categoria: 'hortifruti', unidade: 'kg', centavos: 699, quantidade: 2, nota: 5 },
  { produto: 'Limão taiti', categoria: 'hortifruti', unidade: 'kg', centavos: 599, quantidade: 1, nota: 6 },
  { produto: 'Abacaxi', categoria: 'hortifruti', unidade: 'un.', centavos: 899, quantidade: 1, nota: 7 },
  { produto: 'Melancia', categoria: 'hortifruti', unidade: 'kg', centavos: 299, quantidade: 5, nota: 8 },
  { produto: 'Brócolis', categoria: 'hortifruti', unidade: 'un.', centavos: 649, quantidade: 1, nota: 9 },
  { produto: 'Couve', categoria: 'hortifruti', unidade: 'un.', centavos: 399, quantidade: 1, nota: 10 },
  { produto: 'Pimentão verde', categoria: 'hortifruti', unidade: 'kg', centavos: 799, quantidade: 1, nota: 11 },
  { produto: 'Abobrinha', categoria: 'hortifruti', unidade: 'kg', centavos: 549, quantidade: 1, nota: 12 },
  { produto: 'Manga', categoria: 'hortifruti', unidade: 'kg', centavos: 649, quantidade: 2, nota: 13 },
  { produto: 'Uva itália', categoria: 'hortifruti', unidade: 'kg', centavos: 1290, quantidade: 1, nota: 13 },
  { produto: 'Salsinha e cebolinha', categoria: 'hortifruti', unidade: 'maço', centavos: 356, quantidade: 1, nota: 14 },

  // --- Limpeza (R$ 179,84)
  { produto: 'Detergente líquido 500ml', categoria: 'limpeza', unidade: 'un.', centavos: 289, quantidade: 6, nota: 0 },
  { produto: 'Sabão em pó 1,6kg', categoria: 'limpeza', unidade: 'un.', centavos: 1890, quantidade: 2, nota: 1 },
  { produto: 'Amaciante 2L', categoria: 'limpeza', unidade: 'un.', centavos: 1490, quantidade: 2, nota: 3 },
  { produto: 'Desinfetante 2L', categoria: 'limpeza', unidade: 'un.', centavos: 899, quantidade: 2, nota: 5 },
  { produto: 'Água sanitária 2L', categoria: 'limpeza', unidade: 'un.', centavos: 699, quantidade: 2, nota: 7 },
  { produto: 'Esponja multiuso pacote 4', categoria: 'limpeza', unidade: 'un.', centavos: 599, quantidade: 2, nota: 8 },
  { produto: 'Saco de lixo 50L pacote', categoria: 'limpeza', unidade: 'un.', centavos: 799, quantidade: 2, nota: 10 },
  { produto: 'Limpador multiuso 500ml', categoria: 'limpeza', unidade: 'un.', centavos: 649, quantidade: 2, nota: 12 },
  { produto: 'Sabão em barra 5un', categoria: 'limpeza', unidade: 'un.', centavos: 999, quantidade: 1, nota: 13 },
  { produto: 'Lustra-móveis 200ml', categoria: 'limpeza', unidade: 'un.', centavos: 1201, quantidade: 1, nota: 14 },

  // --- Higiene (R$ 141,31)
  { produto: 'Papel higiênico 12 rolos', categoria: 'higiene', unidade: 'un.', centavos: 2490, quantidade: 1, nota: 1 },
  { produto: 'Sabonete 90g', categoria: 'higiene', unidade: 'un.', centavos: 249, quantidade: 6, nota: 2 },
  { produto: 'Creme dental 90g', categoria: 'higiene', unidade: 'un.', centavos: 599, quantidade: 3, nota: 4 },
  { produto: 'Shampoo 350ml', categoria: 'higiene', unidade: 'un.', centavos: 1690, quantidade: 1, nota: 6 },
  { produto: 'Condicionador 350ml', categoria: 'higiene', unidade: 'un.', centavos: 1690, quantidade: 1, nota: 6 },
  { produto: 'Desodorante aerosol 150ml', categoria: 'higiene', unidade: 'un.', centavos: 1390, quantidade: 1, nota: 8 },
  { produto: 'Escova de dente', categoria: 'higiene', unidade: 'un.', centavos: 799, quantidade: 2, nota: 11 },
  { produto: 'Fio dental 50m', categoria: 'higiene', unidade: 'un.', centavos: 899, quantidade: 1, nota: 13 },
  { produto: 'Absorvente pacote 8un', categoria: 'higiene', unidade: 'un.', centavos: 1083, quantidade: 1, nota: 14 },
];

/** Totais que as telas mostram. O seed falha se não bater. */
const TOTAIS_ESPERADOS = {
  setembro: 128460,
  porCategoria: {
    mercearia: 53953,
    bebidas: 23123,
    hortifruti: 19269,
    limpeza: 17984,
    higiene: 14131,
  } as Record<string, number>,
  trimestre: 421290, // julho a setembro
  ano: 1294030,
  /** Estimativa da lista da semana, na tela Lista. */
  listaDaSemana: 14672,
};

/** Dias de setembro de 2026 em que cada uma das 15 notas foi emitida. */
const DIAS_DAS_NOTAS = [2, 4, 6, 8, 9, 11, 13, 15, 16, 18, 20, 21, 22, 23, 24];

/** Média da região do café (docs/03). Alimenta o gráfico da tela Preços. */
const HISTORICO_DO_CAFE: Array<{ mes: string; centavos: number }> = [
  { mes: '2026-04', centavos: 2290 },
  { mes: '2026-05', centavos: 2380 },
  { mes: '2026-06', centavos: 2490 },
  { mes: '2026-07', centavos: 2340 },
  { mes: '2026-08', centavos: 2210 },
  { mes: '2026-09', centavos: 2140 },
];

const AMIGOS = [
  { nome: 'Rafa Lima', email: 'rafa.lima@email.com', economiaCentavos: 21240, compras: 13, pontosNoMes: 2340 },
  { nome: 'Bia Souza', email: 'bia.souza@email.com', economiaCentavos: 18710, compras: 19, pontosNoMes: 1870 },
  { nome: 'João Pedro', email: 'joao.pedro@email.com', economiaCentavos: 16480, compras: 11, pontosNoMes: 1980 },
  { nome: 'Lu Andrade', email: 'lu.andrade@email.com', economiaCentavos: 15130, compras: 9, pontosNoMes: 1420 },
  { nome: 'Theo Martins', email: 'theo.martins@email.com', economiaCentavos: 9760, compras: 12, pontosNoMes: 880 },
];

/** Economia da Camila em setembro, da tela Ranking: R$ 138,20. */
const ECONOMIA_DE_SETEMBRO = 13820;

// ------------------------------------------------------------------ seed

async function limpar(): Promise<void> {
  // Ordem importa: filhos antes dos pais, porque nem toda relação tem cascade.
  const tabelas: PrismaPromise<unknown>[] = [
    prisma.priceObservation.deleteMany(),
    prisma.receiptItem.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.priceStat.deleteMany(),
    prisma.shoppingListItem.deleteMany(),
    prisma.shoppingList.deleteMany(),
    prisma.pointsLedger.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.friendship.deleteMany(),
    prisma.rankingSnapshot.deleteMany(),
    prisma.priceAlert.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.dataExport.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.partner.deleteMany(),
    prisma.productAlias.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.store.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.preferences.deleteMany(),
    prisma.consumptionProfile.deleteMany(),
    prisma.session.deleteMany(),
    prisma.authAccount.deleteMany(),
    prisma.user.deleteMany(),
  ];
  for (const tabela of tabelas) await tabela;
}

/**
 * Decide se o seed pode apagar antes de inserir.
 *
 * `NODE_ENV` não protege nada aqui: quem roda um comando na própria máquina
 * está em "development" mesmo com a `DATABASE_URL` apontando para um banco
 * gerenciado. A pergunta certa não é em que ambiente estou, é **em qual banco
 * vou mexer**.
 *
 * Em banco local, limpar é o comportamento útil: reexecutar o seed é rotina.
 * Fora de localhost o seed **não apaga nada** — exige a base vazia e só
 * insere. Não é uma confirmação a mais para digitar: é tirar do seed, por
 * construção, a capacidade de destruir dado remoto. Confirmação a gente digita
 * no automático; o que não existe não acontece.
 */
async function podeLimpar(): Promise<boolean> {
  const url = process.env.DATABASE_URL ?? '';
  if (/@(localhost|127\.0\.0\.1|::1|db|postgres)[:/]/.test(url)) return true;

  const servidor = url.replace(/^.*@/, '').replace(/\/.*$/, '') || '(desconhecido)';
  const [usuarios, notas, lojas] = await Promise.all([
    prisma.user.count(),
    prisma.receipt.count(),
    prisma.store.count(),
  ]);

  if (usuarios + notas + lojas > 0) {
    throw new Error(
      `${servidor} não é um banco local e já tem dado ` +
        `(${usuarios} usuários, ${notas} notas, ${lojas} lojas).\n` +
        'O seed não apaga base remota. Limpe você mesmo, se for essa a intenção.',
    );
  }

  return false;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed é de desenvolvimento. Não rode em produção.');
  }

  if (await podeLimpar()) await limpar();

  // --- categorias e selos
  await prisma.category.createMany({ data: CATEGORIAS.map((c) => ({ ...c })) });
  const categorias = new Map(
    (await prisma.category.findMany()).map((c) => [c.slug, c.id] as const),
  );

  await prisma.badge.createMany({
    data: SELOS.map((s) => ({
      id: s.slug.replace(/-/g, '_'),
      name: s.nome,
      description: s.comoGanhar,
      target: s.meta,
    })),
  });

  // --- lojas
  const geohashDaRegiao = codificarGeohash(LOJAS[0]!.lat, LOJAS[0]!.lng);
  await prisma.store.createMany({
    data: LOJAS.map((l) => ({
      cnpj: l.cnpj,
      name: l.name,
      address: l.address,
      city: 'Brasília',
      uf: 'DF',
      lat: l.lat,
      lng: l.lng,
      geohash: codificarGeohash(l.lat, l.lng),
    })),
  });
  const lojas = await prisma.store.findMany();
  const lojaPorCnpj = new Map(lojas.map((l) => [l.cnpj, l] as const));

  // --- produtos (um por descrição distinta das notas)
  const descricoes = new Map<string, SlugDeCategoria>();
  for (const item of ITENS_DE_SETEMBRO) descricoes.set(item.produto, item.categoria);

  await prisma.product.createMany({
    data: [...descricoes].map(([nome, categoria]) => ({
      displayName: nome,
      normalizedName: nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''),
      categoryId: categorias.get(categoria) ?? null,
    })),
  });
  const produtos = await prisma.product.findMany();
  const produtoPorNome = new Map(produtos.map((p) => [p.displayName, p] as const));

  // --- Camila
  const senhaHash = await argon2.hash('Economia2026', { type: argon2.argon2id });

  // Conta de operação, para o painel administrativo. Sem região, de propósito:
  // admin não entra no ranking nem na base de preços — ele opera o sistema, não
  // participa dele.
  await prisma.user.create({
    data: {
      email: 'admin@gastemenos.com.br',
      emailVerifiedAt: data(2026, 1, 8),
      passwordHash: senhaHash,
      name: 'Operação GasteMenos',
      rankingName: 'Operação',
      role: 'ADMIN',
      inviteCode: 'ADMIN001',
      createdAt: data(2026, 1, 8),
      accounts: {
        create: { provider: 'PASSWORD', providerAccountId: 'admin@gastemenos.com.br' },
      },
      preferences: { create: {} },
    },
  });

  const pontosTotais = pontosParaChegarAoNivel(12) + 460; // nível 12, 460 no nível

  const camila = await prisma.user.create({
    data: {
      email: 'camila.alves@email.com',
      emailVerifiedAt: data(2026, 1, 8),
      passwordHash: senhaHash,
      name: 'Camila Alves',
      rankingName: 'Camila A.',
      cep: '70750-505',
      regionGeohash: geohashDaRegiao,
      inviteCode: 'CAMILA26',
      createdAt: data(2026, 1, 8),
      accounts: {
        create: { provider: 'PASSWORD', providerAccountId: 'camila.alves@email.com' },
      },
      preferences: { create: { theme: 'SYSTEM', textSize: 'NORMAL' } },
      profile: {
        create: {
          householdSize: '3',
          storeTypes: ['super', 'atac'],
          frequency: 'sem',
          monthlySpendBand: 'c',
          priorities: ['preco', 'promo', 'perto'],
          persona: 'Família Planejadora',
          budgetCents: 160_000, // R$ 1.600
        },
      },
      consents: {
        create: [
          { kind: 'terms_v1', granted: true, createdAt: data(2026, 1, 8) },
          { kind: 'privacy_v1', granted: true, createdAt: data(2026, 1, 8) },
          { kind: 'partners', granted: false, createdAt: data(2026, 1, 8) },
        ],
      },
    },
  });

  // --- amigos
  const amigos = [];
  for (const amigo of AMIGOS) {
    const criado = await prisma.user.create({
      data: {
        email: amigo.email,
        emailVerifiedAt: data(2026, 2, 1),
        passwordHash: senhaHash,
        name: amigo.nome,
        rankingName: amigo.nome,
        cep: '70750-505',
        regionGeohash: geohashDaRegiao,
        inviteCode: amigo.nome.replace(/\W/g, '').slice(0, 6).toUpperCase() + '26',
        invitedById: camila.id,
        createdAt: data(2026, 2, 1),
        preferences: { create: {} },
      },
    });
    amigos.push({ ...amigo, id: criado.id });

    // Par ordenado A<B, como manda o modelo.
    const [a, b] = [camila.id, criado.id].sort();
    await prisma.friendship.create({ data: { userAId: a!, userBId: b! } });

    // Notas e pontos de setembro do amigo.
    //
    // O ranking é **calculado** a partir destes dados, não plantado numa
    // tabela de posições: é a única forma de o teste provar que a agregação
    // funciona, e não que alguém digitou o pódio certo.
    const economiaPorNota = Math.floor(amigo.economiaCentavos / amigo.compras);
    const sobra = amigo.economiaCentavos - economiaPorNota * amigo.compras;

    for (let i = 0; i < amigo.compras; i++) {
      const loja = LOJAS[i % LOJAS.length]!;
      const emitidaEm = data(2026, 9, ((i * 2) % 28) + 1);

      await prisma.receipt.create({
        data: {
          accessKey: chaveDeAcesso(loja.cnpj, emitidaEm),
          userId: criado.id,
          storeId: lojaPorCnpj.get(loja.cnpj)!.id,
          status: 'DONE',
          source: 'qr',
          issuedAt: emitidaEm,
          totalCents: 8_000 + i * 350,
          // A sobra da divisão vai na primeira nota, para a soma fechar exata.
          savingsCents: economiaPorNota + (i === 0 ? sobra : 0),
          pointsAwarded: PONTOS.NOTA_LIDA,
          processedAt: emitidaEm,
        },
      });
    }

    // Pontos do mês, num lançamento só: o que o ranking soma é o total do
    // período, e detalhar 13 créditos não mudaria o resultado.
    await prisma.pointsLedger.create({
      data: {
        userId: criado.id,
        amount: amigo.pontosNoMes,
        reason: 'RECEIPT',
        refId: `setembro-${criado.id}`,
        createdAt: data(2026, 9, 15),
      },
    });
  }

  // --- notas de setembro, com os itens exatos das telas
  const notasDeSetembro = [];
  for (let i = 0; i < DIAS_DAS_NOTAS.length; i++) {
    const loja = LOJAS[i % LOJAS.length]!;
    const emitidaEm = data(2026, 9, DIAS_DAS_NOTAS[i]!);
    const itens = ITENS_DE_SETEMBRO.filter((item) => item.nota === i);
    const total = itens.reduce((s, item) => s + Math.round(item.centavos * item.quantidade), 0);

    const nota = await prisma.receipt.create({
      data: {
        accessKey: chaveDeAcesso(loja.cnpj, emitidaEm),
        userId: camila.id,
        storeId: lojaPorCnpj.get(loja.cnpj)!.id,
        status: 'DONE',
        source: 'qr',
        issuedAt: emitidaEm,
        totalCents: total,
        paymentMethod: i % 3 === 0 ? 'PIX' : i % 3 === 1 ? 'CREDITO' : 'DEBITO',
        // A economia total do mês é R$ 138,20, distribuída entre as notas.
        // A sobra da divisão vai na primeira: dividir 13820 por 15 e arredondar
        // perderia 5 centavos, e o ranking mostraria R$ 138,15.
        savingsCents:
          Math.floor(ECONOMIA_DE_SETEMBRO / DIAS_DAS_NOTAS.length) +
          (i === 0
            ? ECONOMIA_DE_SETEMBRO -
              Math.floor(ECONOMIA_DE_SETEMBRO / DIAS_DAS_NOTAS.length) * DIAS_DAS_NOTAS.length
            : 0),
        pointsEligible: true,
        pointsAwarded: PONTOS.NOTA_LIDA,
        processedAt: emitidaEm,
        items: {
          create: itens.map((item) => ({
            productId: produtoPorNome.get(item.produto)!.id,
            rawDescription: item.produto.toUpperCase(),
            quantity: item.quantidade,
            unit: item.unidade,
            unitPriceCents: item.centavos,
            totalCents: Math.round(item.centavos * item.quantidade),
          })),
        },
      },
      include: { items: true },
    });
    notasDeSetembro.push(nota);

    // Observação de preço por item: é o que alimenta a média da região.
    await prisma.priceObservation.createMany({
      data: nota.items
        .filter((item) => item.productId)
        .map((item) => ({
          productId: item.productId!,
          storeId: nota.storeId!,
          receiptItemId: item.id,
          userHash: hashDoUsuario(camila.id),
          unitPriceCents: item.unitPriceCents,
          observedAt: emitidaEm,
          geohash: codificarGeohash(loja.lat, loja.lng),
        })),
    });
  }

  // --- meses anteriores, só para os totais de 3 meses e do ano baterem
  const cafe = produtoPorNome.get('Café torrado e moído 500g')!;
  const arroz = produtoPorNome.get('Arroz tipo 1 5kg')!;

  const mesesAnteriores: Array<{ ano: number; mes: number; totalCentavos: number }> = [
    { ano: 2026, mes: 1, totalCentavos: 145_320 },
    { ano: 2026, mes: 2, totalCentavos: 138_910 },
    { ano: 2026, mes: 3, totalCentavos: 152_640 },
    { ano: 2026, mes: 4, totalCentavos: 141_280 },
    { ano: 2026, mes: 5, totalCentavos: 149_070 },
    { ano: 2026, mes: 6, totalCentavos: 145_520 },
    { ano: 2026, mes: 7, totalCentavos: 149_830 },
    { ano: 2026, mes: 8, totalCentavos: 143_000 },
  ];

  for (const mes of mesesAnteriores) {
    const loja = LOJAS[mes.mes % LOJAS.length]!;
    const emitidaEm = data(mes.ano, mes.mes, 15);
    const precoDoCafe =
      HISTORICO_DO_CAFE.find((h) => h.mes === `2026-${String(mes.mes).padStart(2, '0')}`)
        ?.centavos ?? 2290;
    const restante = mes.totalCentavos - precoDoCafe * 2;

    const nota = await prisma.receipt.create({
      data: {
        accessKey: chaveDeAcesso(loja.cnpj, emitidaEm),
        userId: camila.id,
        storeId: lojaPorCnpj.get(loja.cnpj)!.id,
        status: 'DONE',
        source: 'qr',
        issuedAt: emitidaEm,
        totalCents: mes.totalCentavos,
        paymentMethod: 'PIX',
        savingsCents: 8_000,
        pointsAwarded: PONTOS.NOTA_LIDA,
        processedAt: emitidaEm,
        items: {
          create: [
            {
              productId: cafe.id,
              rawDescription: 'CAFE TORRADO E MOIDO 500G',
              quantity: 2,
              unit: 'un.',
              unitPriceCents: precoDoCafe,
              totalCents: precoDoCafe * 2,
            },
            {
              productId: arroz.id,
              rawDescription: 'COMPRAS DO MES',
              quantity: 1,
              unit: 'un.',
              unitPriceCents: restante,
              totalCents: restante,
            },
          ],
        },
      },
      include: { items: true },
    });

    const itemDoCafe = nota.items.find((i) => i.productId === cafe.id)!;
    await prisma.priceObservation.create({
      data: {
        productId: cafe.id,
        storeId: nota.storeId!,
        receiptItemId: itemDoCafe.id,
        userHash: hashDoUsuario(camila.id),
        unitPriceCents: precoDoCafe,
        observedAt: emitidaEm,
        geohash: codificarGeohash(loja.lat, loja.lng),
      },
    });
  }

  // --- histórico do café na região (o gráfico da tela Preços)
  await prisma.priceStat.createMany({
    data: HISTORICO_DO_CAFE.map((h) => ({
      productId: cafe.id,
      geohash: geohashDaRegiao,
      period: `month:${h.mes}`,
      avgCents: h.centavos,
      minCents: h.centavos - 150,
      maxCents: h.centavos + 260,
      minStoreId: lojaPorCnpj.get(LOJAS[1]!.cnpj)!.id, // Atacarejo é o mais barato
      receiptCount: 24,
      userCount: 11,
    })),
  });

  // --- livro-razão de pontos
  const lancamentos: Array<{ amount: number; reason: string; refId: string; createdAt: Date }> = [
    { amount: PONTOS.BOAS_VINDAS, reason: 'WELCOME', refId: camila.id, createdAt: data(2026, 1, 8) },
    { amount: PONTOS.PERFIL_COMPLETO, reason: 'PROFILE', refId: camila.id, createdAt: data(2026, 1, 8) },
  ];

  for (const nota of notasDeSetembro) {
    lancamentos.push({
      amount: PONTOS.NOTA_LIDA,
      reason: 'RECEIPT',
      refId: nota.id,
      createdAt: nota.issuedAt!,
    });
  }

  // Sequência de 5 semanas com nota (a tela Início mostra "5 semanas seguidas").
  for (let semana = 0; semana < 4; semana++) {
    lancamentos.push({
      amount: PONTOS.SEMANA_COM_NOTA,
      reason: 'WEEK_STREAK',
      refId: `2026-W${36 + semana}`,
      createdAt: data(2026, 9, 6 + semana * 7, 23),
    });
  }

  for (let i = 0; i < 2; i++) {
    lancamentos.push({
      amount: PONTOS.MERCADO_NOVO,
      reason: 'NEW_STORE',
      refId: LOJAS[i]!.cnpj,
      createdAt: data(2026, 9, 2 + i),
    });
  }

  for (const amigo of amigos) {
    lancamentos.push({
      amount: PONTOS.AMIGO_CONVIDADO,
      reason: 'INVITE',
      refId: amigo.id,
      createdAt: data(2026, 9, 10),
    });
  }

  for (let i = 0; i < 2; i++) {
    lancamentos.push({
      amount: PONTOS.CONFIRMAR_PRECO,
      reason: 'OFFER_CONFIRM',
      refId: `oferta-${i}`,
      createdAt: data(2026, 9, 12 + i),
    });
  }

  const somaAtual = lancamentos.reduce((s, l) => s + l.amount, 0);
  // O resto vem dos meses anteriores — a Camila usa o app desde janeiro.
  lancamentos.push({
    amount: pontosTotais - somaAtual,
    reason: 'RECEIPT',
    refId: 'historico-antes-de-setembro',
    createdAt: data(2026, 8, 31),
  });

  await prisma.pointsLedger.createMany({ data: lancamentos.map((l) => ({ ...l, userId: camila.id })) });

  // --- selos da Camila
  await prisma.userBadge.createMany({
    data: [
      { userId: camila.id, badgeId: 'primeira_nota', progress: 1, unlockedAt: data(2026, 1, 9) },
      { userId: camila.id, badgeId: 'carrinho_esperto', progress: 15, unlockedAt: data(2026, 9, 24) },
      { userId: camila.id, badgeId: 'em_chamas', progress: 5, unlockedAt: data(2026, 9, 21) },
      { userId: camila.id, badgeId: 'explorador', progress: 4 },
      { userId: camila.id, badgeId: 'cem_reais_salvos', progress: 13820, unlockedAt: data(2026, 9, 22) },
      { userId: camila.id, badgeId: 'cacador_de_promocoes', progress: 6 },
      { userId: camila.id, badgeId: 'detetive_de_precos', progress: 2 },
      { userId: camila.id, badgeId: 'embaixador', progress: 5, unlockedAt: data(2026, 9, 10) },
      { userId: camila.id, badgeId: 'lenda_do_mes', progress: 0 },
    ],
  });

  // --- lista de compras
  const lista = await prisma.shoppingList.create({
    data: { userId: camila.id, name: 'Lista da semana' },
  });
  // A tela Lista mostra R$ 146,72 de estimativa. A composição abaixo fecha
  // esse valor com os preços que já estão no seed — `conferir` garante isso
  // no fim, para ninguém mexer numa quantidade e a tela sair do lugar.
  const itensDaLista = [
    { label: 'Café torrado e moído 500g', produto: 'Café torrado e moído 500g', qtd: 2, dias: 21 },
    { label: 'Arroz tipo 1 5kg', produto: 'Arroz tipo 1 5kg', qtd: 1, dias: 45 },
    { label: 'Leite integral 1L', produto: 'Leite integral 1L', qtd: 8, dias: 14 },
    { label: 'Detergente líquido 500ml', produto: 'Detergente líquido 500ml', qtd: 3, dias: 15 },
    { label: 'Banana prata', produto: 'Banana prata', qtd: 2, dias: 7 },
    { label: 'Molho de tomate 340g', produto: 'Molho de tomate 340g', qtd: 3, dias: 20 },
  ];
  await prisma.shoppingListItem.createMany({
    data: itensDaLista.map((item, posicao) => {
      const produto = produtoPorNome.get(item.produto)!;
      const preco =
        ITENS_DE_SETEMBRO.find((l) => l.produto === item.produto)?.centavos ?? 0;
      return {
        listId: lista.id,
        productId: produto.id,
        label: item.label,
        quantity: item.qtd,
        unit: 'un.',
        estimatedCents: preco * item.qtd,
        repurchaseDays: item.dias,
        suggested: posicao >= 3,
        position: posicao,
      };
    }),
  });

  // --- parceiro e oferta patrocinada (o selo é obrigatório na UI)
  const parceiro = await prisma.partner.create({
    data: { name: 'Atacarejo Planalto', cnpj: LOJAS[1]!.cnpj, contact: 'parcerias@atacarejo.exemplo' },
  });
  await prisma.offer.create({
    data: {
      partnerId: parceiro.id,
      sponsored: true,
      title: 'Café 500g por R$ 19,90 no Atacarejo',
      description: 'Preço válido até domingo, limitado a 3 unidades por pessoa.',
      productId: cafe.id,
      storeId: lojaPorCnpj.get(LOJAS[1]!.cnpj)!.id,
      priceCents: 1990,
      geohashes: [geohashDaRegiao],
      startsAt: data(2026, 9, 20),
      endsAt: data(2026, 10, 5),
    },
  });

  // --- notificações
  await prisma.notification.createMany({
    data: [
      {
        userId: camila.id,
        type: 'PRICE_DROP',
        title: 'O café que você compra está R$ 19,90 no Atacarejo Planalto',
        href: `/produtos/${cafe.id}/precos`,
        createdAt: data(2026, 9, 23, 9),
      },
      {
        userId: camila.id,
        type: 'RANKING',
        title: 'Selo novo: Carrinho Esperto. Você leu 15 notas neste mês.',
        href: '/conquistas',
        createdAt: data(2026, 9, 24, 19),
      },
      {
        userId: camila.id,
        type: 'STREAK_RISK',
        title: 'Sequência de 5 semanas: leia uma nota esta semana para não perder',
        href: '/ler-nota',
        readAt: data(2026, 9, 22, 10),
        createdAt: data(2026, 9, 21, 18),
      },
    ],
  });

  // ------------------------------------------------------------ conferência
  const todasAsNotas = await prisma.receipt.findMany({
    where: { userId: camila.id },
    include: { items: true },
  });

  const deSetembro = todasAsNotas.filter(
    (n) => n.issuedAt!.getUTCFullYear() === 2026 && n.issuedAt!.getUTCMonth() === 8,
  );
  const totalDeSetembro = deSetembro.reduce((s, n) => s + (n.totalCents ?? 0), 0);

  const porCategoria: Record<string, number> = {};
  for (const item of ITENS_DE_SETEMBRO) {
    porCategoria[item.categoria] =
      (porCategoria[item.categoria] ?? 0) + Math.round(item.centavos * item.quantidade);
  }

  const trimestre = todasAsNotas
    .filter((n) => [6, 7, 8].includes(n.issuedAt!.getUTCMonth()))
    .reduce((s, n) => s + (n.totalCents ?? 0), 0);
  const ano = todasAsNotas.reduce((s, n) => s + (n.totalCents ?? 0), 0);

  const pontos = await prisma.pointsLedger.aggregate({
    where: { userId: camila.id },
    _sum: { amount: true },
  });

  conferir(deSetembro.length === 15, `setembro deveria ter 15 notas, tem ${deSetembro.length}`);
  conferir(
    totalDeSetembro === TOTAIS_ESPERADOS.setembro,
    `setembro deveria somar ${TOTAIS_ESPERADOS.setembro} centavos, somou ${totalDeSetembro}`,
  );
  for (const [slug, esperado] of Object.entries(TOTAIS_ESPERADOS.porCategoria)) {
    conferir(
      porCategoria[slug] === esperado,
      `${slug} deveria somar ${esperado} centavos, somou ${porCategoria[slug]}`,
    );
  }
  conferir(
    trimestre === TOTAIS_ESPERADOS.trimestre,
    `julho a setembro deveria somar ${TOTAIS_ESPERADOS.trimestre}, somou ${trimestre}`,
  );
  conferir(ano === TOTAIS_ESPERADOS.ano, `2026 deveria somar ${TOTAIS_ESPERADOS.ano}, somou ${ano}`);
  conferir(
    pontos._sum.amount === pontosTotais,
    `pontos deveriam somar ${pontosTotais}, somaram ${pontos._sum.amount}`,
  );

  for (const amigo of AMIGOS) {
    const dele = amigos.find((a) => a.nome === amigo.nome)!;

    const notas = await prisma.receipt.count({
      where: {
        userId: dele.id,
        status: 'DONE',
        issuedAt: { gte: data(2026, 9, 1, 0), lt: data(2026, 10, 1, 0) },
      },
    });
    const economia = await prisma.receipt.aggregate({
      where: {
        userId: dele.id,
        status: 'DONE',
        issuedAt: { gte: data(2026, 9, 1, 0), lt: data(2026, 10, 1, 0) },
      },
      _sum: { savingsCents: true },
    });

    conferir(notas === amigo.compras, `${amigo.nome} deveria ter ${amigo.compras} notas, tem ${notas}`);
    conferir(
      economia._sum.savingsCents === amigo.economiaCentavos,
      `${amigo.nome} deveria economizar ${amigo.economiaCentavos}, economizou ${economia._sum.savingsCents}`,
    );
  }

  const economiaDaCamila = await prisma.receipt.aggregate({
    where: {
      userId: camila.id,
      status: 'DONE',
      issuedAt: { gte: data(2026, 9, 1, 0), lt: data(2026, 10, 1, 0) },
    },
    _sum: { savingsCents: true },
  });
  conferir(
    economiaDaCamila._sum.savingsCents === ECONOMIA_DE_SETEMBRO,
    `a economia da Camila deveria somar ${ECONOMIA_DE_SETEMBRO}, somou ${economiaDaCamila._sum.savingsCents}`,
  );

  const somaDaLista = await prisma.shoppingListItem.aggregate({
    where: { list: { userId: camila.id } },
    _sum: { estimatedCents: true },
  });
  conferir(
    somaDaLista._sum.estimatedCents === TOTAIS_ESPERADOS.listaDaSemana,
    `a lista deveria estimar ${TOTAIS_ESPERADOS.listaDaSemana} centavos, estimou ${somaDaLista._sum.estimatedCents}`,
  );

  if (problemas.length) {
    console.error('\nO seed não reproduz os números das telas de referência:\n');
    for (const p of problemas) console.error(`  - ${p}`);
    throw new Error(`${problemas.length} divergência(s) entre o seed e as telas.`);
  }

  /* eslint-disable no-console */
  console.log('Seed pronto.');
  console.log(`  Camila Alves — camila.alves@email.com / Economia2026`);
  console.log(`  Admin        — admin@gastemenos.com.br / Economia2026`);
  console.log(`  Nível 12 · ${pontosTotais} pontos · 5 semanas de sequência`);
  console.log(`  ${deSetembro.length} notas em setembro · R$ ${(totalDeSetembro / 100).toFixed(2)}`);
  console.log(`  Trimestre R$ ${(trimestre / 100).toFixed(2)} · Ano R$ ${(ano / 100).toFixed(2)}`);
  console.log(`  ${amigos.length} amigos · ${lojas.length} lojas · ${produtos.length} produtos`);
  console.log(`  Região (geohash): ${geohashDaRegiao}`);
  /* eslint-enable no-console */
}

main()
  .catch((erroDoSeed) => {
    console.error(erroDoSeed instanceof Error ? erroDoSeed.message : erroDoSeed);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

