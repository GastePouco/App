import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { erro } from '@gastemenos/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PontosService } from '../jogo/pontos.service.js';
import type { PerfilDeConsumoDto } from './dto/conta.dto.js';

/**
 * Persona e orçamento sugerido a partir das 5 respostas.
 *
 * A faixa de gasto declarada vira o orçamento inicial. É um chute informado,
 * não uma promessa: a tela PerfilPronto mostra "Ajustar" ao lado, e depois de
 * algumas notas o número real substitui o palpite.
 */
const ORCAMENTO_POR_FAIXA: Record<string, number> = {
  a: 60_000, // até R$ 600
  b: 100_000, // R$ 600 a 1.000
  c: 160_000, // R$ 1.000 a 2.000
  d: 250_000, // acima de R$ 2.000
};

function definirPersona(dados: PerfilDeConsumoDto): string {
  const casaGrande = dados.householdSize === '3' || dados.householdSize === '5';
  const buscaPreco = dados.priorities.includes('preco') || dados.priorities.includes('promo');
  const compraNoAtacado = dados.storeTypes.includes('atac');

  if (casaGrande && buscaPreco) return 'Família Planejadora';
  if (casaGrande && compraNoAtacado) return 'Família do Atacado';
  if (!casaGrande && dados.frequency === 'falta') return 'Compra do Dia a Dia';
  if (buscaPreco) return 'Caçador de Preço';
  return 'Compra Tranquila';
}

@Injectable()
export class ContaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pontos: PontosService,
  ) {}

  async resumo(userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        rankingName: true,
        avatarUrl: true,
        cep: true,
        inviteCode: true,
        role: true,
        status: true,
        pausedUntil: true,
        deletionAt: true,
        profile: { select: { persona: true, budgetCents: true } },
      },
    });

    if (!usuario) throw new HttpException(erro('NOT_FOUND'), HttpStatus.NOT_FOUND);

    const pontosTotais = await this.pontos.total(userId);
    const nivel = await this.pontos.situacao(userId);
    const sequencia = await this.sequenciaDeSemanas(userId);

    return {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      rankingName: usuario.rankingName,
      // O papel vem no próprio `/me` porque o painel precisa saber, na
      // abertura, se esta conta entra. Saber o próprio papel não expõe nada:
      // quem decide o que ele permite é o servidor, a cada requisição.
      role: usuario.role,
      avatarUrl: usuario.avatarUrl,
      cep: usuario.cep,
      inviteCode: usuario.inviteCode,
      status: usuario.status,
      pausedUntil: usuario.pausedUntil,
      deletionAt: usuario.deletionAt,
      persona: usuario.profile?.persona ?? null,
      budgetCents: usuario.profile?.budgetCents ?? null,
      level: nivel.nivel,
      levelName: nivel.nome,
      points: nivel.pontosNoNivel,
      pointsTotal: pontosTotais,
      levelTarget: nivel.metaDoNivel,
      pointsToNext: nivel.pontosAteOProximo,
      progress: nivel.progresso,
      streakWeeks: sequencia,
    };
  }

  async lerPerfil(userId: string) {
    const perfil = await this.prisma.consumptionProfile.findUnique({ where: { userId } });
    if (!perfil) return null;

    return {
      householdSize: perfil.householdSize,
      storeTypes: perfil.storeTypes,
      frequency: perfil.frequency,
      monthlySpendBand: perfil.monthlySpendBand,
      priorities: perfil.priorities,
      persona: perfil.persona,
      budgetCents: perfil.budgetCents,
    };
  }

  async salvarPerfil(userId: string, dados: PerfilDeConsumoDto) {
    const persona = definirPersona(dados);
    const budgetCents = ORCAMENTO_POR_FAIXA[dados.monthlySpendBand] ?? 160_000;

    await this.prisma.consumptionProfile.upsert({
      where: { userId },
      create: { userId, ...dados, persona, budgetCents },
      // Refazer o perfil recalcula persona e orçamento, mas não devolve os
      // 100 pontos: o livro-razão barra pelo refId (PROFILE + userId).
      update: { ...dados, persona, budgetCents },
    });

    const ganhouPontos = await this.pontos.darPerfilCompleto(userId);

    return { persona, budgetCents, pointsAwarded: ganhouPontos ? 100 : 0 };
  }

  async lerPreferencias(userId: string) {
    const preferencias = await this.prisma.preferences.findUnique({ where: { userId } });
    if (preferencias) return preferencias;

    // Conta antiga sem linha de preferências: cria com os padrões em vez de
    // devolver nulo e obrigar cada tela a tratar o caso.
    return this.prisma.preferences.create({ data: { userId } });
  }

  /**
   * Semanas seguidas com pelo menos uma nota.
   *
   * Conta a partir do livro-razão (`WEEK_STREAK`), não das notas: é o crédito
   * semanal que define a sequência, e ele já respeita o fuso de Brasília e o
   * fechamento de domingo (docs/07-GAMIFICACAO.md).
   */
  private async sequenciaDeSemanas(userId: string): Promise<number> {
    const creditos = await this.prisma.pointsLedger.findMany({
      where: { userId, reason: 'WEEK_STREAK' },
      select: { refId: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    const semanas = creditos
      .map((c) => c.refId)
      .filter((r): r is string => Boolean(r))
      .sort()
      .reverse();

    if (semanas.length === 0) return 0;

    let sequencia = 1;
    for (let i = 0; i < semanas.length - 1; i++) {
      if (this.saoSemanasSeguidas(semanas[i]!, semanas[i + 1]!)) sequencia++;
      else break;
    }
    return sequencia;
  }

  /** "2026-W39" e "2026-W38" são seguidas. Vira o ano corretamente. */
  private saoSemanasSeguidas(maisNova: string, maisVelha: string): boolean {
    const ler = (chave: string): [number, number] => {
      const [ano, semana] = chave.split('-W');
      return [Number(ano), Number(semana)];
    };
    const [anoA, semanaA] = ler(maisNova);
    const [anoB, semanaB] = ler(maisVelha);

    if (anoA === anoB) return semanaA - semanaB === 1;
    // Virada de ano: semana 1 vem depois da última semana do ano anterior.
    return anoA - anoB === 1 && semanaA === 1 && semanaB >= 52;
  }
}
