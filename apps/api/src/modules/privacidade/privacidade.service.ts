import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { erro } from '@gastemenos/shared';
import { emDias } from '../../comum/tempo.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { SessoesService } from '../auth/sessoes.service.js';
import { ArmazenamentoService } from '../armazenamento/armazenamento.service.js';

/**
 * Direitos do titular (LGPD, art. 18) — exportar e eliminar.
 *
 * As duas decisões que definem este arquivo:
 *
 * **Exclusão tem 30 dias de carência, e entrar de novo cancela.** Encerrar
 * conta no impulso é comum; perder três anos de histórico de compras por causa
 * disso não é aceitável. O prazo está escrito na tela, e voltar é um login.
 *
 * **As observações de preço sobrevivem à exclusão, só com o `userHash`.**
 * Elas já não têm ligação com a pessoa — o hash deixa de poder ser ligado a
 * alguém no momento em que a conta some. Apagá-las destruiria a média da
 * região para todos os vizinhos por causa da saída de um. Isso está dito em
 * docs/09-SEGURANCA-LGPD.md e precisa estar na política de privacidade.
 */

/** U+FEFF, escrito por código: caractere invisível no meio do fonte some. */
const BOM = String.fromCharCode(0xfeff);

const DIAS_ATE_A_EXCLUSAO = 30;
const DIAS_DE_VALIDADE_DO_ARQUIVO = 7;

@Injectable()
export class PrivacidadeService {
  private readonly logger = new Logger(PrivacidadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sessoes: SessoesService,
    private readonly armazenamento: ArmazenamentoService,
  ) {}

  // ------------------------------------------------------------- exportar

  /**
   * Monta o ZIP com tudo que a pessoa tem no sistema.
   *
   * JSON para quem vai reimportar, CSV para quem vai abrir na planilha — a
   * lei fala em "formato de fácil acesso", e quem pede os próprios dados
   * normalmente quer olhar, não programar.
   */
  async exportar(userId: string): Promise<{ id: string; status: string }> {
    const registro = await this.prisma.dataExport.create({
      data: { userId, status: 'PENDING' },
      select: { id: true, status: true },
    });

    // Geração em segundo plano: uma conta com anos de nota demoraria demais
    // para caber numa requisição.
    void this.gerar(userId, registro.id).catch((falha) => {
      this.logger.error(
        `Falha ao gerar a exportação ${registro.id}.`,
        falha instanceof Error ? falha.stack : String(falha),
      );
    });

    return registro;
  }

  private async gerar(userId: string, exportId: string): Promise<void> {
    const usuario = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        rankingName: true,
        phone: true,
        cep: true,
        createdAt: true,
        profile: true,
        preferences: true,
        consents: { select: { kind: true, granted: true, createdAt: true } },
        points: { select: { amount: true, reason: true, createdAt: true } },
        badges: { select: { badgeId: true, progress: true, unlockedAt: true } },
        // Saldo de recompensa é dinheiro da pessoa: sai junto, sem ela pedir
        // (docs/09-SEGURANCA-LGPD.md e docs/18-RECOMPENSAS.md).
        rewards: { select: { amountCents: true, reason: true, refId: true, createdAt: true } },
        rewardBenefits: { select: { code: true, startsAt: true, endsAt: true } },
      },
    });

    const notas = await this.prisma.receipt.findMany({
      where: { userId, status: 'DONE' },
      select: {
        issuedAt: true,
        totalCents: true,
        savingsCents: true,
        paymentMethod: true,
        store: { select: { name: true, city: true, uf: true } },
        items: {
          select: {
            rawDescription: true,
            quantity: true,
            unit: true,
            unitPriceCents: true,
            totalCents: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });

    const listas = await this.prisma.shoppingList.findMany({
      where: { userId },
      select: {
        name: true,
        items: { select: { label: true, quantity: true, checked: true } },
      },
    });

    const zip = new JSZip();

    zip.file(
      'leia-me.txt',
      [
        'Seus dados no GasteMenos',
        '',
        `Gerado em ${new Date().toLocaleString('pt-BR')}.`,
        '',
        'conta.json ....... seus dados de cadastro, preferências e consentimentos',
        'notas.json ....... suas compras, com todos os itens',
        'notas.csv ........ as mesmas compras, para abrir numa planilha',
        'itens.csv ........ um item por linha, para analisar preços',
        'listas.json ...... suas listas de compras',
        'pontos.json ...... seu histórico de pontos e selos',
        'recompensa.json .. seu saldo, cada crédito e cada gasto, e o que você trocou',
        '',
        'O que NÃO está aqui, e por quê:',
        '',
        'Os preços que você contribuiu para a média da sua região não aparecem',
        'ligados a você porque eles nunca estiveram: entram na base identificados',
        'por um código embaralhado, sem ligação com a sua conta.',
      ].join('\n'),
    );

    zip.file(
      'conta.json',
      JSON.stringify(
        {
          nome: usuario.name,
          email: usuario.email,
          nomeNoRanking: usuario.rankingName,
          celular: usuario.phone,
          cep: usuario.cep,
          contaCriadaEm: usuario.createdAt,
          perfilDeConsumo: usuario.profile,
          preferencias: usuario.preferences,
          consentimentos: usuario.consents,
        },
        null,
        2,
      ),
    );

    zip.file('notas.json', JSON.stringify(notas, null, 2));
    zip.file('listas.json', JSON.stringify(listas, null, 2));
    zip.file(
      'pontos.json',
      JSON.stringify({ lancamentos: usuario.points, selos: usuario.badges }, null, 2),
    );

    zip.file(
      'recompensa.json',
      JSON.stringify(
        {
          saldoEmCentavos: usuario.rewards.reduce((total, linha) => total + linha.amountCents, 0),
          lancamentos: usuario.rewards,
          beneficios: usuario.rewardBenefits,
        },
        null,
        2,
      ),
    );

    zip.file(
      'notas.csv',
      this.paraCsv(
        ['data', 'loja', 'cidade', 'uf', 'total', 'economia', 'pagamento', 'itens'],
        notas.map((nota) => [
          nota.issuedAt?.toISOString().slice(0, 10) ?? '',
          nota.store?.name ?? '',
          nota.store?.city ?? '',
          nota.store?.uf ?? '',
          this.emReais(nota.totalCents),
          this.emReais(nota.savingsCents),
          nota.paymentMethod ?? '',
          String(nota.items.length),
        ]),
      ),
    );

    zip.file(
      'itens.csv',
      this.paraCsv(
        ['data', 'loja', 'produto', 'quantidade', 'unidade', 'preco_unitario', 'total'],
        notas.flatMap((nota) =>
          nota.items.map((item) => [
            nota.issuedAt?.toISOString().slice(0, 10) ?? '',
            nota.store?.name ?? '',
            item.rawDescription,
            String(item.quantity),
            item.unit,
            this.emReais(item.unitPriceCents),
            this.emReais(item.totalCents),
          ]),
        ),
      ),
    );

    const conteudo = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const nomeDoArquivo = `${exportId}.zip`;
    await this.armazenamento.guardar(nomeDoArquivo, conteudo);

    await this.prisma.dataExport.update({
      where: { id: exportId },
      data: { status: 'READY', fileKey: nomeDoArquivo, readyAt: new Date() },
    });

    await this.email.avisar(
      usuario.email,
      'Seus dados do GasteMenos estão prontos',
      `O arquivo fica disponível por ${DIAS_DE_VALIDADE_DO_ARQUIVO} dias no aplicativo, em Perfil › Privacidade e dados.`,
    );
  }

  private emReais(centavos: number | null | undefined): string {
    return ((centavos ?? 0) / 100).toFixed(2).replace('.', ',');
  }

  /** CSV com ponto e vírgula e BOM: é o que o Excel em português espera. */
  private paraCsv(cabecalho: string[], linhas: string[][]): string {
    const escapar = (valor: string): string =>
      /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

    const corpo = [cabecalho, ...linhas]
      .map((linha) => linha.map(escapar).join(';'))
      .join('\r\n');

    // U+FEFF no começo: sem ele o Excel em português abre o CSV como latin-1
    // e troca todo acento por caractere estranho.
    return BOM + corpo;
  }

  async situacaoDaExportacao(userId: string, exportId: string) {
    const registro = await this.prisma.dataExport.findFirst({
      where: { id: exportId, userId },
      select: { id: true, status: true, readyAt: true, fileKey: true },
    });
    if (!registro) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const expirou =
      registro.readyAt &&
      registro.readyAt.getTime() + DIAS_DE_VALIDADE_DO_ARQUIVO * 24 * 60 * 60 * 1000 < Date.now();

    return {
      id: registro.id,
      status: expirou ? 'EXPIRED' : registro.status,
      readyAt: registro.readyAt,
      expiresAt: registro.readyAt ? emDias(DIAS_DE_VALIDADE_DO_ARQUIVO) : null,
    };
  }

  async baixar(userId: string, exportId: string): Promise<Buffer> {
    const registro = await this.prisma.dataExport.findFirst({
      where: { id: exportId, userId, status: 'READY' },
      select: { fileKey: true, readyAt: true },
    });

    if (!registro?.fileKey) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const venceuEm =
      (registro.readyAt?.getTime() ?? 0) + DIAS_DE_VALIDADE_DO_ARQUIVO * 24 * 60 * 60 * 1000;
    if (venceuEm < Date.now()) {
      throw new HttpException(
        { code: 'EXPORT_EXPIRED', message: 'Esse arquivo expirou. Peça um novo.' },
        HttpStatus.GONE,
      );
    }

    return this.armazenamento.ler(registro.fileKey);
  }

  // -------------------------------------------------------------- excluir

  async agendarExclusao(userId: string, confirmacao: string, motivo?: string) {
    // Confirmação escrita, não um "tem certeza?": ação destrutiva pede um ato
    // deliberado (docs/08-ACESSIBILIDADE.md).
    if (confirmacao !== 'ENCERRAR') {
      throw new HttpException(erro('CONFIRMATION_MISMATCH'), HttpStatus.BAD_REQUEST);
    }

    const quando = emDias(DIAS_ATE_A_EXCLUSAO);

    const usuario = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'PENDING_DELETION', deletionAt: quando },
      select: { email: true },
    });

    if (motivo) this.logger.log('Pedido de exclusão registrado com motivo.');

    await this.email.avisar(
      usuario.email,
      'Recebemos seu pedido para encerrar a conta',
      `Seus dados serão apagados em ${quando.toLocaleDateString('pt-BR')}. Até lá, é só entrar no aplicativo para cancelar.`,
    );

    return { deletionAt: quando };
  }

  async cancelarExclusao(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', deletionAt: null },
    });
    return { status: 'ACTIVE' };
  }

  /**
   * Apaga de verdade quem passou do prazo. Roda diariamente.
   *
   * O `onDelete: Cascade` do schema leva notas, itens, listas, pontos e selos.
   * As observações de preço ficam, sem nome — ver o comentário do topo.
   */
  async apagarVencidos(): Promise<number> {
    const vencidos = await this.prisma.user.findMany({
      where: { status: 'PENDING_DELETION', deletionAt: { lte: new Date() } },
      select: { id: true },
    });

    for (const usuario of vencidos) {
      await this.prisma.user.delete({ where: { id: usuario.id } });
    }

    if (vencidos.length) this.logger.log(`${vencidos.length} conta(s) apagada(s) no prazo.`);
    return vencidos.length;
  }

  /** Apaga arquivos de exportação vencidos, e o registro deles. */
  async limparExportacoesVencidas(): Promise<number> {
    const vencidas = await this.prisma.dataExport.findMany({
      where: {
        status: 'READY',
        readyAt: { lte: emDias(-DIAS_DE_VALIDADE_DO_ARQUIVO) },
      },
      select: { id: true, fileKey: true },
    });

    for (const exportacao of vencidas) {
      if (exportacao.fileKey) {
        await this.armazenamento.apagar(exportacao.fileKey);
      }
      await this.prisma.dataExport.update({
        where: { id: exportacao.id },
        data: { status: 'EXPIRED', fileKey: null },
      });
    }

    return vencidas.length;
  }

  /**
   * Apaga a página guardada das notas que falharam, passados 30 dias.
   *
   * O prazo está em docs/09-SEGURANCA-LGPD.md: HTML bruto da nota só fica 30
   * dias, para depuração. Guardar "por via das dúvidas" é como um arquivo de
   * depuração vira um acervo de compras de gente que nunca soube que ele
   * existia.
   */
  async limparPaginasDeDepuracao(): Promise<number> {
    const antigas = await this.prisma.receipt.findMany({
      where: { rawStorageKey: { not: null }, createdAt: { lte: emDias(-30) } },
      select: { id: true, rawStorageKey: true },
    });

    for (const nota of antigas) {
      if (nota.rawStorageKey) await this.armazenamento.apagar(nota.rawStorageKey);
      await this.prisma.receipt.update({
        where: { id: nota.id },
        data: { rawStorageKey: null },
      });
    }

    return antigas.length;
  }

  // ---------------------------------------------------------------- pausa

  /**
   * Pausar: some do ranking, notificações param, a sequência congela, os dados
   * ficam intactos (docs/09-SEGURANCA-LGPD.md).
   *
   * As sessões **não** são revogadas: a pessoa precisa conseguir entrar para
   * reativar. O guard do JWT é quem barra o uso enquanto durar a pausa.
   */
  async pausar(userId: string, ate: Date | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'PAUSED', pausedUntil: ate },
    });
    return { status: 'PAUSED', pausedUntil: ate };
  }

  async reativar(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', pausedUntil: null },
    });
    return { status: 'ACTIVE' };
  }

  /** Sair de todos os aparelhos — usado ao trocar senha e na tela Segurança. */
  async sairDeTodosOsAparelhos(userId: string): Promise<void> {
    await this.sessoes.revogarTodas(userId);
  }
}
