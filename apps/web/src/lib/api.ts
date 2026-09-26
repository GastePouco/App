import { mensagemDoErro } from '@gastemenos/shared';

/**
 * Cliente da API.
 *
 * Três decisões que valem explicar:
 *
 * 1. **O access token vive em memória**, não em localStorage. Token em
 *    localStorage é legível por qualquer script da página, então um XSS vira
 *    roubo de sessão. Em memória ele some ao recarregar — e é o cookie
 *    httpOnly de refresh que devolve a sessão, sem nunca passar pelo
 *    JavaScript (docs/09-SEGURANCA-LGPD.md).
 *
 * 2. **Um 401 dispara uma renovação e repete a chamada, uma vez só.** O access
 *    dura 15 minutos; sem isso a pessoa cairia para a tela de login no meio de
 *    uma compra.
 *
 * 3. **Chamadas simultâneas compartilham a mesma renovação.** O refresh é
 *    rotativo: duas renovações em paralelo queimariam o token uma da outra e
 *    a API derrubaria a sessão inteira por suspeita de reutilização.
 *
 * Todo erro sai daqui como `ErroDaApi`, com uma frase pronta em português —
 * nenhuma tela deve inventar texto de erro.
 */

export class ErroDaApi extends Error {
  constructor(
    readonly code: string,
    readonly paraOUsuario: string,
    readonly status: number,
    /** Mensagens campo a campo, quando a API recusa a validação. */
    readonly detalhes?: string[],
  ) {
    super(paraOUsuario);
    this.name = 'ErroDaApi';
  }
}

const BASE = '/v1';

let acessoAtual: string | null = null;
let renovacaoEmAndamento: Promise<boolean> | null = null;

/**
 * Existe sessão neste aparelho?
 *
 * Quem responde é um cookie **sem segredo** que a API grava junto com o
 * refresh (`gm_sessao`). Serve só para não pedir renovação a quem nunca
 * entrou — sem isso, toda primeira visita começa com um 401 no console, que
 * polui o monitoramento.
 *
 * Já foi uma marca em `localStorage`, escrita pelo javascript ao guardar o
 * token, e isso **quebrou o login com Google**: ali a sessão nasce no servidor,
 * no callback, sem nenhum javascript do app ter rodado antes. A pessoa
 * escolhia a conta, voltava com o cookie de sessão válido no navegador — e caía
 * na tela de login. Quem grava a marca tem de ser quem cria a sessão.
 */
export function jaEntrouNesteAparelho(): boolean {
  try {
    return document.cookie.split('; ').some((c) => c.startsWith('gm_sessao='));
  } catch {
    // Sem acesso a cookie o app tenta renovar assim mesmo: melhor um 401 no
    // console do que alguém preso fora da própria conta.
    return true;
  }
}

export function guardarAcesso(token: string | null): void {
  acessoAtual = token;
}

export function temAcesso(): boolean {
  return acessoAtual !== null;
}

/** Troca o cookie de refresh por um access novo. Diz se conseguiu. */
export async function renovarSessao(): Promise<boolean> {
  renovacaoEmAndamento ??= (async () => {
    try {
      const resposta = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!resposta.ok) {
        acessoAtual = null;
        return false;
      }
      const corpo = (await resposta.json()) as { access?: string };
      acessoAtual = corpo.access ?? null;
      return acessoAtual !== null;
    } catch {
      return false;
    } finally {
      renovacaoEmAndamento = null;
    }
  })();

  return renovacaoEmAndamento;
}

interface Opcoes extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Uso interno: impede laço infinito de renovação. */
  jaTentouRenovar?: boolean;
}

export async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { body, jaTentouRenovar, headers, ...resto } = opcoes;

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      ...resto,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(acessoAtual ? { Authorization: `Bearer ${acessoAtual}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Falha de rede não tem corpo para ler: é o caso "sem conexão".
    throw new ErroDaApi('OFFLINE', mensagemDoErro('OFFLINE'), 0);
  }

  if (resposta.status === 401 && !jaTentouRenovar) {
    if (await renovarSessao()) {
      return chamar<T>(caminho, { ...opcoes, jaTentouRenovar: true });
    }
  }

  if (resposta.status === 204) return undefined as T;

  const corpo: unknown = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const dados = (corpo ?? {}) as { code?: string; details?: string[] };
    throw new ErroDaApi(
      typeof dados.code === 'string' ? dados.code : 'INTERNAL',
      mensagemDoErro(corpo ?? 'INTERNAL'),
      resposta.status,
      dados.details,
    );
  }

  return corpo as T;
}

/**
 * Baixa um arquivo da API **com o token**, e entrega como download.
 *
 * Um `<a href>` simples não serve: o access token vai no cabeçalho
 * `Authorization`, que uma navegação do navegador não manda. O link parecia
 * funcionar e respondia 401 — e a "correção" tentadora seria abrir o endereço
 * sem autenticação, o que colocaria o arquivo com o histórico de compras de
 * alguém a um id de distância de qualquer pessoa.
 */
export async function baixarArquivo(caminho: string, nomeDoArquivo: string): Promise<void> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    credentials: 'include',
    headers: acessoAtual ? { Authorization: `Bearer ${acessoAtual}` } : {},
  });

  if (resposta.status === 401 && (await renovarSessao())) {
    return baixarArquivo(caminho, nomeDoArquivo);
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { code?: string } | null;
    throw new ErroDaApi(corpo?.code ?? 'INTERNAL', mensagemDoErro(corpo?.code ?? 'INTERNAL'), resposta.status);
  }

  const endereco = URL.createObjectURL(await resposta.blob());
  try {
    const ancora = document.createElement('a');
    ancora.href = endereco;
    ancora.download = nomeDoArquivo;
    ancora.click();
  } finally {
    // Sem isto o blob fica na memória da aba até fechar — e ele é o arquivo
    // inteiro de dados da pessoa.
    URL.revokeObjectURL(endereco);
  }
}

export const api = {
  get: <T>(caminho: string) => chamar<T>(caminho),
  post: <T>(caminho: string, body?: unknown) => chamar<T>(caminho, { method: 'POST', body }),
  put: <T>(caminho: string, body?: unknown) => chamar<T>(caminho, { method: 'PUT', body }),
  patch: <T>(caminho: string, body?: unknown) => chamar<T>(caminho, { method: 'PATCH', body }),
  delete: <T>(caminho: string) => chamar<T>(caminho, { method: 'DELETE' }),
};
