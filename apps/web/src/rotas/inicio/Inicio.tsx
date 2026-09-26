import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatarCentavos, partirCentavos } from '@gastemenos/shared';
import {
  BottomNav,
  Button,
  Card,
  Icon,
  IconButton,
  LevelRing,
  ListRow,
  ProgressBar,
  useAparencia,
} from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { InicioFacil } from './InicioFacil.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/**
 * `referencia/telas/Main.dc.html`
 *
 * No modo fácil esta rota renderiza a variante `InicioFacil` — é a mesma rota,
 * porque a preferência é da pessoa e não um lugar diferente do app
 * (docs/05-TELAS-E-ROTAS.md).
 */

export interface ResumoDeGastos {
  label: string;
  totalCents: number;
  changePercent: number | null;
  budgetCents: number | null;
  remainingCents: number | null;
}

export interface SituacaoDoJogo {
  name: string;
  level: number;
  levelName: string;
  points: number;
  levelTarget: number;
  progress: number;
  streakWeeks: number;
}

interface NotaResumida {
  id: string;
  storeName: string;
  issuedAt: string;
  totalCents: number;
  itemCount: number;
}

export function Inicio(): React.ReactElement {
  const { modoFacil } = useAparencia();

  const eu = useQuery({ queryKey: ['me'], queryFn: () => api.get<SituacaoDoJogo>('/me') });
  const gastos = useQuery({
    queryKey: ['gastos', 'resumo', 'month'],
    queryFn: () => api.get<ResumoDeGastos>('/spending/summary?period=month'),
  });
  const notas = useQuery({
    queryKey: ['notas', 'ultimas'],
    queryFn: () => api.get<NotaResumida[]>('/receipts?limit=2'),
  });

  if (modoFacil) return <InicioFacil resumo={gastos.data ?? null} />;

  const nome = eu.data?.name?.split(' ')[0] ?? '';
  const resumo = gastos.data;
  const dinheiro = partirCentavos(resumo?.totalCents ?? 0);

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <p className="text-overline text-ink-muted">SEU MÊS</p>
          <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
            {nome ? `Olá, ${nome}` : 'Início'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton icon="bell" label="Notificações" href="/notificacoes" />
          <IconButton icon="user" label="Meu perfil" href="/perfil" />
        </div>
      </header>

      <main className="flex flex-col gap-4 px-5 pt-6">
        <Card tone="brand">
          <span className="text-overline">{(resumo?.label ?? 'Total do mês').toUpperCase()}</span>

          {/* Reais grandes, centavos menores — como no cartão da tela. */}
          <p className="flex items-baseline gap-0.5">
            <span className="text-title-m">R$&nbsp;</span>
            <span className="text-money-xl">{dinheiro.reais}</span>
            <span className="text-title-m">,{dinheiro.centavos}</span>
          </p>

          {resumo?.budgetCents ? (
            <>
              <ProgressBar
                value={resumo.totalCents / resumo.budgetCents}
                label={`Gasto do mês contra o orçamento de ${formatarCentavos(resumo.budgetCents)}`}
                tone="lime"
                onDark
              />
              <p className="text-body-s opacity-80">
                {resumo.remainingCents !== null && resumo.remainingCents >= 0
                  ? `Ainda cabem ${formatarCentavos(resumo.remainingCents)} no mês.`
                  : `Passou ${formatarCentavos(Math.abs(resumo.remainingCents ?? 0))} do orçamento.`}
              </p>
            </>
          ) : null}
        </Card>

        {eu.data ? (
          <Card className="flex-row items-center gap-4">
            <LevelRing level={eu.data.level} progress={eu.data.progress / 100} />
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-title-s text-ink">{eu.data.levelName}</span>
              <span className="text-body-s text-ink-muted">
                {`Faltam ${eu.data.levelTarget - eu.data.points} pontos para o próximo nível.`}
              </span>
              {eu.data.streakWeeks > 0 ? (
                <span className="flex items-center gap-1 text-label text-success">
                  <Icon name="flame" size={16} />
                  {`${eu.data.streakWeeks} semanas seguidas`}
                </span>
              ) : null}
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button href="/ler-nota" icon="scan" fullWidth>
            Ler nota
          </Button>
          <Button href="/lista" icon="cart" variant="secondary" fullWidth>
            Minha lista
          </Button>
        </div>

        <section aria-labelledby="ultimas">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="ultimas" className="text-title-s text-ink">
              Últimas notas
            </h2>
            <Link to="/gastos" className="text-label text-brand underline">
              Ver gastos
            </Link>
          </div>

          {notas.isError ? (
            <FalhouCarregar erro={notas.error} tentarDeNovo={() => void notas.refetch()} />
          ) : notas.isPending ? (
            <p role="status" className="text-body-s text-ink-muted">
              Carregando…
            </p>
          ) : notas.data?.length ? (
            <div className="overflow-hidden rounded-l">
              {notas.data.map((nota) => (
                <ListRow
                  key={nota.id}
                  icon="receipt"
                  iconTone="brand"
                  title={nota.storeName}
                  subtitle={`${new Date(nota.issuedAt).toLocaleDateString('pt-BR')} · ${nota.itemCount} itens`}
                  trailing={<span>{formatarCentavos(nota.totalCents)}</span>}
                  href={`/notas/${nota.id}`}
                />
              ))}
            </div>
          ) : (
            <Card tone="sunken" className="items-start gap-3">
              <p className="text-body-m text-ink">
                Você ainda não leu nenhuma nota. Leia a primeira e seus gastos aparecem aqui.
              </p>
              <Button href="/ler-nota" icon="scan" size="m">
                Ler nota
              </Button>
            </Card>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="inicio" />
      </div>
    </div>
  );
}
