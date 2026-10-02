import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatarCentavos } from '@gastemenos/shared';
import { BottomNav, Button, Card, Chip, Icon, SegmentedControl } from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Ranking.dc.html` */

type Escopo = 'friends' | 'region';
type Categoria = 'savings' | 'purchases' | 'points';

interface Linha {
  userId: string;
  rank: number;
  name: string;
  level: number;
  value: number;
  isMe: boolean;
  /** Comprou o selo de apoiador com o saldo de recompensa. Só enfeite. */
  supporter?: boolean;
}

/**
 * Selo de apoiador.
 *
 * Leva texto, não só a estrela: quem usa leitor de tela precisa ouvir
 * "apoiador" (docs/08-ACESSIBILIDADE.md), e quem não distingue a cor da
 * estrela também. `title` serve ao mouse, o texto escondido serve ao resto.
 */
function SeloDeApoiador(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 text-points-ink" title="Apoiador">
      <Icon name="star" size={14} />
      <span className="sr-only">Apoiador</span>
    </span>
  );
}

interface RankingDaApi {
  podium: Linha[];
  rows: Linha[];
  me: Linha | null;
}

const CATEGORIAS = [
  { value: 'savings', label: 'Mais economizou' },
  { value: 'purchases', label: 'Mais compras' },
  { value: 'points', label: 'Mais pontos' },
];

function formatarValor(categoria: Categoria, valor: number): string {
  if (categoria === 'savings') return formatarCentavos(valor);
  if (categoria === 'purchases') return `${valor} ${valor === 1 ? 'compra' : 'compras'}`;
  return `${valor.toLocaleString('pt-BR')} pontos`;
}

/** Pódio: 2º, 1º, 3º, como se lê num pódio de verdade. */
function Podio({
  linhas,
  categoria,
}: {
  linhas: Linha[];
  categoria: Categoria;
}): React.ReactElement | null {
  if (linhas.length === 0) return null;

  const ordem = [linhas[1], linhas[0], linhas[2]].filter(Boolean) as Linha[];
  const alturas: Record<number, string> = { 1: 'h-20', 2: 'h-14', 3: 'h-11' };

  return (
    <ol className="flex items-end justify-center gap-3" aria-label="Pódio do mês">
      {ordem.map((linha) => (
        <li key={linha.userId} className="flex flex-1 flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-soft text-title-s text-success">
            {linha.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex items-center justify-center gap-1 text-center text-caption text-ink">
            {linha.name}
            {linha.supporter ? <SeloDeApoiador /> : null}
          </span>
          <span className="text-center text-label text-ink">
            {formatarValor(categoria, linha.value)}
          </span>
          <div
            aria-hidden="true"
            className={`w-full rounded-t-m ${alturas[linha.rank] ?? 'h-10'} ${
              linha.isMe ? 'bg-brand' : 'bg-surface-sunken'
            }`}
          />
          {/* O lugar vai escrito, não só na altura da barra. */}
          <span className="text-label text-ink-muted">{`${linha.rank}º`}</span>
        </li>
      ))}
    </ol>
  );
}

export function Ranking(): React.ReactElement {
  const [escopo, setEscopo] = useState<Escopo>('friends');
  const [categoria, setCategoria] = useState<Categoria>('savings');

  const ranking = useQuery({
    queryKey: ['ranking', escopo, categoria],
    queryFn: () =>
      api.get<RankingDaApi>(`/game/ranking?scope=${escopo}&category=${categoria}`),
  });

  const convite = useQuery({
    queryKey: ['convite'],
    queryFn: () => api.get<{ inviteCode: string }>('/game/share-card'),
  });

  const dados = ranking.data;
  const foraDoPodio = dados?.rows ?? [];
  const euForaDoPodio = dados?.me && dados.me.rank > 3 ? dados.me : null;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <p className="text-overline text-ink-muted">ESTE MÊS</p>
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Ranking
        </h1>
      </header>

      <main className="flex flex-col gap-5 px-5 pt-6">
        <div className="flex gap-2" role="group" aria-label="Quem entra no ranking">
          <Chip selected={escopo === 'friends'} onClick={() => setEscopo('friends')}>
            Amigos
          </Chip>
          <Chip selected={escopo === 'region'} onClick={() => setEscopo('region')}>
            Minha região
          </Chip>
        </div>

        <SegmentedControl
          label="Categoria do ranking"
          value={categoria}
          options={CATEGORIAS}
          onChange={(valor) => setCategoria(valor as Categoria)}
        />

        {ranking.isError ? (
            <FalhouCarregar erro={ranking.error} tentarDeNovo={() => void ranking.refetch()} />
          ) : ranking.isPending ? (
          <p role="status" className="text-body-m text-ink-muted">
            Carregando o ranking…
          </p>
        ) : !dados || dados.podium.length === 0 ? (
          <Card tone="sunken" className="gap-3">
            <p className="text-body-l text-ink">
              {escopo === 'friends'
                ? 'Você ainda não tem amigos por aqui.'
                : 'Ainda não há gente suficiente na sua região.'}
            </p>
            <p className="text-body-s text-ink-muted">
              {escopo === 'friends'
                ? 'Convide alguém com o seu código e disputem quem economiza mais.'
                : 'Conforme mais vizinhos lerem notas, o ranking da região aparece aqui.'}
            </p>
          </Card>
        ) : (
          <>
            <Podio linhas={dados.podium} categoria={categoria} />

            {foraDoPodio.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {foraDoPodio.map((linha) => (
                  <li
                    key={linha.userId}
                    className={`flex items-center gap-3 rounded-l px-4 py-3 ${
                      linha.isMe ? 'bg-brand-soft' : 'bg-surface-raised'
                    }`}
                  >
                    <span className="w-8 shrink-0 tabular-nums text-label text-ink-muted">
                      {`${linha.rank}º`}
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="flex items-center gap-1 text-body-m text-ink">
                        {linha.isMe ? `${linha.name} (você)` : linha.name}
                        {linha.supporter ? <SeloDeApoiador /> : null}
                      </span>
                      <span className="text-caption text-ink-muted">{`Nível ${linha.level}`}</span>
                    </span>
                    <span className="tabular-nums text-body-m font-bold text-ink">
                      {formatarValor(categoria, linha.value)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            {/* Quem está longe do topo continua se vendo na tela. */}
            {euForaDoPodio && !foraDoPodio.some((linha) => linha.isMe) ? (
              <Card tone="soft" className="flex-row items-center gap-3">
                <span className="tabular-nums text-label text-ink">{`${euForaDoPodio.rank}º`}</span>
                <span className="flex-1 text-body-m text-ink">Você</span>
                <span className="tabular-nums text-body-m font-bold text-ink">
                  {formatarValor(categoria, euForaDoPodio.value)}
                </span>
              </Card>
            ) : null}
          </>
        )}

        <Card className="gap-3">
          <h2 className="text-title-s text-ink">Chame alguém para a disputa</h2>
          <p className="text-body-s text-ink-muted">
            Quem entrar com o seu código vira seu amigo aqui. Quando essa pessoa ler a primeira
            nota, você ganha 100 pontos.
          </p>
          {convite.data ? (
            <p className="rounded-m bg-surface-sunken px-4 py-3 text-center text-title-s tracking-widest text-ink">
              {convite.data.inviteCode}
            </p>
          ) : null}
          <Button fullWidth icon="share" href="/compartilhar">
            Compartilhar
          </Button>
        </Card>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="ranking" />
      </div>
    </div>
  );
}
