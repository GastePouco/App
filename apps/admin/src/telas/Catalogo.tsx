import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField } from '@gastemenos/ui';
import { api } from '../lib/api.js';

interface ParaRevisar {
  id: string;
  displayName: string;
  gtin: string | null;
  categoria: string | null;
  observacoes: number;
  motivos: string[];
}

interface Duplicado {
  assinatura: string;
  produtos: Array<{ id: string; displayName: string; gtin: string | null; observacoes: number }>;
}

const CATEGORIAS = [
  'mercearia',
  'bebidas',
  'hortifruti',
  'laticinios',
  'carnes',
  'limpeza',
  'higiene',
  'padaria',
  'outros',
];

/**
 * Catálogo: fila de revisão e prováveis duplicados.
 *
 * É a tela que mais muda o que o app mostra. Produto separado em dois faz a
 * média da região ser calculada sobre metade das notas — com cara de certeza.
 */
export function Catalogo(): React.ReactElement {
  const fila = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');

  const revisar = useQuery({
    queryKey: ['revisar'],
    queryFn: () => api.get<ParaRevisar[]>('/admin/products/review?limit=100'),
  });
  const duplicados = useQuery({
    queryKey: ['duplicados'],
    queryFn: () => api.get<Duplicado[]>('/admin/products/duplicates'),
  });

  const corrigir = useMutation({
    mutationFn: (dados: { id: string; displayName?: string; categorySlug?: string }) =>
      api.patch(`/admin/products/${dados.id}`, {
        ...(dados.displayName ? { displayName: dados.displayName } : {}),
        ...(dados.categorySlug ? { categorySlug: dados.categorySlug } : {}),
      }),
    onSuccess: async () => {
      setEditando(null);
      await fila.invalidateQueries({ queryKey: ['revisar'] });
    },
  });

  const fundir = useMutation({
    mutationFn: (dados: { para: string; de: string }) =>
      api.post(`/admin/products/${dados.para}/merge`, { fromId: dados.de }),
    onSuccess: async () => {
      await Promise.all([
        fila.invalidateQueries({ queryKey: ['duplicados'] }),
        fila.invalidateQueries({ queryKey: ['revisar'] }),
      ]);
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="revisao">
        <h1 id="revisao" className="mb-1 text-title-m text-ink">
          Fila de revisão
        </h1>
        <p className="mb-4 text-body-s text-ink-muted">
          Ordenada por quantas observações de preço dependem do produto: corrigir o de 300 conserta
          300 números.
        </p>

        {revisar.isPending ? (
          <p role="status" className="text-body-m text-ink-muted">
            Carregando…
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(revisar.data ?? []).map((produto) => (
              <li key={produto.id}>
                <Card className="gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-body-l text-ink">{produto.displayName}</span>
                    <span className="text-caption text-ink-muted">
                      {`${produto.observacoes} observações · ${produto.motivos.join(', ')}`}
                    </span>
                  </div>

                  {editando === produto.id ? (
                    <div className="flex flex-col gap-3">
                      <TextField
                        label="Nome do produto"
                        value={nome}
                        onChange={(evento) => setNome(evento.target.value)}
                      />

                      <label className="flex flex-col gap-1 text-label text-ink">
                        Categoria
                        <select
                          value={categoria}
                          onChange={(evento) => setCategoria(evento.target.value)}
                          className="min-h-touch rounded-m border border-line bg-surface px-3 text-body-m text-ink"
                        >
                          <option value="">(manter)</option>
                          {CATEGORIAS.map((slug) => (
                            <option key={slug} value={slug}>
                              {slug}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex gap-2">
                        <Button
                          size="m"
                          disabled={corrigir.isPending}
                          onClick={() =>
                            corrigir.mutate({
                              id: produto.id,
                              displayName: nome || undefined,
                              categorySlug: categoria || undefined,
                            })
                          }
                        >
                          Salvar
                        </Button>
                        <Button size="m" variant="ghost" onClick={() => setEditando(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        size="m"
                        variant="secondary"
                        onClick={() => {
                          setEditando(produto.id);
                          setNome(produto.displayName);
                          setCategoria(produto.categoria ?? '');
                        }}
                      >
                        Corrigir
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="duplicados">
        <h2 id="duplicados" className="mb-1 text-title-m text-ink">
          Prováveis duplicados
        </h2>
        <p className="mb-4 text-body-s text-ink-muted">
          Fundir não tem desfazer: o produto absorvido deixa de existir e tudo passa para o outro.
          Separar depois é fácil; desfazer uma fusão errada, não.
        </p>

        <ul className="flex flex-col gap-3">
          {(duplicados.data ?? []).map((grupo) => (
            <li key={grupo.assinatura}>
              <Card className="gap-3">
                <span className="text-label text-ink-muted">{grupo.assinatura}</span>

                <ul className="flex flex-col gap-2">
                  {grupo.produtos.map((produto, indice) => (
                    <li
                      key={produto.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-body-m text-ink">
                        {produto.displayName}
                        <span className="text-caption text-ink-muted">
                          {` · ${produto.observacoes} obs.${produto.gtin ? ` · ${produto.gtin}` : ''}`}
                        </span>
                      </span>

                      {indice > 0 ? (
                        <Button
                          size="m"
                          variant="secondary"
                          disabled={fundir.isPending}
                          onClick={() =>
                            fundir.mutate({ para: grupo.produtos[0]!.id, de: produto.id })
                          }
                        >
                          {`Fundir em "${grupo.produtos[0]!.displayName}"`}
                        </Button>
                      ) : (
                        <span className="text-caption text-ink-muted">principal</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
