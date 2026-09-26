import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, NavLink, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppearanceProvider, ProvedorDeLink, type ComponenteDeLink } from '@gastemenos/ui';
import { api, guardarAcesso, renovarSessao, temAcesso } from '../lib/api.js';
import { Entrar } from '../telas/Entrar.js';
import { Painel } from '../telas/Painel.js';
import { Catalogo } from '../telas/Catalogo.js';
import { Ofertas } from '../telas/Ofertas.js';
import { Notas } from '../telas/Notas.js';
import { Contas } from '../telas/Contas.js';
import { Auditoria } from '../telas/Auditoria.js';

/**
 * Painel: uma casca com menu e as telas dentro.
 *
 * Sem persistência de cache em disco, ao contrário do app: número de painel
 * velho é pior que número ausente, porque quem está decidindo não percebe que
 * está olhando ontem.
 */
const cliente = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 30_000, retry: 1 } },
});

const LinkDoRouter: ComponenteDeLink = ({ href, ...resto }) => <Link to={href} {...resto} />;

const ABAS = [
  { para: '/', rotulo: 'Painel' },
  { para: '/ofertas', rotulo: 'Ofertas' },
  { para: '/catalogo', rotulo: 'Catálogo' },
  { para: '/notas', rotulo: 'Notas com falha' },
  { para: '/contas', rotulo: 'Contas' },
  { para: '/auditoria', rotulo: 'Auditoria' },
];

function Casca(): React.ReactElement {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4 px-6 py-4">
          <span className="text-title-s text-ink">GasteMenos · Painel</span>
          <nav aria-label="Seções" className="flex flex-wrap gap-1">
            {ABAS.map((aba) => (
              <NavLink
                key={aba.para}
                to={aba.para}
                end={aba.para === '/'}
                className={({ isActive }) =>
                  `min-h-touch rounded-m px-3 py-2 text-body-s ${
                    isActive ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'
                  }`
                }
              >
                {aba.rotulo}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              void api.post('/auth/logout').finally(() => {
                guardarAcesso(null);
                window.location.reload();
              });
            }}
            className="ml-auto min-h-touch text-body-s text-brand underline"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

const roteador = createBrowserRouter([
  {
    path: '/',
    element: <Casca />,
    children: [
      { index: true, element: <Painel /> },
      { path: 'ofertas', element: <Ofertas /> },
      { path: 'catalogo', element: <Catalogo /> },
      { path: 'notas', element: <Notas /> },
      { path: 'contas', element: <Contas /> },
      { path: 'auditoria', element: <Auditoria /> },
    ],
  },
]);

export function App(): React.ReactElement {
  const [estado, setEstado] = useState<'carregando' | 'dentro' | 'fora'>('carregando');

  useEffect(() => {
    void renovarSessao().then(async (renovou) => {
      if (!renovou) return setEstado('fora');

      // Sessão válida não basta: o painel é só para quem tem papel de admin.
      // Quem entrar com conta comum vê a mesma tela de acesso, não um painel
      // vazio cheio de erro 403.
      try {
        const eu = await api.get<{ role?: string }>('/me');
        setEstado(eu.role === 'ADMIN' ? 'dentro' : 'fora');
      } catch {
        setEstado('fora');
      }
    });
  }, []);

  return (
    <AppearanceProvider>
      <ProvedorDeLink link={LinkDoRouter}>
        <QueryClientProvider client={cliente}>
          {estado === 'carregando' ? (
            <p role="status" className="p-8 text-body-m text-ink-muted">
              Carregando…
            </p>
          ) : estado === 'dentro' && temAcesso() ? (
            <RouterProvider router={roteador} />
          ) : (
            <Entrar aoEntrar={() => setEstado('dentro')} />
          )}
        </QueryClientProvider>
      </ProvedorDeLink>
    </AppearanceProvider>
  );
}
