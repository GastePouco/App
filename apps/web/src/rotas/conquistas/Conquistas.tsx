import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BottomNav, Button, Card, Chip, Icon, LevelRing, ProgressBar } from '@gastemenos/ui';
import { nomeDoNivel } from '@gastemenos/shared';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/Conquistas.dc.html` */

interface Selo {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  unlocked: boolean;
}

interface Situacao {
  level: number;
  levelName: string;
  points: number;
  levelTarget: number;
  pointsToNext: number;
  progress: number;
}

type Filtro = 'todos' | 'conquistados' | 'faltam';

const COMO_GANHAR = [
  { icone: 'scan', texto: 'Ler uma nota fiscal', pontos: 60 },
  { icone: 'plus', texto: 'Primeira compra num mercado novo', pontos: 20 },
  { icone: 'flame', texto: 'Uma semana com pelo menos uma nota', pontos: 40 },
  { icone: 'check', texto: 'Confirmar o preço de uma oferta', pontos: 10 },
  { icone: 'share', texto: 'Amigo convidado que lê a primeira nota', pontos: 100 },
] as const;

export function Conquistas(): React.ReactElement {
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const situacao = useQuery({
    queryKey: ['jogo', 'situacao'],
    queryFn: () => api.get<Situacao>('/game/status'),
  });
  const selos = useQuery({
    queryKey: ['jogo', 'selos'],
    queryFn: () => api.get<Selo[]>('/game/badges'),
  });

  const todos = selos.data ?? [];
  const mostrados = todos.filter((selo) =>
    filtro === 'conquistados' ? selo.unlocked : filtro === 'faltam' ? !selo.unlocked : true,
  );
  const conquistados = todos.filter((selo) => selo.unlocked).length;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <p className="text-overline text-ink-muted">SUAS CONQUISTAS</p>
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Nível e selos
        </h1>
      </header>

      <main className="flex flex-col gap-6 px-5 pt-6">
        {situacao.data ? (
          <Card className="flex-row items-center gap-4">
            <LevelRing
              level={situacao.data.level}
              progress={situacao.data.progress / 100}
              size={88}
            />
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-title-s text-ink">{situacao.data.levelName}</span>
              <ProgressBar
                value={situacao.data.progress / 100}
                label={`Pontos até o nível ${situacao.data.level + 1}`}
              />
              <span className="text-body-s text-ink-muted">
                {`${situacao.data.points} de ${situacao.data.levelTarget} pontos · faltam ${situacao.data.pointsToNext}`}
              </span>
            </div>
          </Card>
        ) : null}

        {/* Trilha de níveis: mostra de onde veio e para onde vai. */}
        {situacao.data ? (
          <section aria-labelledby="trilha">
            <h2 id="trilha" className="mb-3 text-title-s text-ink">
              Sua trilha
            </h2>
            {/* A rolagem fica no contêiner, não na lista: quem rola precisa
                receber foco (senão o teclado não alcança os níveis fora da
                tela), e o `ol` precisa continuar sendo lista para os `li`
                serem anunciados como itens. */}
            <div
              tabIndex={0}
              role="region"
              aria-label="Trilha de níveis"
              className="overflow-x-auto pb-2"
            >
            <ol className="flex gap-2">
              {[-1, 0, 1, 2].map((passo) => {
                const nivel = situacao.data!.level + passo;
                if (nivel < 1) return null;
                const atual = passo === 0;

                return (
                  <li
                    key={nivel}
                    aria-current={atual ? 'step' : undefined}
                    className={`flex min-w-[116px] flex-col gap-1 rounded-l px-4 py-3 ${
                      atual ? 'bg-brand text-on-brand' : 'bg-surface-sunken text-ink'
                    }`}
                  >
                    <span className="text-overline opacity-80">{`NÍVEL ${nivel}`}</span>
                    <span className="text-label">{nomeDoNivel(nivel)}</span>
                    {atual ? <span className="text-caption opacity-80">você está aqui</span> : null}
                  </li>
                );
              })}
            </ol>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="selos">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="selos" className="text-title-s text-ink">
              Selos
            </h2>
            <span className="text-body-s text-ink-muted">{`${conquistados} de ${todos.length}`}</span>
          </div>

          <div className="mb-3 flex gap-2" role="group" aria-label="Filtrar selos">
            <Chip selected={filtro === 'todos'} onClick={() => setFiltro('todos')}>
              Todos
            </Chip>
            <Chip selected={filtro === 'conquistados'} onClick={() => setFiltro('conquistados')}>
              Conquistados
            </Chip>
            <Chip selected={filtro === 'faltam'} onClick={() => setFiltro('faltam')}>
              Faltam
            </Chip>
          </div>

          {selos.isError ? (
            <FalhouCarregar erro={selos.error} tentarDeNovo={() => void selos.refetch()} />
          ) : selos.isPending ? (
            <p role="status" className="text-body-m text-ink-muted">
              Carregando…
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {mostrados.map((selo) => (
                <li
                  key={selo.id}
                  className={`flex flex-col gap-2 rounded-l px-4 py-4 ${
                    selo.unlocked ? 'bg-brand-soft' : 'bg-surface-sunken'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-m ${
                      selo.unlocked ? 'bg-brand text-on-brand' : 'bg-surface-raised text-ink-muted'
                    }`}
                  >
                    <Icon name={selo.unlocked ? 'star' : 'lock'} size={20} />
                  </span>

                  <span className="text-label text-ink">{selo.name}</span>
                  <span className="text-caption text-ink-muted">{selo.description}</span>

                  {/*
                    Conquistado leva a palavra, não só a cor do cartão
                    (docs/08-ACESSIBILIDADE.md). O progresso vai escrito para
                    quem ainda não conquistou.
                  */}
                  {selo.unlocked ? (
                    <span className="flex items-center gap-1 text-caption text-success">
                      <Icon name="check" size={14} />
                      Conquistado
                    </span>
                  ) : (
                    <span className="text-caption text-ink-muted tabular-nums">
                      {`${selo.progress}/${selo.target}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="como-ganhar">
          <h2 id="como-ganhar" className="mb-3 text-title-s text-ink">
            Como ganhar pontos
          </h2>
          <ul className="flex flex-col gap-2">
            {COMO_GANHAR.map((linha) => (
              <li
                key={linha.texto}
                className="flex items-center gap-3 rounded-l bg-surface-raised px-4 py-3"
              >
                <Icon name={linha.icone} size={20} />
                <span className="flex-1 text-body-m text-ink">{linha.texto}</span>
                <span className="text-label text-points-ink">{`+${linha.pontos}`}</span>
              </li>
            ))}
          </ul>
        </section>

        <Button fullWidth icon="share" href="/compartilhar">
          Compartilhar minhas conquistas
        </Button>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="ranking" />
      </div>
    </div>
  );
}
