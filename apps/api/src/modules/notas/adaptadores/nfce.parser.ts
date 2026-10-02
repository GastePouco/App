import * as cheerio from 'cheerio';
import { ErroDeLeitura, type ItemLido, type NotaLida } from './adaptador.js';
import { createHmac } from 'node:crypto';
import { configuracao } from '../../../comum/configuracao.js';

/**
 * Leitura da página pública de consulta da NFC-e.
 *
 * Os estados usam variações do mesmo modelo de página da SEFAZ, então este
 * parser é compartilhado e cada adaptador ajusta o que for próprio dele.
 *
 * **Procura por rótulo visível, não por posição nem por classe CSS.** A página
 * muda sem aviso (docs/06-NFCE-LEITURA.md): classe renomeada e coluna trocada
 * de lugar acontecem; "Qtde.", "Vl. Unit." e "Valor a pagar" são o que a
 * pessoa lê na tela e quase nunca mudam. Quando o caminho por classe falha,
 * caímos no texto corrido da linha.
 *
 * Duas armadilhas da página real, que custam caro se ignoradas:
 *
 * - **"Troco" às vezes vem como NaN** e "Valor pago" pode divergir do valor da
 *   nota. O que vale é "Valor a pagar".
 * - **O CPF do consumidor aparece na página.** Este parser não o lê nem o
 *   devolve — só registra que existia.
 */

/** "1.234,56" e "1234.56" viram 123456 centavos. */
export function paraCentavos(texto: string): number {
  const limpo = (texto ?? '')
    .replace(/[^\d,.-]/g, '')
    // Ponto de milhar só quando seguido de exatamente 3 dígitos.
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const numero = Number(limpo);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/** Quantidade com até 3 casas: "0,638" → 0.638. */
export function paraQuantidade(texto: string): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? numero : 1;
}

function normalizar(texto: string | undefined | null): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

/** Tira o rótulo: "Qtde.: 2" → "2". */
function depoisDoRotulo(valor: string): string {
  const partes = valor.split(':');
  return partes.length > 1 ? partes.slice(1).join(':').trim() : valor.trim();
}

const PAGAMENTOS: Array<[RegExp, NotaLida['paymentMethod']]> = [
  [/pix/i, 'PIX'],
  [/cr[ée]dito/i, 'CREDITO'],
  [/d[ée]bito/i, 'DEBITO'],
  [/dinheiro|esp[ée]cie/i, 'DINHEIRO'],
  [/vale|alimenta[çc][ãa]o|refei[çc][ãa]o/i, 'VALE'],
];

export function extrairPagamento(html: string): NotaLida['paymentMethod'] {
  const bloco = html.match(/(?:Forma de pagamento|FORMA PAGAMENTO)[\s\S]{0,400}/i)?.[0] ?? '';
  for (const [padrao, forma] of PAGAMENTOS) if (padrao.test(bloco)) return forma;
  return undefined;
}

/**
 * Data de emissão.
 *
 * A página escreve "Emissão: 24/09/2026 18:32:11-03:00". Guardamos em UTC,
 * respeitando o fuso que veio; sem fuso, assumimos Brasília, que é o fuso da
 * emissão em todos os estados atendidos.
 */
export function extrairEmissao(html: string): string | null {
  const achado = html.match(
    /Emiss[ãa]o[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]{0,5}(\d{2}):(\d{2}):(\d{2}))?/i,
  );
  if (!achado) return null;

  const [, dia, mes, ano, hora = '12', minuto = '00', segundo = '00'] = achado;
  const fuso = html.match(/\d{2}:\d{2}:\d{2}\s*([-+]\d{2}:\d{2})/)?.[1] ?? '-03:00';

  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}${fuso}`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * Total da nota. "Valor a pagar" primeiro — é o único que sempre bate.
 */
export function extrairTotal(html: string, $: cheerio.CheerioAPI): number {
  const porRotulo =
    html.match(/Valor\s+a\s+pagar\s*R?\$?\s*:?\s*<\/[^>]+>\s*<[^>]+>\s*([\d.,]+)/i) ??
    html.match(/Valor\s+total\s*R?\$?\s*:?\s*<\/[^>]+>\s*<[^>]+>\s*([\d.,]+)/i);

  if (porRotulo?.[1]) {
    const valor = paraCentavos(porRotulo[1]);
    if (valor > 0) return valor;
  }

  for (const seletor of ['#totalNota .txtMax', '.totalNumb', '#linhaTotal .txtMax']) {
    const valor = paraCentavos(normalizar($(seletor).first().text()));
    if (valor > 0) return valor;
  }

  return 0;
}

/**
 * Lê um item a partir do texto corrido da linha.
 *
 * O texto real de uma linha é assim:
 *   ARROZ TIPO 1 5KG(Código: 000123)Qtde.:2UN: UNVl. Unit.: 28,90Vl. Total57,80
 *
 * Este caminho sobrevive a mudança de classe CSS; só quebra se os rótulos
 * visíveis mudarem.
 */
export function itemPorTexto(linha: string): ItemLido | null {
  const texto = normalizar(linha);

  const achado = texto.match(
    /^(.*?)\s*\(\s*C[óo]digo:?\s*([^)]*)\)\s*Qtde\.?\s*:?\s*([\d.,]*)\s*UN\s*:?\s*([A-Za-zÇç]*)\s*Vl\.?\s*Unit\.?\s*:?\s*([\d.,]*)\s*Vl\.?\s*Total\s*:?\s*([\d.,]*)/i,
  );
  if (!achado) return null;

  const [, descricao, codigo, quantidade, unidade, unitario, total] = achado;
  if (!descricao?.trim()) return null;

  return montarItem({
    descricao,
    codigo: codigo ?? '',
    quantidade: quantidade ?? '',
    unidade: unidade ?? '',
    unitario: unitario ?? '',
    total: total ?? '',
  });
}

function montarItem(dados: {
  descricao: string;
  codigo: string;
  quantidade: string;
  unidade: string;
  unitario: string;
  total: string;
}): ItemLido | null {
  const quantidade = paraQuantidade(dados.quantidade);
  const unitPriceCents = paraCentavos(dados.unitario);
  const totalCents = paraCentavos(dados.total);

  if (!unitPriceCents && !totalCents) return null;

  const item: ItemLido = {
    rawDescription: normalizar(dados.descricao),
    quantity: quantidade,
    unit: normalizar(dados.unidade).replace(/^UN:?\s*/i, '').toUpperCase() || 'UN',
    // Um dos dois pode faltar; o outro reconstrói.
    unitPriceCents: unitPriceCents || Math.round(totalCents / quantidade),
    totalCents: totalCents || Math.round(unitPriceCents * quantidade),
  };

  // A página escreve "(Código: 7896006711056)": tira parênteses e rótulo.
  const codigo = normalizar(dados.codigo)
    .replace(/[()]/g, '')
    .replace(/^C[óo]digo:?\s*/i, '')
    .trim();

  if (codigo) item.storeCode = codigo;
  // GTIN tem 8, 12, 13 ou 14 dígitos; código interno da loja não tem esse
  // formato, e tratar um pelo outro juntaria produtos diferentes no catálogo.
  if (/^\d{8}$|^\d{12,14}$/.test(codigo)) item.gtin = codigo;

  return item;
}

export function extrairItens($: cheerio.CheerioAPI): ItemLido[] {
  const itens: ItemLido[] = [];

  $('#tabResult tr, table tr').each((_, elemento) => {
    const linha = $(elemento);
    // Ignora linhas que contêm outras tabelas: contariam os filhos duas vezes.
    if (linha.find('tr').length > 0) return;

    // Caminho rápido: as classes do modelo padrão da NFC-e.
    const descricao = normalizar(linha.find('.txtTit, .txtTit2').first().text());
    if (descricao) {
      const candidato = montarItem({
        descricao,
        codigo: depoisDoRotulo(normalizar(linha.find('.RCod').first().text())),
        quantidade: depoisDoRotulo(normalizar(linha.find('.Rqtd').first().text())),
        unidade: depoisDoRotulo(normalizar(linha.find('.RUN').first().text())),
        unitario: depoisDoRotulo(normalizar(linha.find('.RvlUnit').first().text())),
        total: normalizar(linha.find('.valor').first().text()),
      });
      if (candidato) {
        itens.push(candidato);
        return;
      }
    }

    // Caminho de segurança: o texto corrido.
    const porTexto = itemPorTexto(linha.text());
    if (porTexto) itens.push(porTexto);
  });

  return itens;
}

export function extrairLoja(
  html: string,
  $: cheerio.CheerioAPI,
  uf: string,
): NotaLida['store'] {
  const nome =
    normalizar($('.txtTopo').first().text()) ||
    normalizar($('#u20').first().text()) ||
    normalizar(html.match(/class="[^"]*txtTopo[^"]*"[^>]*>\s*([^<]+)/i)?.[1]);

  const cnpjFormatado = html.match(/CNPJ:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i)?.[1];
  const cnpj = (cnpjFormatado ?? '').replace(/\D/g, '');

  // O endereço vem como um bloco depois do CNPJ, separado por vírgulas.
  const enderecoBruto = normalizar($('.text').first().text());
  const cidade = enderecoBruto.split(',').at(-2)?.trim();

  const loja: NotaLida['store'] = { cnpj, name: nome || 'Loja não identificada', uf };
  if (enderecoBruto) loja.address = enderecoBruto;
  if (cidade) loja.city = cidade;

  return loja;
}

/** A página traz o CPF do consumidor quando ele foi informado na compra. */
export function temCpfDoConsumidor(html: string): boolean {
  return /CPF\s*(?:\/\s*CNPJ)?\s*(?:do\s*)?consumidor/i.test(html) || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(html);
}

/**
 * HMAC do CPF do consumidor, quando a página traz um.
 *
 * **O número não sai desta função.** Ele é lido, virado hash e esquecido: é o
 * que permite confirmar que a nota é de quem a leu sem guardar o CPF de ninguém
 * (docs/09-SEGURANCA-LGPD.md, "Minimização").
 *
 * Primeiro o formato pontuado, que é como a SEFAZ imprime; só depois onze
 * dígitos colados **perto da palavra CPF**. Sem essa segunda âncora, qualquer
 * número de onze algarismos na página — e há vários — entraria no lugar do CPF.
 */
export function hashDoCpfDoConsumidor(html: string, segredo: string): string | undefined {
  const pontuado = /(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/.exec(html);
  const colado = /CPF[^<>\d]{0,20}(\d{11})/i.exec(html);

  const digitos = pontuado ? pontuado.slice(1).join('') : colado?.[1];
  if (!digitos || digitos.length !== 11) return undefined;

  return createHmac('sha256', segredo).update(digitos).digest('hex');
}

export function interpretarPagina(html: string, chave: string, uf: string): NotaLida {
  const $ = cheerio.load(html);

  const itens = extrairItens($);
  let total = extrairTotal(html, $);

  // Sem total legível, a soma dos itens serve — e é conferível pela pessoa.
  if (!total && itens.length) {
    total = itens.reduce((soma, item) => soma + item.totalCents, 0);
  }

  // Página sem item nem total não é uma nota: ou o portal devolveu erro, ou
  // pediu captcha, ou mudou de formato. Melhor falhar alto do que gravar uma
  // compra vazia no histórico de alguém.
  if (!itens.length && !total) {
    throw new ErroDeLeitura('PARSE_FAILED', 'Página sem itens nem total.');
  }

  const emissao = extrairEmissao(html);
  const cpf = hashDoCpfDoConsumidor(html, configuracao.segredoDoHashDeCpf);

  const nota: NotaLida = {
    accessKey: chave,
    store: extrairLoja(html, $, uf),
    issuedAt: emissao ?? new Date().toISOString(),
    totalCents: total,
    paymentMethod: extrairPagamento(html),
    items: itens,
    consumerCpfPresent: temCpfDoConsumidor(html),
  };
  if (cpf) nota.consumerCpfHash = cpf;

  return nota;
}
