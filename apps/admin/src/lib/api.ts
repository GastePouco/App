import { mensagemDoErro } from '@gastemenos/shared';

/**
 * Cliente da API para o painel.
 *
 * Mesma ideia do app: **access token em memória**, refresh no cookie httpOnly.
 * Token de admin em `localStorage` seria pior aqui do que lá — um XSS no painel
 * entrega uma sessão que enxerga dado de outras pessoas.
 *
 * Não é uma cópia do cliente do app por preguiça de extrair: aquele tem fila
 * offline, repetição e persistência em IndexedDB, que o painel não quer. Um
 * painel que finge ter dado quando está sem rede é um painel que mente para
 * quem está decidindo com ele.
 */

export class ErroDaApi extends Error {
  constructor(
    readonly code: string,
    readonly paraOUsuario: string,
    readonly status: number,
  ) {
    super(paraOUsuario);
    this.name = 'ErroDaApi';
  }
}

const BASE = '/v1';

let acesso: string | null = null;
let renovando: Promise<boolean> | null = null;

export function guardarAcesso(token: string | null): void {
  acesso = token;
}

export function temAcesso(): boolean {
  return acesso !== null;
}

export async function renovarSessao(): Promise<boolean> {
  renovando ??= (async () => {
    try {
      const resposta = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!resposta.ok) {
        acesso = null;
        return false;
      }
      const corpo = (await resposta.json()) as { access?: string };
      acesso = corpo.access ?? null;
      return acesso !== null;
    } finally {
      renovando = null;
    }
  })();

  return renovando;
}

async function chamar<T>(
  caminho: string,
  opcoes: RequestInit & { jaRenovou?: boolean } = {},
): Promise<T> {
  const { jaRenovou, ...resto } = opcoes;

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...resto,
    credentials: 'include',
    headers: {
      ...(resto.body ? { 'Content-Type': 'application/json' } : {}),
      ...(acesso ? { Authorization: `Bearer ${acesso}` } : {}),
      ...resto.headers,
    },
  });

  if (resposta.status === 401 && !jaRenovou) {
    if (await renovarSessao()) return chamar<T>(caminho, { ...opcoes, jaRenovou: true });
  }

  if (resposta.status === 204) return undefined as T;

  const corpo: unknown = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const dados = (corpo ?? {}) as { code?: string; message?: string };
    throw new ErroDaApi(
      dados.code ?? 'INTERNAL',
      dados.message ?? mensagemDoErro(dados.code ?? 'INTERNAL'),
      resposta.status,
    );
  }

  return corpo as T;
}

export const api = {
  get: <T>(caminho: string) => chamar<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    chamar<T>(caminho, { method: 'POST', body: corpo ? JSON.stringify(corpo) : undefined }),
  patch: <T>(caminho: string, corpo: unknown) =>
    chamar<T>(caminho, { method: 'PATCH', body: JSON.stringify(corpo) }),
  delete: <T>(caminho: string) => chamar<T>(caminho, { method: 'DELETE' }),
};
