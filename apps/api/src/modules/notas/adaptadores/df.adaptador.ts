import { Injectable } from '@nestjs/common';
import type { AdaptadorDeNfce, NotaLida } from './adaptador.js';
import { interpretarPagina } from './nfce.parser.js';

/**
 * Distrito Federal — a primeira UF atendida (docs/06-NFCE-LEITURA.md).
 *
 * O portal usa o modelo padrão da SEFAZ, então a leitura fica toda no parser
 * compartilhado. O que é próprio do DF é o endereço — e uma limitação que só
 * apareceu com uma nota de verdade na mão:
 *
 * **No DF não dá para consultar pela chave digitada.** O endereço do QR
 * (`www.fazenda.df.gov.br/nfce/qrcode?p=…`) exige o parâmetro inteiro, com o
 * hash que o emissor assina; mandar só os 44 dígitos devolve "Hash QR Code
 * inválido". E a consulta por chave do Portal de Serviços é uma aplicação
 * Angular atrás do desafio da Cloudflare — não é página para ler, é navegador
 * para usar.
 *
 * Então, sem o QR, a resposta certa é `NEEDS_QR`: pedir o QR à pessoa, em vez
 * de bater no portal para falhar. `urlDaConsulta` devolve `null` para dizer
 * isso, e quem digitou a chave recebe uma explicação, não um erro genérico.
 */
@Injectable()
export class AdaptadorDoDf implements AdaptadorDeNfce {
  readonly codigoDaUf = '53';
  readonly uf = 'DF';

  /**
   * Endereços que este adaptador pode visitar.
   *
   * A URL do QR vem do celular da pessoa, ou seja, de fora. Sem esta lista, um
   * QR forjado faria a API buscar qualquer endereço que o atacante escolhesse
   * — inclusive endereço interno da nossa própria rede, que só o servidor
   * alcança.
   */
  readonly hostsPermitidos = [
    // O QR das notas do DF aponta para cá, e este host redireciona para o
    // visualizador em ww1 — medido com uma nota real.
    'dec.fazenda.df.gov.br',
    'www.fazenda.df.gov.br',
    'fazenda.df.gov.br',
    'ww1.receita.fazenda.df.gov.br',
    'receita.fazenda.df.gov.br',
  ];

  urlDaConsulta(_chave: string, qrUrl?: string): string | null {
    return qrUrl ?? null;
  }

  interpretar(html: string, chave: string): NotaLida {
    return interpretarPagina(html, chave, this.uf);
  }
}
