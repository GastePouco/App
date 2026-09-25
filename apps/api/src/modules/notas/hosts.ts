import { ErroDeLeitura } from './adaptadores/adaptador.js';

/**
 * Recusa endereço fora da lista do adaptador.
 *
 * A URL do QR vem do celular da pessoa, e QR code é fácil de forjar: basta
 * colar um adesivo na gôndola. Sem esta conferência, o adesivo manda nosso
 * servidor buscar o endereço que o atacante quiser — e servidor alcança o que a
 * internet não alcança: o serviço de metadados da nuvem, onde moram
 * credenciais, e qualquer porta da rede interna.
 *
 * Confere o **host inteiro**, não o sufixo: `fazenda.df.gov.br.exemplo.com`
 * passaria num `endsWith` distraído.
 *
 * Vale para cada parada de redirecionamento, não só para a primeira — ver
 * `BuscadorService.visitar`.
 */
export function conferirHost(url: string, permitidos: string[], uf: string): void {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    throw new ErroDeLeitura('PARSE_FAILED', 'Endereço do QR inválido.');
  }

  if (endereco.protocol !== 'https:' && endereco.protocol !== 'http:') {
    throw new ErroDeLeitura('PARSE_FAILED', 'Endereço do QR com esquema inesperado.');
  }

  if (!permitidos.includes(endereco.hostname.toLowerCase())) {
    throw new ErroDeLeitura(
      'PARSE_FAILED',
      `QR aponta para ${endereco.hostname}, que não é o portal de ${uf}.`,
    );
  }
}
