import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdaptadorDeSp } from '../src/modules/notas/adaptadores/sp.adaptador.js';

/**
 * Leitura de uma nota **real** de São Paulo: Zaffari, 29/08/2026, 66 itens,
 * R$ 1.901,57 (a mesma que validou o leitor do aplicativo anterior).
 *
 * Os números são da nota; o HTML em volta foi reconstruído com as classes e os
 * rótulos do layout da NFC-e — a página inteira não foi salva na época. Está
 * escrito em `fixtures/nfce/sp/montar.mjs` o que é real e o que não é.
 *
 * A versão **sem classe nenhuma** é a que vale mais: ela prova que a leitura
 * sobrevive à SEFAZ trocar o HTML, porque aí só restam os rótulos que a pessoa
 * lê na tela ("Qtde.:", "Vl. Unit.:", "Valor a pagar").
 */
describe('NFC-e de São Paulo, nota real', () => {
  const adaptador = new AdaptadorDeSp();
  const chave = '35260800000000000191651130006084791000000028';

  const pagina = (arquivo: string): string =>
    readFileSync(join(__dirname, 'fixtures', 'nfce', 'sp', arquivo), 'utf8');

  describe.each([
    ['com as classes do site', 'pagina-com-classes.html'],
    ['sem classe nenhuma', 'pagina-sem-classes.html'],
  ])('%s', (_nome, arquivo) => {
    const nota = () => adaptador.interpretar(pagina(arquivo), chave);

    it('lê os 66 itens', () => {
      expect(nota().items).toHaveLength(66);
    });

    it('o total é R$ 1.901,57, e não o "Valor pago" nem o troco NaN', () => {
      expect(nota().totalCents).toBe(190157);
    });

    it('a soma dos itens fecha com o total', () => {
      const soma = nota().items.reduce((total, item) => total + item.totalCents, 0);
      expect(Math.abs(soma - 190157)).toBeLessThanOrEqual(2);
    });

    it('lê quantidade fracionada em quilo', () => {
      const carne = nota().items.find((item) => item.rawDescription.includes('CARNE MOIDA'));

      expect(carne).toBeDefined();
      expect(carne!.quantity).toBeCloseTo(0.6379, 4);
      expect(carne!.unit.toLowerCase()).toBe('kg');
      expect(carne!.unitPriceCents).toBe(6590);
      expect(carne!.totalCents).toBe(4204);
    });

    it('lê a loja, o CNPJ e a data de emissão', () => {
      const lida = nota();

      expect(lida.store.name).toContain('ZAFFARI');
      expect(lida.store.cnpj).toBe('93015006005344');
      expect(lida.issuedAt.slice(0, 10)).toBe('2026-08-29');
    });

    it('registra que havia CPF na página, sem guardar o número', () => {
      const lida = nota();

      expect(lida.consumerCpfPresent).toBe(true);
      expect(JSON.stringify(lida)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    });
  });

  it('sem QR não há consulta: em SP a busca por chave tem reCAPTCHA', () => {
    expect(adaptador.urlDaConsulta(chave)).toBeNull();
    expect(adaptador.urlDaConsulta(chave, 'https://www.nfce.fazenda.sp.gov.br/qrcode?p=x')).toBe(
      'https://www.nfce.fazenda.sp.gov.br/qrcode?p=x',
    );
  });
});
