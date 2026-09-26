import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, guardarAcesso, jaEntrouNesteAparelho, renovarSessao } from '../lib/api.js';

/**
 * Quem está logado.
 *
 * Ao abrir o app tentamos renovar pelo cookie httpOnly. Enquanto isso não
 * responde, `carregando` é verdadeiro e o roteador não decide nada — sem isso
 * quem recarrega a tela de dentro do app pisca no login antes de voltar.
 */

export interface Usuario {
  id: string;
  name: string;
  email: string;
  rankingName: string;
  emailVerificado: boolean;
}

interface ValorDaSessao {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  entrarComTokens: (access: string, usuario: Usuario) => void;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<ValorDaSessao | null>(null);

export function ProvedorDeSessao({ children }: { children: ReactNode }): React.ReactElement {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const buscarUsuario = useCallback(async () => {
    try {
      const eu = await api.get<Usuario & { id: string }>('/me');
      setUsuario({
        id: eu.id,
        name: eu.name,
        email: eu.email,
        rankingName: eu.rankingName,
        emailVerificado: true,
      });
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      // Quem nunca entrou neste aparelho não tem cookie para trocar: pedir
      // renovação aqui só rende um 401 no console de quem está chegando agora.
      const renovou = jaEntrouNesteAparelho() ? await renovarSessao() : false;
      if (!vivo) return;
      if (renovou) await buscarUsuario();
      if (vivo) setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [buscarUsuario]);

  const valor = useMemo<ValorDaSessao>(
    () => ({
      usuario,
      carregando,
      entrar: async (email, senha) => {
        const resposta = await api.post<{ access: string; user: Usuario }>('/auth/login', {
          email,
          password: senha,
        });
        guardarAcesso(resposta.access);
        setUsuario(resposta.user);
      },
      entrarComTokens: (access, novoUsuario) => {
        guardarAcesso(access);
        setUsuario(novoUsuario);
      },
      sair: async () => {
        // Mesmo se a chamada falhar, esquecemos a sessão aqui: a pessoa pediu
        // para sair, e deixá-la logada seria pior do que um cookie órfão.
        await api.post('/auth/logout').catch(() => undefined);
        guardarAcesso(null);
        setUsuario(null);
      },
      recarregar: buscarUsuario,
    }),
    [buscarUsuario, carregando, usuario],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ValorDaSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro do ProvedorDeSessao');
  return contexto;
}

/** Envolve as rotas do app. Manda para o login quem não está logado. */
export function ExigeSessao({ children }: { children: ReactNode }): React.ReactElement {
  const { usuario, carregando } = useSessao();
  const local = useLocation();

  if (carregando) {
    return (
      <p role="status" className="m-5 text-body-m text-ink-muted">
        Carregando…
      </p>
    );
  }

  // `state` guarda de onde a pessoa veio, para voltar ao lugar certo depois.
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;

  return <>{children}</>;
}
