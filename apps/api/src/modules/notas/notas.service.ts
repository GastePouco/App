import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  LIMITES,
  PONTOS,
  codificarGeohash,
  erro,
  extrairChaveDaUrl,
  lerChaveDeAcesso,
  regiaoDoGeohash,
  valePontosPelaData,
} from '@gastemenos/shared';
import { configuracao } from '../../comum/configuracao.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PontosService, type SubidaDeNivel } from '../jogo/pontos.service.js';
import { SequenciaService } from '../jogo/sequencia.service.js';
import { AmigosService } from '../jogo/amigos.service.js';
import { SelosService } from '../jogo/selos.service.js';
import { RecompensasService } from '../recompensas/recompensas.service.js';
import { ProdutosService } from './produtos.service.js';
import { ArmazenamentoService } from '../armazenamento/armazenamento.service.js';
import { RegistroDeAdaptadores } from './adaptadores/registro.js';
import { ErroDeLeitura, type NotaLida } from './adaptadores/adaptador.js';

function falha(code: string, status = HttpStatus.BAD_REQUEST): HttpException {
  return new HttpException(erro(code), status);
}

/**
 * Tira o CPF do consumidor da página antes de guardá-la.
 *
 * Cobre `000.000.000-00` e `00000000000`. Falso positivo aqui não custa nada —
 * o arquivo existe para alguém olhar o formato do HTML, não os números.
 */
export function semCpf(html: string): string {
  return html
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF removido]')
    .replace(/(CPF[^<>\d]{0,20})\d{11}/gi, '$1[CPF removido]');
}

export interface ResultadoDaLeitura {
  id: string;
  status: string;
  pointsAwarded?: number;
  levelUp?: SubidaDeNivel | null;
  newBadges?: Array<{ id: string; name: string }>;
  savingsCents?: number;
  /**
   * Marco de recompensa batido com esta nota, quando houve
   * (docs/18-RECOMPENSAS.md). A tela comemora com o valor em centavos.
   */
  reward?: { milestone: number; receipts: number; amountCents: number };
  /** Frase para "Ler em voz alta" (docs/06-NFCE-LEITURA.md). */
  speech?: string;
}

@Injectable()
export class NotasService {
  private readonly logger = new Logger(NotasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pontos: PontosService,
    private readonly produtos: ProdutosService,
    private readonly adaptadores: RegistroDeAdaptadores,
    private readonly sequencia: SequenciaService,
    private readonly amigos: AmigosService,
    private readonly selos: SelosService,
    private readonly armazenamento: ArmazenamentoService,
    private readonly recompensas: RecompensasService,
  ) {}

  /**
   * Recebe QR ou chave, valida e enfileira.
   *
   * A deduplicação é **global, não por usuário**: a chave é única no sistema
   * inteiro (`Receipt.accessKey @unique`). Cada nota vale uma vez — senão duas
   * pessoas leriam a mesma nota e a base de preços contaria a mesma observação
   * duas vezes, inflando a confiança de um preço que foi visto uma só
   * (docs/06-NFCE-LEITURA.md).
   */
  async registrar(
    userId: string,
    dados: { qrUrl?: string; accessKey?: string; source: string },
  ): Promise<{ id: string; status: string }> {
    const leitura = dados.qrUrl
      ? extrairChaveDaUrl(dados.qrUrl)
      : lerChaveDeAcesso(dados.accessKey ?? '');

    if (!leitura.ok) throw falha(leitura.code);

    const { chave } = leitura;

    const adaptador = this.adaptadores.para(chave.uf);
    if (!adaptador) {
      // Chave válida, estado ainda não atendido. A mensagem precisa deixar
      // claro que o problema é nosso, não da nota da pessoa.
      throw new HttpException(
        {
          code: 'UF_NAO_ATENDIDA',
          message: `Ainda não lemos notas desse estado. Por enquanto lemos: ${this.adaptadores.ufsAtendidas().join(', ')}.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const jaLida = await this.prisma.receipt.findUnique({
      where: { accessKey: chave.valor },
      select: { id: true, userId: true },
    });

    if (jaLida) {
      // Mesma mensagem para "você já leu" e "outra pessoa leu": dizer que foi
      // outra pessoa entregaria informação sobre terceiros.
      throw falha('RECEIPT_ALREADY_READ', HttpStatus.CONFLICT);
    }

    // Nota velha entra no histórico, mas sem pontos. Limite diário idem: a
    // nota nunca é recusada por causa da gamificação.
    const dentroDoPrazo = valePontosPelaData(chave);
    const dentroDoLimite = await this.pontos.podeCreditarNota(userId);

    const nota = await this.prisma.receipt.create({
      data: {
        accessKey: chave.valor,
        userId,
        status: 'PENDING',
        source: dados.source,
        qrUrl: dados.qrUrl ?? null,
        pointsEligible: dentroDoPrazo && dentroDoLimite,
      },
      select: { id: true, status: true },
    });

    return nota;
  }

  /**
   * Grava a nota interpretada e credita os pontos numa transação só.
   *
   * Tudo junto de propósito: se a loja for criada, os itens gravados e o
   * crédito falhar, a pessoa fica com a compra no histórico e sem os pontos —
   * e não há como saber depois se ela já os recebeu.
   */
  async concluir(notaId: string, lida: NotaLida): Promise<ResultadoDaLeitura> {
    const nota = await this.prisma.receipt.findUnique({
      where: { id: notaId },
      select: { id: true, userId: true, pointsEligible: true, status: true },
    });
    if (!nota) throw falha('NOT_FOUND', HttpStatus.NOT_FOUND);

    const loja = await this.acharOuCriarLoja(lida.store);
    const geohash = loja.geohash ?? '';

    // Nota de valor irrisório não vale pontos (docs/07-GAMIFICACAO.md).
    const acimaDoMinimo = lida.totalCents >= LIMITES.VALOR_MINIMO_DA_NOTA_CENTAVOS;
    const vaiCreditar = nota.pointsEligible && acimaDoMinimo;

    const itensComProduto = await Promise.all(
      lida.items.map(async (item) => ({
        item,
        productId: await this.produtos.casar(item, loja.cnpj),
      })),
    );

    // Média da região antes de gravar: a comparação que a tela mostra é com o
    // preço que existia no momento da compra, não com o de depois dela.
    const mediasDaRegiao = await this.mediasDaRegiao(
      itensComProduto.map((i) => i.productId),
      geohash,
    );

    let economiaEmCentavos = 0;
    for (const { item, productId } of itensComProduto) {
      const media = mediasDaRegiao.get(productId);
      if (media && media > item.unitPriceCents) {
        economiaEmCentavos += Math.round((media - item.unitPriceCents) * item.quantity);
      }
    }

    const userHash = createHmac('sha256', configuracao.segredoDoHashDeUsuario)
      .update(nota.userId)
      .digest('hex')
      .slice(0, 32);

    const observadoEm = new Date(lida.issuedAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.update({
        where: { id: notaId },
        data: {
          status: 'DONE',
          storeId: loja.id,
          issuedAt: observadoEm,
          totalCents: lida.totalCents,
          discountCents: lida.discountCents ?? null,
          paymentMethod: lida.paymentMethod ?? null,
          savingsCents: economiaEmCentavos,
          processedAt: new Date(),
          // A URL do QR não fica guardada além do processamento
          // (docs/09-SEGURANCA-LGPD.md, "Minimização").
          qrUrl: null,
        },
      });

      for (const { item, productId } of itensComProduto) {
        const criado = await tx.receiptItem.create({
          data: {
            receiptId: notaId,
            productId,
            rawDescription: item.rawDescription,
            storeCode: item.storeCode ?? null,
            gtin: item.gtin ?? null,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            regionAvgCents: mediasDaRegiao.get(productId) ?? null,
          },
          select: { id: true },
        });

        if (geohash) {
          await tx.priceObservation.create({
            data: {
              productId,
              storeId: loja.id,
              receiptItemId: criado.id,
              // Nunca o userId: o preço entra na base sem ligação com a pessoa.
              userHash,
              unitPriceCents: item.unitPriceCents,
              observedAt: observadoEm,
              geohash,
            },
          });
        }
      }
    });

    let pontosCreditados = 0;
    let subiuDeNivel: SubidaDeNivel | null = null;

    if (vaiCreditar) {
      const nota60 = await this.pontos.creditar(nota.userId, PONTOS.NOTA_LIDA, 'RECEIPT', notaId);
      if (nota60.creditado) pontosCreditados += PONTOS.NOTA_LIDA;
      subiuDeNivel = nota60.levelUp;

      // Mercado novo para esta pessoa vale um bônus, uma vez por CNPJ.
      const jaComprouAqui = await this.prisma.receipt.count({
        where: { userId: nota.userId, storeId: loja.id, status: 'DONE', NOT: { id: notaId } },
      });
      if (jaComprouAqui === 0) {
        const bonus = await this.pontos.creditar(
          nota.userId,
          PONTOS.MERCADO_NOVO,
          'NEW_STORE',
          loja.cnpj,
        );
        if (bonus.creditado) pontosCreditados += PONTOS.MERCADO_NOVO;
        subiuDeNivel ??= bonus.levelUp;
      }

      // Semana com nota: 40 pontos, uma vez por semana. O refId é a semana,
      // então ler cinco notas na mesma semana credita uma vez só.
      const semana = await this.sequencia.creditarSemana(nota.userId, observadoEm);
      if (semana) pontosCreditados += PONTOS.SEMANA_COM_NOTA;

      await this.prisma.receipt.update({
        where: { id: notaId },
        data: { pointsAwarded: pontosCreditados },
      });
    }

    // Quem convidou ganha quando o convidado lê a **primeira** nota — não no
    // cadastro, para o convite não virar fábrica de conta vazia.
    await this.amigos.premiarQuemConvidou(nota.userId);

    // Selos novos entram na resposta: é o que a tela NotaLida comemora.
    const selosNovos = await this.selos.conferirEConceder(nota.userId);

    // Recompensa por marco de notas (docs/18-RECOMPENSAS.md). Vem depois da
    // transação de propósito: o marco conta nota que **virou observação de
    // preço**, e a observação só existe depois do commit. Se o crédito falhar,
    // a nota já está no histórico e o job noturno paga o marco — o contrário
    // (creditar e perder a nota) seria pagar por dado que não entrou.
    const marcos = await this.recompensas.avaliarMarcos(nota.userId);

    return {
      id: notaId,
      status: 'DONE',
      pointsAwarded: pontosCreditados,
      levelUp: subiuDeNivel,
      newBadges: selosNovos.map((selo) => ({ id: selo.id, name: selo.name })),
      savingsCents: economiaEmCentavos,
      // Só o último marco: bater dois de uma vez é consequência de regra nova,
      // não algo para a tela narrar em duas comemorações.
      reward: marcos.length ? marcos[marcos.length - 1] : undefined,
      speech: this.frasePara(lida, pontosCreditados),
    };
  }

  /** Marca a falha com o motivo que a tela sabe traduzir. */
  /**
   * Marca a falha e guarda a página, quando há página.
   *
   * Sem isso não há o que corrigir: a SEFAZ muda o HTML, a leitura quebra, e a
   * única prova do formato novo some junto com a requisição. Com ela, quem for
   * arrumar o parser tem o caso real na mão.
   *
   * **O CPF do consumidor sai antes de gravar.** Ele aparece na página, não
   * entra no banco em lugar nenhum, e não vai virar exceção aqui só porque é
   * "depuração" (docs/09-SEGURANCA-LGPD.md, "Minimização"). O arquivo é apagado
   * em 30 dias pelo job de expurgo.
   */
  async marcarFalha(notaId: string, erroDeLeitura: ErroDeLeitura, html?: string): Promise<void> {
    let chaveDoArquivo: string | null = null;

    if (html && erroDeLeitura.motivo === 'PARSE_FAILED') {
      try {
        chaveDoArquivo = `notas/${notaId}.html`;
        await this.armazenamento.guardar(chaveDoArquivo, Buffer.from(semCpf(html)), 'text/html');
      } catch (falha) {
        // Guardar é ajuda, não requisito: a nota continua marcada como falha.
        this.logger.warn(
          `Não foi possível guardar a página da nota ${notaId}: ${falha instanceof Error ? falha.message : String(falha)}`,
        );
        chaveDoArquivo = null;
      }
    }

    await this.prisma.receipt.update({
      where: { id: notaId },
      data: {
        status: erroDeLeitura.motivo,
        failureReason: erroDeLeitura.motivo,
        ...(chaveDoArquivo ? { rawStorageKey: chaveDoArquivo } : {}),
      },
    });
  }

  private async acharOuCriarLoja(dados: NotaLida['store']) {
    const existente = await this.prisma.store.findUnique({ where: { cnpj: dados.cnpj } });
    if (existente) return existente;

    // Geocodificação real entra na fase 5, junto com o módulo de preços. Até
    // lá, a região vem do centro de Brasília para o DF — o que mantém o
    // agregado funcionando sem prometer precisão que não temos.
    const { lat, lng } = { lat: -15.7942, lng: -47.8822 };

    return this.prisma.store.create({
      data: {
        cnpj: dados.cnpj,
        name: dados.name,
        address: dados.address ?? null,
        city: dados.city ?? null,
        uf: dados.uf,
        lat,
        lng,
        geohash: codificarGeohash(lat, lng),
      },
    });
  }

  /**
   * Média da região por produto, dos últimos 7 dias.
   *
   * Só devolve o que cumpre o anonimato mínimo — 5 notas de 3 pessoas
   * diferentes (docs/02-ARQUITETURA.md). Abaixo disso, o produto simplesmente
   * não entra no mapa, e a tela mostra "Ainda juntando preços desta região".
   */
  private async mediasDaRegiao(
    productIds: string[],
    geohash: string,
  ): Promise<Map<string, number>> {
    const medias = new Map<string, number>();
    if (!geohash || productIds.length === 0) return medias;

    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const regiao = regiaoDoGeohash(geohash);

    const observacoes = await this.prisma.priceObservation.findMany({
      where: {
        productId: { in: productIds },
        geohash: { in: regiao },
        observedAt: { gte: seteDiasAtras },
      },
      select: { productId: true, unitPriceCents: true, userHash: true },
    });

    const porProduto = new Map<string, { precos: number[]; pessoas: Set<string> }>();
    for (const observacao of observacoes) {
      const atual = porProduto.get(observacao.productId) ?? { precos: [], pessoas: new Set() };
      atual.precos.push(observacao.unitPriceCents);
      atual.pessoas.add(observacao.userHash);
      porProduto.set(observacao.productId, atual);
    }

    for (const [productId, dados] of porProduto) {
      if (dados.precos.length < 5 || dados.pessoas.size < 3) continue;
      medias.set(productId, mediaAparada(dados.precos));
    }

    return medias;
  }

  private frasePara(lida: NotaLida, pontos: number): string {
    const reais = Math.floor(lida.totalCents / 100);
    const centavos = lida.totalCents % 100;
    const valor = centavos
      ? `${reais} reais e ${centavos} centavos`
      : `${reais} reais`;

    const comPontos = pontos > 0 ? ` Você ganhou ${pontos} pontos.` : '';
    return `Nota do ${lida.store.name}, ${valor}.${comPontos}`;
  }
}

/**
 * Média aparada: descarta 10% em cada ponta antes de calcular.
 *
 * Um preço digitado errado ou um item promocional isolado desloca a média
 * simples o bastante para a tela mentir. Aparar as pontas custa duas linhas e
 * resolve (docs/02-ARQUITETURA.md).
 */
export function mediaAparada(valores: number[]): number {
  if (valores.length === 0) return 0;

  const ordenados = [...valores].sort((a, b) => a - b);
  const aparar = Math.floor(ordenados.length * 0.1);
  const miolo = ordenados.slice(aparar, ordenados.length - aparar);
  const usados = miolo.length > 0 ? miolo : ordenados;

  return Math.round(usados.reduce((soma, v) => soma + v, 0) / usados.length);
}
