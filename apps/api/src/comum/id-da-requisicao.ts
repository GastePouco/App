import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Dá um identificador a cada requisição e o devolve no cabeçalho.
 *
 * É o que liga a frase que a pessoa vê na tela à linha no log do servidor. Sem
 * ele, "deu erro ao salvar ontem à tarde" vira caça a agulha em palheiro; com
 * ele, a pessoa lê um código curto e quem está de plantão acha a requisição
 * exata.
 *
 * Aceita o id que vier do proxy (`x-request-id`), para a mesma requisição ter
 * um só identificador atravessando Coolify, API e worker — mas **limita o
 * formato**, senão vira um campo de texto livre de fora indo parar no log.
 */
export const CABECALHO_DO_ID = 'x-request-id';

export interface ComId {
  idDaRequisicao?: string;
}

function limpo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const so = valor.trim().slice(0, 64);
  return /^[A-Za-z0-9._-]+$/.test(so) ? so : null;
}

export function idDaRequisicao(req: Request & ComId, res: Response, next: NextFunction): void {
  const id = limpo(req.headers[CABECALHO_DO_ID]) ?? randomUUID();

  req.idDaRequisicao = id;
  res.setHeader(CABECALHO_DO_ID, id);

  next();
}

/**
 * Esconde e-mail e chave de nota antes de escrever no log.
 *
 * O log guarda o caminho da requisição, e caminho carrega dado: o e-mail vai
 * na query da rota de desenvolvimento, a chave de 44 dígitos identifica uma
 * compra. Nenhum dos dois precisa estar no log para depurar — precisa estar o
 * suficiente para saber **qual rota** falhou (docs/09-SEGURANCA-LGPD.md).
 */
export function semDadoPessoal(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .replace(/\b\d{44}\b/g, '[chave]')
    .replace(/\b\d{11}\b/g, '[documento]');
}
