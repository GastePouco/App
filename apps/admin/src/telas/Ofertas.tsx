import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField } from '@gastemenos/ui';
import { ErroDaApi, api } from '../lib/api.js';

interface Oferta {
  id: string;
  title: string;
  sponsored: boolean;
  priceCents: number | null;
  geohashes: string[];
  startsAt: string;
  endsAt: string;
  impressions: number;
  clicks: number;
  confirmations: number;
  partner: { id: string; name: string } | null;
}

interface Parceiro {
  id: string;
  name: string;
  cnpj: string | null;
  active: boolean;
  _count: { offers: number };
}

/**
 * Ofertas e parceiros.
 *
 * Note o que **não** existe nesta tela: uma caixinha "patrocinada". Com
 * parceiro, a oferta nasce patrocinada e a tela do app é obrigada a mostrar o
 * selo. Deixar isso como escolha de quem cadastra é exatamente como um selo
 * obrigatório deixa de ser marcado na prática.
 */
export function Ofertas(): React.ReactElement {
  const fila = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState('');
  const [parceiroId, setParceiroId] = useState('');
  const [preco, setPreco] = useState('');
  const [regioes, setRegioes] = useState('6vjyq');
  const [comeca, setComeca] = useState(new Date().toISOString().slice(0, 10));
  const [termina, setTermina] = useState(
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  );

  const [nomeDoParceiro, setNomeDoParceiro] = useState('');

  const ofertas = useQuery({
    queryKey: ['ofertas-admin'],
    queryFn: () => api.get<Oferta[]>('/admin/offers'),
  });
  const parceiros = useQuery({
    queryKey: ['parceiros'],
    queryFn: () => api.get<Parceiro[]>('/admin/partners'),
  });

  const criarParceiro = useMutation({
    mutationFn: () => api.post('/admin/partners', { name: nomeDoParceiro }),
    onSuccess: async () => {
      setNomeDoParceiro('');
      await fila.invalidateQueries({ queryKey: ['parceiros'] });
    },
  });

  const criar = useMutation({
    mutationFn: () =>
      api.post('/admin/offers', {
        title: titulo,
        ...(parceiroId ? { partnerId: parceiroId } : {}),
        ...(preco ? { priceCents: Math.round(Number(preco.replace(',', '.')) * 100) } : {}),
        geohashes: regioes
          .split(',')
          .map((regiao) => regiao.trim())
          .filter(Boolean),
        startsAt: new Date(`${comeca}T00:00:00.000Z`).toISOString(),
        endsAt: new Date(`${termina}T23:59:59.000Z`).toISOString(),
      }),
    onSuccess: async () => {
      setTitulo('');
      setPreco('');
      setErro(null);
      await fila.invalidateQueries({ queryKey: ['ofertas-admin'] });
    },
    onError: (falha) =>
      setErro(falha instanceof ErroDaApi ? falha.paraOUsuario : 'Não foi possível criar.'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/offers/${id}`),
    onSuccess: () => fila.invalidateQueries({ queryKey: ['ofertas-admin'] }),
  });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="nova">
        <h1 id="nova" className="mb-4 text-title-m text-ink">
          Nova oferta
        </h1>

        <Card className="gap-4">
          <TextField
            label="Título"
            hint="É o que a pessoa lê na tela de ofertas."
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
          />

          <label className="flex flex-col gap-1 text-label text-ink">
            Parceiro
            <select
              value={parceiroId}
              onChange={(evento) => setParceiroId(evento.target.value)}
              className="min-h-touch rounded-m border border-line bg-surface px-3 text-body-m text-ink"
            >
              <option value="">Sem parceiro (oferta da comunidade)</option>
              {(parceiros.data ?? []).map((parceiro) => (
                <option key={parceiro.id} value={parceiro.id}>
                  {parceiro.name}
                </option>
              ))}
            </select>
            <span className="text-caption text-ink-muted">
              Com parceiro, a oferta sai marcada como patrocinada. Não é opcional.
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Preço (R$)"
              inputMode="decimal"
              optional
              value={preco}
              onChange={(evento) => setPreco(evento.target.value)}
            />
            <TextField
              label="Regiões (geohash, separadas por vírgula)"
              value={regioes}
              onChange={(evento) => setRegioes(evento.target.value)}
            />
            <TextField
              label="Começa em"
              type="date"
              value={comeca}
              onChange={(evento) => setComeca(evento.target.value)}
            />
            <TextField
              label="Termina em"
              type="date"
              value={termina}
              onChange={(evento) => setTermina(evento.target.value)}
            />
          </div>

          {erro ? (
            <p role="alert" className="rounded-m bg-offer-soft px-4 py-3 text-body-s text-offer-ink">
              {erro}
            </p>
          ) : null}

          <Button disabled={!titulo || criar.isPending} onClick={() => criar.mutate()}>
            {criar.isPending ? 'Criando…' : 'Criar oferta'}
          </Button>
        </Card>
      </section>

      <section aria-labelledby="no-ar">
        <h2 id="no-ar" className="mb-4 text-title-m text-ink">
          Ofertas
        </h2>

        <ul className="flex flex-col gap-2">
          {(ofertas.data ?? []).map((oferta) => (
            <li key={oferta.id}>
              <Card className="gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body-l text-ink">
                    {oferta.title}
                    {oferta.sponsored ? (
                      <span className="ml-2 rounded-s bg-offer-soft px-2 py-1 text-caption text-offer-ink">
                        Patrocinado
                      </span>
                    ) : null}
                  </span>
                  <span className="text-caption text-ink-muted">
                    {`${oferta.impressions} vistas · ${oferta.clicks} cliques · ${oferta.confirmations} confirmações`}
                  </span>
                </div>

                <span className="text-caption text-ink-muted">
                  {`${new Date(oferta.startsAt).toLocaleDateString('pt-BR')} a ${new Date(
                    oferta.endsAt,
                  ).toLocaleDateString('pt-BR')} · ${oferta.geohashes.join(', ')}`}
                  {oferta.partner ? ` · ${oferta.partner.name}` : ''}
                </span>

                <div>
                  <Button
                    size="m"
                    variant="ghost"
                    disabled={excluir.isPending}
                    onClick={() => excluir.mutate(oferta.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="parceiros">
        <h2 id="parceiros" className="mb-4 text-title-m text-ink">
          Parceiros
        </h2>

        <Card className="gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Nome do parceiro"
              className="flex-1"
              value={nomeDoParceiro}
              onChange={(evento) => setNomeDoParceiro(evento.target.value)}
            />
            <Button
              size="m"
              disabled={!nomeDoParceiro || criarParceiro.isPending}
              onClick={() => criarParceiro.mutate()}
            >
              Cadastrar
            </Button>
          </div>

          <ul className="flex flex-col gap-1">
            {(parceiros.data ?? []).map((parceiro) => (
              <li key={parceiro.id} className="flex justify-between text-body-s text-ink">
                <span>{parceiro.name}</span>
                <span className="text-ink-muted">{`${parceiro._count.offers} ofertas`}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
