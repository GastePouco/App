import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { MENSAGENS, erro } from '@gastemenos/shared';
import { semDadoPessoal, type ComId } from './id-da-requisicao.js';

/**
 * Toda resposta de erro sai como `{ code, message }`, com `message` em
 * português simples — é o contrato de docs/04-API.md e o que a tela mostra
 * direto para a pessoa.
 *
 * Dois cuidados que valem mais que o código:
 *
 * 1. Erro inesperado nunca vaza detalhe interno. O stack vai para o log, a
 *    pessoa recebe a frase genérica. Mensagem de exceção costuma conter nome
 *    de tabela, consulta ou caminho de arquivo.
 * 2. O log não recebe corpo da requisição, que é onde viajam senha, código de
 *    verificação e chave de nota (docs/09-SEGURANCA-LGPD.md).
 */
@Catch()
export class FiltroDeErros implements ExceptionFilter {
  private readonly logger = new Logger('Erro');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();
    const requisicao = contexto.getRequest<{ method?: string; url?: string } & ComId>();
    const id = requisicao?.idDaRequisicao;

    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const corpo = excecao.getResponse();
      resposta.status(status).json(this.corpoDaExcecao(corpo, status));
      return;
    }

    this.logger.error(
      `[${id ?? 'sem-id'}] ${requisicao?.method ?? '?'} ${semDadoPessoal(requisicao?.url ?? '?')} falhou`,
      excecao instanceof Error ? excecao.stack : String(excecao),
    );

    // O id vai junto na resposta: é o que a pessoa consegue copiar da tela e
    // mandar para o suporte, sem contar nada sobre a falha em si.
    resposta
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ ...erro('INTERNAL'), ...(id ? { requestId: id } : {}) });
  }

  private corpoDaExcecao(corpo: unknown, status: number): Record<string, unknown> {
    // Quem lançou já mandou { code, message }: respeita.
    if (corpo && typeof corpo === 'object' && 'code' in corpo && 'message' in corpo) {
      return corpo as Record<string, unknown>;
    }

    // ValidationPipe manda { message: string[] }. Vira VALIDATION_FAILED, com a
    // lista no campo `fields` para a tela marcar os campos errados.
    if (corpo && typeof corpo === 'object' && Array.isArray((corpo as { message?: unknown }).message)) {
      const problemas = (corpo as { message: string[] }).message;
      return { ...erro('VALIDATION_FAILED'), details: problemas };
    }

    const porStatus: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: 'SESSION_EXPIRED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
    };

    const code = porStatus[status] ?? 'INTERNAL';
    return { code, message: MENSAGENS[code] ?? MENSAGENS.INTERNAL };
  }
}
