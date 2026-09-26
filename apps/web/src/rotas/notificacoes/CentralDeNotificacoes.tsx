import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BottomNav, Card, Chip, Icon, IconButton } from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/** `referencia/telas/CentralNotificacoes.dc.html` */

type Aba = 'all' | 'prices' | 'game';

interface Notificacao {
  id: string;
  type: string;
  title: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

const ICONE: Record<string, 'tag' | 'trophy' | 'flame' | 'bell' | 'shield'> = {
  PRICE_DROP: 'tag',
  LIST_OFFER: 'tag',
  SPONSORED: 'tag',
  RANKING: 'trophy',
  LEVEL_UP: 'trophy',
  STREAK_RISK: 'flame',
  ACCOUNT: 'shield',
};

/**
 * Agrupa em "Hoje", "Esta semana" e "Antes".
 *
 * O agrupamento acontece **aqui**, não na API: só o navegador conhece o fuso
 * de quem está lendo. Uma notificação das 23h em Brasília é "hoje" para a
 * pessoa e "amanhã" para o servidor em UTC.
 */
function agrupar(itens: Notificacao[]): Array<[string, Notificacao[]]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const semana = new Date(hoje.getTime() - 6 * 86_400_000);

  const grupos: Record<string, Notificacao[]> = { Hoje: [], 'Esta semana': [], Antes: [] };

  for (const item of itens) {
    const quando = new Date(item.createdAt);
    if (quando >= hoje) grupos.Hoje!.push(item);
    else if (quando >= semana) grupos['Esta semana']!.push(item);
    else grupos.Antes!.push(item);
  }

  return Object.entries(grupos).filter(([, lista]) => lista.length > 0);
}

export function CentralDeNotificacoes(): React.ReactElement {
  const fila = useQueryClient();
  const [aba, setAba] = useState<Aba>('all');

  const notificacoes = useQuery({
    queryKey: ['notificacoes', aba],
    queryFn: () =>
      api.get<{ items: Notificacao[]; unreadCount: number }>(`/notifications?type=${aba}`),
  });

  const lerTodas = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => fila.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const ler = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => fila.invalidateQueries({ queryKey: ['notificacoes'] }),
  });

  const itens = notificacoes.data?.items ?? [];
  const naoLidas = notificacoes.data?.unreadCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="flex items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-3">
          <IconButton icon="back" label="Voltar" href="/inicio" />
          <h1 tabIndex={-1} className="text-title-m text-ink outline-none">
            Notificações
          </h1>
        </div>
        <IconButton icon="bell" label="Ajustar notificações" href="/perfil/notificacoes" />
      </header>

      <main className="flex flex-col gap-4 px-5 pt-6">
        <div className="flex gap-2" role="group" aria-label="Filtrar notificações">
          <Chip selected={aba === 'all'} onClick={() => setAba('all')}>
            Todas
          </Chip>
          <Chip selected={aba === 'prices'} onClick={() => setAba('prices')}>
            Preços
          </Chip>
          <Chip selected={aba === 'game'} onClick={() => setAba('game')}>
            Jogo
          </Chip>
        </div>

        {naoLidas > 0 ? (
          <button
            type="button"
            onClick={() => lerTodas.mutate()}
            className="min-h-touch self-start text-label text-brand underline"
          >
            {`Marcar as ${naoLidas} como lidas`}
          </button>
        ) : null}

        {notificacoes.isError ? (
            <FalhouCarregar erro={notificacoes.error} tentarDeNovo={() => void notificacoes.refetch()} />
          ) : notificacoes.isPending ? (
          <p role="status" className="text-body-m text-ink-muted">
            Carregando…
          </p>
        ) : itens.length === 0 ? (
          <Card tone="sunken" className="gap-2">
            <p className="text-body-l text-ink">Nada por aqui ainda.</p>
            <p className="text-body-s text-ink-muted">
              Quando um preço baixar ou você subir no ranking, a gente avisa.
            </p>
          </Card>
        ) : (
          agrupar(itens).map(([grupo, lista]) => (
            <section key={grupo} aria-labelledby={`grupo-${grupo}`}>
              <h2 id={`grupo-${grupo}`} className="mb-2 text-label text-ink-muted">
                {grupo}
              </h2>
              <ul className="flex flex-col gap-2">
                {lista.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      onClick={() => !item.readAt && ler.mutate(item.id)}
                      className={`flex items-start gap-3 rounded-l px-4 py-3 ${
                        item.readAt ? 'bg-surface-raised' : 'bg-brand-soft'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-ink">
                        <Icon name={ICONE[item.type] ?? 'bell'} size={20} />
                      </span>
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="text-body-m text-ink">{item.title}</span>
                        <span className="text-caption text-ink-muted">
                          {new Date(item.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      {/* Não lida leva palavra, não só o fundo colorido. */}
                      {!item.readAt ? <span className="gm-sr">Não lida</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="inicio" />
      </div>
    </div>
  );
}
