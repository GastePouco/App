import { Injectable } from '@nestjs/common';
import type { AdaptadorDeNfce, NotaLida } from './adaptador.js';
import { interpretarPagina } from './nfce.parser.js';

/**
 * São Paulo.
 *
 * Entra antes das outras UFs da fila por dois motivos práticos: é onde há mais
 * nota para testar, e o aplicativo anterior já lia SP em produção — o parser
 * compartilhado veio dos seletores dele, conferidos contra uma nota real
 * (docs/06-NFCE-LEITURA.md).
 *
 * Medido em 25/09/2026, como no DF:
 *
 * - **`/qrcode?p=…` não tem captcha.** Redireciona para `ConsultaQRCode.aspx`
 *   e devolve a página. É o caminho do aplicativo.
 * - **A consulta pública por chave tem reCAPTCHA** — a página
 *   `ConsultaPublica.aspx` existe, mas não é para ler por programa. Então, como
 *   no DF, chave digitada vira `NEEDS_QR` sem visitar o portal.
 */
@Injectable()
export class AdaptadorDeSp implements AdaptadorDeNfce {
  readonly codigoDaUf = '35';
  readonly uf = 'SP';

  readonly hostsPermitidos = [
    'www.nfce.fazenda.sp.gov.br',
    'nfce.fazenda.sp.gov.br',
    'www.fazenda.sp.gov.br',
    'satsp.fazenda.sp.gov.br',
  ];

  urlDaConsulta(_chave: string, qrUrl?: string): string | null {
    return qrUrl ?? null;
  }

  interpretar(html: string, chave: string): NotaLida {
    return interpretarPagina(html, chave, this.uf);
  }
}
