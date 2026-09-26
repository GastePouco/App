import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { formatarCentavos, variacaoPercentual } from '@gastemenos/shared';
import {
  BottomNav,
  Button,
  Card,
  IconButton,
  ListRow,
  PriceDelta,
  PriceHistoryChart,
  SegmentedControl,
  StatTile,
  Toast,
} from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Precos.dc.html` */

type Janela = '30d' | '6m' | '1y';

interface Historico {
  points: Array<{ period: string; avgCents: number; minCents: number; maxCents: number }>;
  userPaidCents: number | null;
  todayAvgCents: number | null;
  peakCents: number | null;
  enoughData: boolean;
}

interface LojaBarata {
  storeId: string;
  name: string;
  address: string | null;
  priceCents: number;
  updatedAt: string;
}

const JANELAS = [
  { value: '30d', label: '30 dias' },
  { value: '6m', label: '6 meses' },
  { value: '1y', label: '1 ano' },
];

export function Precos(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const fila = useQueryClient();

  const [janela, setJanela] = useState<Janela>('6m');
  const [aviso, setAviso] = useState<string | null>(null);

  const produto = useQuery({
    queryKey: ['produto', id],
    queryFn: () => api.get<{ id: string; displayName: string }>(`/products/${id}`),
    enabled: Boolean(id),
    // O endpoint de produto isolado ainda não existe; o nome vem do histórico.
    retry: false,
  });

  const historico = useQuery({
    queryKey: ['precos', id, janela],
    queryFn: () => api.get<Historico>(`/products/${id}/prices?range=${janela}`),
    enabled: Boolean(id),
  });

  const lojas = useQuery({
    queryKey: ['precos', id, 'lojas'],
    queryFn: () => api.get<LojaBarata[]>(`/products/${id}/stores`),
    enabled: Boolean(id),
  });

  const criarAlerta = useMutation({
    mutationFn: () => api.post(`/products/${id}/alert`, {}),
    onSuccess: () => {
      setAviso('Pronto. Avisamos quando esse produto ficar mais barato na sua região.');
      void fila.invalidateQueries({ queryKey: ['precos', id] });
    },
  });

  const paraALista = useMutation({
    mutationFn: () =>
      api.post('/lists/current/items', {
        productId: id,
        label: produto.data?.displayName ?? 'Produto',
        quantity: 1,
      }),
    onSuccess: () => setAviso('Item acrescentado à sua lista.'),
  });

  const nome = produto.data?.displayName ?? 'Produto';
  const dados = historico.data;

  const diferenca =
    dados?.userPaidCents && dados.todayAvgCents
      ? variacaoPercentual(dados.userPaidCents, dados.todayAvgCents)
      : null;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="flex items-center gap-3 px-5 pt-6">
        <IconButton icon="back" label="Voltar" onClick={() => navegar(-1)} />
        <h1 tabIndex={-1} className="flex-1 text-title-m text-ink outline-none">
          {nome}
        </h1>
      </header>

      <main className="flex flex-col gap-6 px-5 pt-6">
        {historico.isError ? (
          <FalhouCarregar erro={historico.error} tentarDeNovo={() => void historico.refetch()} />
        ) : null}
        <SegmentedControl
          label="Período do histórico"
          value={janela}
          options={JANELAS}
          onChange={(valor) => setJanela(valor as Janela)}
        />

        {historico.isPending ? (
          <p role="status" className="text-body-m text-ink-muted">
            Carregando o histórico…
          </p>
        ) : !dados?.enoughData ? (
          /*
            Região sem dados tem mensagem própria, não gráfico vazio: a pessoa
            precisa entender que o app não sabe ainda, e que ela pode mudar isso
            (docs/05-TELAS-E-ROTAS.md, "Estados que toda tela precisa ter").
          */
          <Card tone="sunken" className="gap-3">
            <p className="text-body-l text-ink">Ainda juntando preços desta região.</p>
            <p className="text-body-s text-ink-muted">
              Mostramos o preço médio quando tivermos notas suficientes de pessoas diferentes —
              é assim que ninguém é identificado. Cada nota lida ajuda.
            </p>
            <Button href="/ler-nota" icon="scan" size="m">
              Ler uma nota
            </Button>
          </Card>
        ) : (
          <>
            <div className="flex gap-3">
              <StatTile
                label="Média hoje"
                value={formatarCentavos(dados.todayAvgCents ?? 0)}
                tone="soft"
              />
              {dados.userPaidCents ? (
                <StatTile label="Você pagou" value={formatarCentavos(dados.userPaidCents)} />
              ) : null}
            </div>

            {diferenca !== null ? <PriceDelta percent={diferenca} /> : null}

            <PriceHistoryChart
              pontos={dados.points}
              pagoCentavos={dados.userPaidCents}
              formatarValor={formatarCentavos}
              nomeDoProduto={nome}
            />
          </>
        )}

        {lojas.data && lojas.data.length > 0 ? (
          <section aria-labelledby="mais-baratas">
            <h2 id="mais-baratas" className="mb-3 text-title-s text-ink">
              Onde está mais barato
            </h2>
            <div className="overflow-hidden rounded-l">
              {lojas.data.map((loja, indice) => (
                <ListRow
                  key={loja.storeId}
                  icon="pin"
                  iconTone={indice === 0 ? 'brand' : 'neutral'}
                  title={loja.name}
                  subtitle={
                    loja.address ??
                    `Atualizado ${new Date(loja.updatedAt).toLocaleDateString('pt-BR')}`
                  }
                  trailing={<span>{formatarCentavos(loja.priceCents)}</span>}
                />
              ))}
            </div>
          </section>
        ) : null}

        {aviso ? <Toast>{aviso}</Toast> : null}

        <div className="flex flex-col gap-3">
          <Button fullWidth icon="cart" onClick={() => paraALista.mutate()}>
            Adicionar à minha lista
          </Button>
          <Button
            variant="secondary"
            fullWidth
            icon="bell"
            onClick={() => criarAlerta.mutate()}
            disabled={criarAlerta.isPending}
          >
            Avisar quando baixar
          </Button>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="gastos" />
      </div>
    </div>
  );
}
