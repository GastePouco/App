import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { Link, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppearanceProvider, ProvedorDeLink, type ComponenteDeLink } from '@gastemenos/ui';
import { ProvedorDeSessao } from './sessao.js';
import { AvisosDoApp } from './AvisosDoApp.js';
import { rotas } from './rotas.js';

/**
 * Raiz do app: providers e roteador.
 *
 * O AppearanceProvider precisa envolver tudo porque escreve tema, tamanho de
 * texto e movimento reduzido no `<html>` — e a preferência salva é aplicada
 * antes do primeiro desenho, para a tela não piscar em claro antes de virar
 * escura.
 */
const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // O app abre offline mostrando o que já estava salvo; recarregar a cada
      // foco brigaria com isso e gastaria dados de quem está no 4G.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      // Precisa cobrir o maxAge do persistidor: com o padrão de 5 min, o
      // cache seria descartado da memória antes de virar útil offline.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (tentativa, erro) => {
        // Não insistir em erro de regra (400/401/403/404): só em falha de rede.
        const status = (erro as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return tentativa < 2;
      },
    },
  },
});

/**
 * Cache no IndexedDB: o Início precisa abrir sem rede mostrando o que já
 * estava salvo (docs/02-ARQUITETURA.md). `localStorage` não serviria — é
 * síncrono, trava a thread e tem cota pequena demais para um mês de notas.
 */
const persistidor = createAsyncStoragePersister({
  storage: {
    getItem: (chave) => get(chave).then((valor) => (valor as string) ?? null),
    setItem: (chave, valor) => set(chave, valor),
    removeItem: (chave) => del(chave),
  },
  key: 'gastemenos:cache',
});

const roteador = createBrowserRouter(rotas);

/** Liga o `href` do design system ao React Router: navega sem recarregar. */
const LinkDoRouter: ComponenteDeLink = ({ href, ...resto }) => <Link to={href} {...resto} />;

export function App(): React.ReactElement {
  return (
    <AppearanceProvider>
      <ProvedorDeLink link={LinkDoRouter}>
        <PersistQueryClientProvider
          client={cliente}
          persistOptions={{
            persister: persistidor,
            // Uma semana: passado disso, dado velho engana mais do que ajuda.
            maxAge: 7 * 24 * 60 * 60 * 1000,
          }}
        >
          <ProvedorDeSessao>
            <RouterProvider router={roteador} />
            <AvisosDoApp />
          </ProvedorDeSessao>
        </PersistQueryClientProvider>
      </ProvedorDeLink>
    </AppearanceProvider>
  );
}
