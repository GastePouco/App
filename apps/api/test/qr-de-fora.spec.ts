import { AdaptadorDoDf } from '../src/modules/notas/adaptadores/df.adaptador.js';
import { conferirHost } from '../src/modules/notas/hosts.js';
import { ErroDeLeitura } from '../src/modules/notas/adaptadores/adaptador.js';

/**
 * A URL do QR chega de fora: quem manda é o celular da pessoa, e QR code é
 * fácil de forjar — basta um adesivo na gôndola. Buscar esse endereço sem
 * conferir transforma a API em procuradora de quem imprimiu o papel: servidor
 * alcança o que a internet não alcança (metadados da nuvem, rede interna).
 */
describe('QR que vem de fora', () => {
  const df = new AdaptadorDoDf();

  function recusa(url: string): string {
    try {
      conferirHost(url, df.hostsPermitidos, df.uf);
    } catch (falha) {
      expect(falha).toBeInstanceOf(ErroDeLeitura);
      return (falha as ErroDeLeitura).motivo;
    }
    throw new Error(`deixou passar: ${url}`);
  }

  it('aceita os endereços do portal do DF', () => {
    // O QR aponta para dec.* e o portal redireciona para ww1.receita.*; as duas
    // pontas precisam estar na lista, senão a nota morre no meio do caminho.
    for (const url of [
      'http://dec.fazenda.df.gov.br/ConsultarNFCe.aspx?p=53260800000000000191650010000000020000000009|3|1',
      'https://ww1.receita.fazenda.df.gov.br/DecVisualizador/Nfce/Captcha?Chave=5326077455206800135365113000056288130295822',
    ]) {
      expect(() => conferirHost(url, df.hostsPermitidos, df.uf)).not.toThrow();
    }
  });

  it('recusa endereço interno', () => {
    expect(recusa('http://169.254.169.254/latest/meta-data/')).toBe('PARSE_FAILED');
    expect(recusa('http://127.0.0.1:3001/v1/me')).toBe('PARSE_FAILED');
    expect(recusa('http://10.0.0.5/admin')).toBe('PARSE_FAILED');
  });

  it('recusa domínio que só termina parecido', () => {
    // `endsWith` distraído deixaria este passar.
    expect(recusa('https://fazenda.df.gov.br.exemplo.com/nfce')).toBe('PARSE_FAILED');
  });

  it('recusa esquema que não seja http(s)', () => {
    expect(recusa('file:///etc/passwd')).toBe('PARSE_FAILED');
  });

  it('recusa lixo no lugar de endereço', () => {
    expect(recusa('nao é uma url')).toBe('PARSE_FAILED');
  });

  it('no DF, sem QR não há endereço para consultar', () => {
    const chave = '53260800000000000191650010000000010000000001';

    expect(df.urlDaConsulta(chave)).toBeNull();
    expect(df.urlDaConsulta(chave, 'http://www.fazenda.df.gov.br/nfce/qrcode?p=x')).toBe(
      'http://www.fazenda.df.gov.br/nfce/qrcode?p=x',
    );
  });
});
