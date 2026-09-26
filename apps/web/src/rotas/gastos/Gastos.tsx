import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatarCentavos } from '@gastemenos/shared';
import {
  BottomNav,
  Card,
  DonutChart,
  IconButton,
  SegmentedControl,
  WeeklyBars,
} from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import type { ResumoDeGastos } from '../inicio/Inicio.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Gastos.dc.html` */

type Periodo = 'month' | '3months' | 'year';

interface Categoria {
  slug: string;
  name: string;
  totalCents: number;
  percent: number;
}

interface Semana {
  label: string;
  totalCents: number;
}

interface Destaques {
  topProduct: { name: string; totalCents: number; vezes: number } | null;
  aboveRegionAverage: Array<{ name: string; percent: number }>;
}

const PERIODOS = [
  { value: 'month', label: 'Mês' },
  { value: '3months', label: '3 meses' },
  { value: 'year', label: 'Ano' },
];

export function Gastos(): React.ReactElement {
  // O período é estado de tela, não da URL: a pessoa alterna entre os três o
  // tempo todo, e encher o histórico do navegador com isso atrapalharia o
  // botão voltar.
  const [periodo, setPeriodo] = useState<Periodo>('month');

  const resumo = useQuery({
    queryKey: ['gastos', 'resumo', periodo],
    queryFn: () => api.get<ResumoDeGastos>(`/spending/summary?period=${periodo}`),
  });
  const categorias = useQuery({
    queryKey: ['gastos', 'categorias', periodo],
    queryFn: () => api.get<Categoria[]>(`/spending/categories?period=${periodo}`),
  });
  const semanas = useQuery({
    queryKey: ['gastos', 'semanas'],
    queryFn: () => api.get<Semana[]>('/spending/weeks'),
    enabled: periodo === 'month',
  });
  const destaques = useQuery({
    queryKey: ['gastos', 'destaques'],
    queryFn: () => api.get<Destaques>('/spending/insights'),
    enabled: periodo === 'month',
  });

  const variacao = resumo.data?.changePercent;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="flex items-center gap-3 px-5 pt-6">
        <IconButton icon="back" label="Voltar" href="/inicio" />
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Seus gastos
        </h1>
      </header>

      <main className="flex flex-col gap-6 px-5 pt-6">
        {/* O resumo sustenta a tela: sem ele, gráfico e destaques não têm o que
            comparar. Falhou, a pessoa vê o motivo e um caminho de volta. */}
        {resumo.isError ? (
          <FalhouCarregar erro={resumo.error} tentarDeNovo={() => void resumo.refetch()} />
        ) : null}
        {/* Um filtro só, acima de tudo que ele controla. */}
        <SegmentedControl
          label="Período dos gastos"
          value={periodo}
          options={PERIODOS}
          onChange={(valor) => setPeriodo(valor as Periodo)}
        />

        <Card tone="brand">
          <span className="text-overline">
            {(resumo.data?.label ?? 'Total').toUpperCase()}
          </span>
          <span className="text-money-xl">{formatarCentavos(resumo.data?.totalCents ?? 0)}</span>
          {variacao !== null && variacao !== undefined ? (
            <span className="text-body-s opacity-80">
              {variacao === 0
                ? 'Mesmo valor do período anterior'
                : `${Math.abs(variacao)}% ${variacao < 0 ? 'menos' : 'mais'} que o período anterior`}
            </span>
          ) : (
            <span className="text-body-s opacity-80">
              Ainda não há período anterior para comparar.
            </span>
          )}
        </Card>

        <section aria-labelledby="por-categoria">
          <h2 id="por-categoria" className="mb-4 text-title-s text-ink">
            Onde o dinheiro foi
          </h2>
          {categorias.isPending ? (
            <p role="status" className="text-body-s text-ink-muted">
              Carregando…
            </p>
          ) : (
            <DonutChart
              fatias={(categorias.data ?? []).map((categoria) => ({
                id: categoria.slug,
                label: categoria.name,
                valor: categoria.totalCents,
              }))}
              formatarValor={formatarCentavos}
            />
          )}
        </section>

        {periodo === 'month' ? (
          <section aria-labelledby="por-semana">
            <h2 id="por-semana" className="mb-4 text-title-s text-ink">
              Por semana
            </h2>
            {semanas.isPending ? (
              <p role="status" className="text-body-s text-ink-muted">
                Carregando…
              </p>
            ) : (
              <WeeklyBars
                titulo="Gasto por semana do mês"
                barras={(semanas.data ?? []).map((semana) => ({
                  label: semana.label,
                  valor: semana.totalCents,
                }))}
                formatarValor={formatarCentavos}
              />
            )}
          </section>
        ) : null}

        {periodo === 'month' && destaques.data?.topProduct ? (
          <section aria-labelledby="destaque">
            <h2 id="destaque" className="mb-3 text-title-s text-ink">
              O que mais pesou
            </h2>
            <Card tone="sunken" className="gap-1">
              <span className="text-title-s text-ink">{destaques.data.topProduct.name}</span>
              <span className="text-body-m text-ink-muted">
                {`${formatarCentavos(destaques.data.topProduct.totalCents)} no mês, em ${destaques.data.topProduct.vezes} ${
                  destaques.data.topProduct.vezes === 1 ? 'compra' : 'compras'
                }`}
              </span>
            </Card>

            {destaques.data.aboveRegionAverage.length > 0 ? (
              <>
                <h3 className="mb-2 mt-4 text-label text-ink">Você pagou acima da média em</h3>
                <ul className="flex flex-col gap-2">
                  {destaques.data.aboveRegionAverage.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between rounded-l bg-surface-raised px-4 py-3 text-body-m text-ink"
                    >
                      <span>{item.name}</span>
                      <span className="text-offer-ink">{`↑ ${item.percent}% acima`}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="gastos" />
      </div>
    </div>
  );
}
