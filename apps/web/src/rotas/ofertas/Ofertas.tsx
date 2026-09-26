import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatarCentavos } from '@gastemenos/shared';
import {
  BottomNav,
  Card,
  Chip,
  PriceDelta,
  SponsoredBanner,
  TextField,
  Toast,
} from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Ofertas.dc.html` */

interface OfertaPatrocinada {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  sponsored: true;
  sponsorName: string | null;
  product: { id: string; displayName: string } | null;
  store: { id: string; name: string } | null;
}

interface QuedaDePreco {
  productId: string;
  name: string;
  nowCents: number;
  beforeCents: number;
  dropPercent: number;
  cheapestStore: { id: string; name: string; priceCents: number } | null;
  sponsored: false;
}

const CATEGORIAS = [
  { slug: '', label: 'Tudo' },
  { slug: 'mercearia', label: 'Mercearia' },
  { slug: 'bebidas', label: 'Bebidas' },
  { slug: 'hortifruti', label: 'Hortifrúti' },
  { slug: 'limpeza', label: 'Limpeza' },
  { slug: 'higiene', label: 'Higiene' },
];

export function Ofertas(): React.ReactElement {
  const [categoria, setCategoria] = useState('');
  const [soDaMinhaLista, setSoDaMinhaLista] = useState(false);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const ofertas = useQuery({
    queryKey: ['ofertas', categoria, soDaMinhaLista, busca],
    queryFn: () => {
      const parametros = new URLSearchParams();
      if (categoria) parametros.set('category', categoria);
      if (soDaMinhaLista) parametros.set('onlyMyList', 'true');
      if (busca.trim().length >= 2) parametros.set('q', busca.trim());
      return api.get<{ sponsored: OfertaPatrocinada[]; community: QuedaDePreco[] }>(
        `/offers?${parametros.toString()}`,
      );
    },
  });

  const confirmar = useMutation({
    mutationFn: (id: string) => api.post<{ pointsAwarded: number; limitReached: boolean }>(
      `/offers/${id}/confirm`,
    ),
    onSuccess: (resultado) =>
      setAviso(
        resultado.limitReached
          ? 'Você já confirmou 5 preços hoje. Amanhã valem pontos de novo.'
          : `Obrigado! +${resultado.pointsAwarded} pontos.`,
      ),
  });

  const patrocinada = ofertas.data?.sponsored[0];
  const quedas = ofertas.data?.community ?? [];

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <p className="text-overline text-ink-muted">NA SUA REGIÃO</p>
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Ofertas
        </h1>
      </header>

      <main className="flex flex-col gap-5 px-5 pt-6">
        {/* Um filtro só, acima de tudo que ele controla. */}
        <TextField
          label="Buscar produto"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Ex.: café"
          inputMode="search"
        />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
          {CATEGORIAS.map((item) => (
            <Chip
              key={item.slug || 'tudo'}
              selected={categoria === item.slug}
              onClick={() => setCategoria(item.slug)}
            >
              {item.label}
            </Chip>
          ))}
          <Chip
            icon="cart"
            selected={soDaMinhaLista}
            onClick={() => setSoDaMinhaLista((atual) => !atual)}
          >
            Da minha lista
          </Chip>
        </div>

        {/*
          A oferta paga usa o SponsoredBanner, que traz o selo "Patrocinado"
          sem prop para desligar. Conteúdo pago se identifica como pago
          (docs/09-SEGURANCA-LGPD.md, "Transparência").
        */}
        {patrocinada ? (
          <SponsoredBanner
            title={patrocinada.title}
            description={patrocinada.description ?? undefined}
            ctaLabel={patrocinada.product ? 'Ver preços' : undefined}
            href={patrocinada.product ? `/produtos/${patrocinada.product.id}/precos` : undefined}
          />
        ) : null}

        <section aria-labelledby="baixaram">
          <h2 id="baixaram" className="mb-3 text-title-s text-ink">
            Baixaram de preço
          </h2>

          {ofertas.isError ? (
            <FalhouCarregar erro={ofertas.error} tentarDeNovo={() => void ofertas.refetch()} />
          ) : ofertas.isPending ? (
            <p role="status" className="text-body-m text-ink-muted">
              Procurando ofertas…
            </p>
          ) : quedas.length === 0 ? (
            <Card tone="sunken" className="gap-2">
              <p className="text-body-m text-ink">
                Nada baixou de preço por aqui ainda.
              </p>
              <p className="text-body-s text-ink-muted">
                Comparamos os últimos 7 dias com os 30 anteriores, na sua região. Quanto mais
                notas a comunidade lê, mais cedo a gente percebe a queda.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {quedas.map((queda) => (
                <li key={queda.productId} className="rounded-l bg-surface-raised px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/produtos/${queda.productId}/precos`}
                      className="flex-1 text-body-m text-ink underline"
                    >
                      {queda.name}
                    </Link>
                    <PriceDelta percent={-queda.dropPercent} compact />
                  </div>

                  <p className="mt-1 text-caption text-ink-muted">
                    {`${formatarCentavos(queda.nowCents)} agora · era ${formatarCentavos(queda.beforeCents)}`}
                  </p>

                  {queda.cheapestStore ? (
                    <p className="mt-1 text-caption text-ink-muted">
                      {`Mais barato no ${queda.cheapestStore.name}: ${formatarCentavos(
                        queda.cheapestStore.priceCents,
                      )}`}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {patrocinada ? (
          <button
            type="button"
            onClick={() => confirmar.mutate(patrocinada.id)}
            disabled={confirmar.isPending}
            className="min-h-touch rounded-l border-2 border-line px-4 py-3 text-body-m text-ink"
          >
            O preço está certo? Confirme e ganhe 10 pontos
          </button>
        ) : null}

        {aviso ? <Toast>{aviso}</Toast> : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="ofertas" />
      </div>
    </div>
  );
}
