import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarCentavos } from '@gastemenos/shared';
import { BottomNav, Button, Card, Icon, StatTile, TextField } from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Lista.dc.html` */

interface ItemDaLista {
  id: string;
  productId: string | null;
  label: string;
  quantity: number;
  unit: string;
  estimatedCents: number | null;
  checked: boolean;
  suggested: boolean;
}

interface ListaAtual {
  id: string;
  items: ItemDaLista[];
  estimatedCents: number;
  checkedCount: number;
  cheapestStore: {
    storeId: string;
    name: string;
    totalCents: number;
    coveredItems: number;
    totalItems: number;
  } | null;
}

interface Sugestao {
  productId: string;
  label: string;
  estimatedCents: number;
  reason: string;
}

export function Lista(): React.ReactElement {
  const fila = useQueryClient();
  const [novo, setNovo] = useState('');

  const lista = useQuery({
    queryKey: ['lista'],
    queryFn: () => api.get<ListaAtual>('/lists/current'),
  });
  const sugestoes = useQuery({
    queryKey: ['lista', 'sugestoes'],
    queryFn: () => api.get<Sugestao[]>('/lists/current/suggestions'),
  });

  const atualizar = (): Promise<unknown> => fila.invalidateQueries({ queryKey: ['lista'] });

  const marcar = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      api.patch(`/lists/current/items/${id}`, { checked }),
    onSuccess: atualizar,
  });

  const acrescentar = useMutation({
    mutationFn: (dados: { label: string; productId?: string }) =>
      api.post('/lists/current/items', { ...dados, quantity: 1 }),
    onSuccess: async () => {
      setNovo('');
      await atualizar();
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/lists/current/items/${id}`),
    onSuccess: atualizar,
  });

  const dados = lista.data;
  const itens = dados?.items ?? [];
  const faltam = itens.filter((item) => !item.checked);

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <p className="text-overline text-ink-muted">PARA COMPRAR</p>
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Minha lista
        </h1>
      </header>

      <main className="flex flex-col gap-5 px-5 pt-6">
        <div className="flex gap-3">
          <StatTile
            label="Estimativa"
            value={formatarCentavos(dados?.estimatedCents ?? 0)}
            tone="soft"
          />
          <StatTile
            label="Faltam"
            value={`${faltam.length} ${faltam.length === 1 ? 'item' : 'itens'}`}
          />
        </div>

        {dados?.cheapestStore ? (
          <Card tone="soft" className="gap-1">
            <span className="text-label text-ink">Onde sai mais barato</span>
            <span className="text-title-s text-ink">{dados.cheapestStore.name}</span>
            <span className="text-body-s text-ink-muted">
              {`${formatarCentavos(dados.cheapestStore.totalCents)} pela lista`}
              {dados.cheapestStore.coveredItems < dados.cheapestStore.totalItems
                ? ` · preço de ${dados.cheapestStore.coveredItems} dos ${dados.cheapestStore.totalItems} itens`
                : ''}
            </span>
          </Card>
        ) : null}

        {/* Acrescentar fica no topo: é a ação mais repetida na tela. */}
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (novo.trim()) acrescentar.mutate({ label: novo.trim() });
          }}
          className="flex items-end gap-2"
        >
          <TextField
            label="Acrescentar item"
            value={novo}
            onChange={(evento) => setNovo(evento.target.value)}
            placeholder="Ex.: café, arroz, detergente"
            className="flex-1"
          />
          <Button type="submit" size="m" icon="plus" disabled={!novo.trim()}>
            Pôr
          </Button>
        </form>

        <section aria-labelledby="itens">
          <h2 id="itens" className="mb-3 text-title-s text-ink">
            {`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
          </h2>

          {lista.isError ? (
            <FalhouCarregar erro={lista.error} tentarDeNovo={() => void lista.refetch()} />
          ) : lista.isPending ? (
            <p role="status" className="text-body-m text-ink-muted">
              Carregando…
            </p>
          ) : itens.length === 0 ? (
            <Card tone="sunken" className="gap-3">
              <p className="text-body-m text-ink">
                Sua lista está vazia. Leia uma nota e o app aprende o que você compra sempre.
              </p>
              <Button href="/ler-nota" icon="scan" size="m">
                Ler nota
              </Button>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {itens.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-l bg-surface-raised px-4 py-3"
                >
                  {/*
                    Checkbox nativo: dá foco, espaço e leitura corretos de graça.
                    O item marcado leva risco E o visto — nunca só a cor
                    (docs/08-ACESSIBILIDADE.md).
                  */}
                  <label className="flex min-h-touch flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(evento) =>
                        marcar.mutate({ id: item.id, checked: evento.target.checked })
                      }
                      className="h-5 w-5 shrink-0 accent-brand"
                    />
                    <span className="flex flex-1 flex-col">
                      <span
                        className={`text-body-m ${
                          item.checked ? 'text-ink-muted line-through' : 'text-ink'
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="text-caption text-ink-muted">
                        {`${item.quantity} ${item.unit}`}
                        {item.estimatedCents
                          ? ` · ${formatarCentavos(item.estimatedCents)}`
                          : ''}
                        {item.suggested ? ' · sugerido' : ''}
                      </span>
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => remover.mutate(item.id)}
                    aria-label={`Tirar ${item.label} da lista`}
                    className="flex h-touch w-touch items-center justify-center rounded-m text-ink-muted"
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sugestoes.data && sugestoes.data.length > 0 ? (
          <section aria-labelledby="sugestoes">
            <h2 id="sugestoes" className="mb-3 text-title-s text-ink">
              Talvez esteja acabando
            </h2>
            <ul className="flex flex-col gap-2">
              {sugestoes.data.map((sugestao) => (
                <li
                  key={sugestao.productId}
                  className="flex items-center gap-3 rounded-l bg-surface-sunken px-4 py-3"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="text-body-m text-ink">{sugestao.label}</span>
                    <span className="text-caption text-ink-muted">{sugestao.reason}</span>
                  </span>
                  <Button
                    size="m"
                    variant="secondary"
                    icon="plus"
                    onClick={() =>
                      acrescentar.mutate({
                        label: sugestao.label,
                        productId: sugestao.productId,
                      })
                    }
                  >
                    Pôr
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="lista" />
      </div>
    </div>
  );
}
