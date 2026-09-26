import { useQuery } from '@tanstack/react-query';
import { Card, StatTile, WeeklyBars } from '@gastemenos/ui';
import { api } from '../lib/api.js';

interface Metricas {
  pessoas: { total: number; pausadas: number; encerrando: number };
  notas: { porEstado: Record<string, number>; noMes: number; taxaDeSucesso: number | null };
  precos: { observacoes: number; contribuintesNaSemana: number };
  catalogo: { produtos: number; semGtin: number; lojas: number };
  ofertas: { noAr: number };
  serie: Array<{ dia: string; lidas: number; falhas: number }>;
}

const NOME_DO_ESTADO: Record<string, string> = {
  DONE: 'Lidas',
  PENDING: 'Na fila',
  PARSE_FAILED: 'Não interpretadas',
  PORTAL_UNAVAILABLE: 'Portal fora',
  NEEDS_QR: 'Precisam do QR',
  REJECTED: 'Recusadas',
};

/**
 * O painel responde três perguntas, nesta ordem: a leitura está funcionando, a
 * base de preços está viva, e o catálogo está limpo.
 *
 * Nenhum número aqui identifica pessoa — é contagem agregada. Quem precisa
 * achar alguém usa a busca em Contas, que fica registrada.
 */
export function Painel(): React.ReactElement {
  const metricas = useQuery({
    queryKey: ['metricas'],
    queryFn: () => api.get<Metricas>('/admin/metrics'),
  });

  if (metricas.isPending) {
    return (
      <p role="status" className="text-body-m text-ink-muted">
        Carregando os números…
      </p>
    );
  }

  if (metricas.isError || !metricas.data) {
    return (
      <Card tone="offer" role="alert">
        <p className="text-body-m text-ink">Não foi possível carregar o painel.</p>
      </Card>
    );
  }

  const dados = metricas.data;
  // O componente veio da tela de gastos e fala em centavos; aqui o valor é
  // contagem de notas, então o formatador troca "R$" por "nota(s)".
  const ultimosDias = dados.serie.slice(-7).map((dia) => ({
    label: dia.dia.slice(8, 10),
    valor: dia.lidas,
  }));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="leitura">
        <h1 id="leitura" className="mb-4 text-title-m text-ink">
          Leitura de notas
        </h1>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Notas nos 30 dias" value={String(dados.notas.noMes)} />
          <StatTile
            label="Sucesso na leitura (meta 90%)"
            value={dados.notas.taxaDeSucesso === null ? '—' : `${dados.notas.taxaDeSucesso}%`}
          />
          <StatTile label="Contribuintes na semana" value={String(dados.precos.contribuintesNaSemana)} />
          <StatTile label="Observações de preço" value={String(dados.precos.observacoes)} />
        </div>

        <Card className="mt-4 gap-3">
          <WeeklyBars
            titulo="Notas lidas por dia"
            destaqueDoMaior="dia com mais leituras"
            barras={ultimosDias}
            formatarValor={(quantas) => `${quantas} nota${quantas === 1 ? '' : 's'}`}
          />
        </Card>

        <Card className="mt-4 gap-2">
          <span className="text-label text-ink-muted">Por estado</span>
          <ul className="flex flex-col gap-1">
            {Object.entries(dados.notas.porEstado).map(([estado, quantas]) => (
              <li key={estado} className="flex justify-between text-body-s text-ink">
                <span>{NOME_DO_ESTADO[estado] ?? estado}</span>
                <span>{quantas}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="catalogo-e-contas">
        <h2 id="catalogo-e-contas" className="mb-4 text-title-m text-ink">
          Catálogo e contas
        </h2>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Produtos" value={String(dados.catalogo.produtos)} />
          <StatTile label="Sem GTIN (fila de revisão)" value={String(dados.catalogo.semGtin)} />
          <StatTile label="Lojas" value={String(dados.catalogo.lojas)} />
          <StatTile label="Ofertas no ar" value={String(dados.ofertas.noAr)} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Contas" value={String(dados.pessoas.total)} />
          <StatTile label="Pausadas" value={String(dados.pessoas.pausadas)} />
          <StatTile label="Encerrando (carência de 30 dias)" value={String(dados.pessoas.encerrando)} />
        </div>
      </section>
    </div>
  );
}
