import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BottomNav, Card, ListRow, SegmentedControl, useAparencia, type Tema } from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { useSessao } from '../../app/sessao.js';

/** `referencia/telas/Perfil.dc.html` */

interface Eu {
  name: string;
  email: string;
  level: number;
  levelName: string;
  status: string;
  deletionAt: string | null;
}

const TEMAS = [
  { value: 'sistema', label: 'Sistema' },
  { value: 'claro', label: 'Claro' },
  { value: 'escuro', label: 'Escuro' },
];

export function Perfil(): React.ReactElement {
  const navegar = useNavigate();
  const { sair } = useSessao();
  const aparencia = useAparencia();

  const eu = useQuery({ queryKey: ['me'], queryFn: () => api.get<Eu>('/me') });

  const inicial = eu.data?.name?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Meu perfil
        </h1>
      </header>

      <main className="flex flex-col gap-5 px-5 pt-6">
        <Card className="flex-row items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-pill bg-brand text-title-l text-on-brand"
          >
            {inicial}
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-title-s text-ink">{eu.data?.name ?? '—'}</span>
            <span className="text-body-s text-ink-muted">{eu.data?.email ?? ''}</span>
            {eu.data ? (
              <span className="text-caption text-ink-muted">
                {`Nível ${eu.data.level} · ${eu.data.levelName}`}
              </span>
            ) : null}
          </span>
        </Card>

        {/*
          Conta com exclusão agendada avisa em toda visita ao perfil, com o
          caminho de volta à mão: o prazo de 30 dias só é útil se a pessoa
          lembrar que ele existe.
        */}
        {eu.data?.status === 'PENDING_DELETION' && eu.data.deletionAt ? (
          <Card tone="offer" className="gap-2">
            <p className="text-body-m text-ink">
              {`Sua conta será encerrada em ${new Date(eu.data.deletionAt).toLocaleDateString('pt-BR')}.`}
            </p>
            <button
              type="button"
              onClick={() => navegar('/perfil/encerrar')}
              className="self-start min-h-touch text-label text-brand underline"
            >
              Cancelar o encerramento
            </button>
          </Card>
        ) : null}

        <section aria-labelledby="aparencia">
          <h2 id="aparencia" className="mb-3 text-title-s text-ink">
            Aparência
          </h2>
          <SegmentedControl
            label="Tema do aplicativo"
            value={aparencia.tema === 'contraste' ? 'sistema' : aparencia.tema}
            options={TEMAS}
            onChange={(valor) => aparencia.definir({ tema: valor as Tema })}
          />
        </section>

        <section aria-labelledby="ajustes">
          <h2 id="ajustes" className="mb-3 text-title-s text-ink">
            Ajustes
          </h2>
          <div className="overflow-hidden rounded-l">
            <ListRow icon="user" title="Dados pessoais" subtitle="Nome, e-mail, CEP" chevron href="/perfil/dados" />
            <ListRow icon="lock" title="Login e segurança" subtitle="Senha e aparelhos" chevron href="/perfil/seguranca" />
            <ListRow icon="bell" title="Notificações" subtitle="O que você quer receber" chevron href="/perfil/notificacoes" />
            <ListRow icon="shield" title="Privacidade e dados" subtitle="O que é compartilhado" chevron href="/perfil/privacidade" />
            <ListRow icon="volume" title="Acessibilidade" subtitle="Letra, contraste, modo fácil" chevron href="/perfil/acessibilidade" />
            <ListRow icon="list" title="Perfil de consumo" subtitle="Refazer as 5 perguntas" chevron href="/perfil-de-consumo" />
            <ListRow icon="star" title="Conquistas" subtitle="Nível e selos" chevron href="/conquistas" />
            <ListRow icon="tag" title="Recompensas" subtitle="Saldo por notas lidas" chevron href="/recompensas" />
            <ListRow icon="help" title="Ajuda" chevron href="/ajuda" />
          </div>
        </section>

        <section aria-labelledby="conta">
          <h2 id="conta" className="mb-3 text-title-s text-ink">
            Sua conta
          </h2>
          <div className="overflow-hidden rounded-l">
            <ListRow icon="pause" title="Pausar conta" subtitle="Sumir do ranking por um tempo" chevron href="/perfil/pausar" />
            <ListRow icon="logout" title="Sair" onClick={() => void sair().then(() => navegar('/entrar'))} />
            <ListRow icon="trash" title="Encerrar conta" chevron href="/perfil/encerrar" />
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="inicio" />
      </div>
    </div>
  );
}
