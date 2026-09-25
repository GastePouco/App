import { Injectable, Logger } from '@nestjs/common';
import { ErroDeLeitura } from './adaptadores/adaptador.js';
import { conferirHost } from './hosts.js';

/**
 * Busca a página da nota no portal da SEFAZ.
 *
 * Os portais são serviço público, mantidos com orçamento público, e não têm
 * contrato conosco. Bater neles como se fossem uma API nossa é a forma mais
 * rápida de sermos bloqueados — e de sobrecarregar um serviço que outras
 * pessoas precisam usar. Por isso, de docs/06-NFCE-LEITURA.md:
 *
 * - **no máximo 1 requisição por segundo por UF**, em fila;
 * - **User-Agent identificado**, com como falar com a gente;
 * - **3 tentativas com espera crescente**, não um laço apertado;
 * - **cache de 24 h por chave**, para reprocessar não custar nova visita.
 */
@Injectable()
export class BuscadorService {
  private readonly logger = new Logger(BuscadorService.name);

  /** Última visita por UF, para espaçar em 1 segundo. */
  private readonly ultimaVisita = new Map<string, number>();

  /** Cache simples por chave. Some ao reiniciar, e tudo bem: é só economia. */
  private readonly cache = new Map<string, { html: string; em: number }>();
  private readonly VALIDADE_DO_CACHE = 24 * 60 * 60 * 1000;

  private readonly AGENTE =
    'GasteMenos/0.1 (+https://gastemenos.com.br; contato@gastemenos.com.br)';

  async buscar(url: string, chave: string, uf: string, hostsPermitidos: string[]): Promise<string> {
    const doCache = this.cache.get(chave);
    if (doCache && Date.now() - doCache.em < this.VALIDADE_DO_CACHE) {
      return doCache.html;
    }

    await this.esperarAVezDaUf(uf);

    let ultimaFalha: unknown;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const { html } = await this.visitar(url, hostsPermitidos, uf);

        if (this.pediuCaptcha(html)) {
          // Captcha na consulta pela chave digitada: o QR passa direto, então
          // a saída é pedir o QR, não insistir (docs/06-NFCE-LEITURA.md).
          throw new ErroDeLeitura('NEEDS_QR', 'O portal pediu captcha.');
        }

        this.cache.set(chave, { html, em: Date.now() });
        return html;
      } catch (falha) {
        if (falha instanceof ErroDeLeitura) throw falha;

        ultimaFalha = falha;
        this.logger.warn(`Tentativa ${tentativa}/3 falhou na UF ${uf}.`);

        // Espera crescente: 1s, 2s, 4s. Insistir rápido piora a situação de um
        // portal que já está com problema.
        if (tentativa < 3) await this.dormir(1000 * 2 ** (tentativa - 1));
      }
    }

    this.logger.error(
      `Portal da UF ${uf} indisponível depois de 3 tentativas.`,
      ultimaFalha instanceof Error ? ultimaFalha.message : String(ultimaFalha),
    );
    throw new ErroDeLeitura('PORTAL_UNAVAILABLE');
  }

  /**
   * Segue os redirecionamentos **na mão**, conferindo o host de cada parada.
   *
   * O `redirect: 'follow'` do fetch salta sozinho para onde o servidor mandar,
   * e isso anula a conferência feita antes da primeira requisição: bastaria um
   * redirecionamento aberto num host permitido para a busca terminar em
   * endereço interno. Não é hipótese distante — o portal do DF **redireciona
   * mesmo**, de `dec.fazenda.df.gov.br` para `ww1.receita.fazenda.df.gov.br`.
   */
  private async visitar(
    url: string,
    hostsPermitidos: string[],
    uf: string,
    saltos = 0,
  ): Promise<{ html: string }> {
    if (saltos > 5) throw new ErroDeLeitura('PARSE_FAILED', 'Redirecionamentos demais.');

    conferirHost(url, hostsPermitidos, uf);

    const resposta = await fetch(url, {
      headers: {
        'User-Agent': this.AGENTE,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get('location');
      if (!destino) throw new Error(`portal respondeu ${resposta.status} sem destino`);

      return this.visitar(new URL(destino, url).toString(), hostsPermitidos, uf, saltos + 1);
    }

    if (resposta.status === 429 || resposta.status >= 500) {
      throw new Error(`portal respondeu ${resposta.status}`);
    }

    return { html: await resposta.text() };
  }

  private pediuCaptcha(html: string): boolean {
    return /captcha|recaptcha|hcaptcha|não sou um robô|nao sou um robo/i.test(html);
  }

  /** Espaça as visitas em 1 segundo por UF. */
  private async esperarAVezDaUf(uf: string): Promise<void> {
    const anterior = this.ultimaVisita.get(uf) ?? 0;
    const desdeAUltima = Date.now() - anterior;

    if (desdeAUltima < 1000) await this.dormir(1000 - desdeAUltima);

    this.ultimaVisita.set(uf, Date.now());
  }

  private dormir(ms: number): Promise<void> {
    return new Promise((resolver) => setTimeout(resolver, ms));
  }
}
