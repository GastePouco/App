import { Injectable } from '@nestjs/common';
import type { AdaptadorDeNfce } from './adaptador.js';
import { AdaptadorDoDf } from './df.adaptador.js';
import { AdaptadorDeSp } from './sp.adaptador.js';

/**
 * Adaptadores por código IBGE da UF, lido dos 2 primeiros dígitos da chave.
 *
 * Um estado sem adaptador não é erro de programação: é cobertura que ainda não
 * existe. A nota entra como recusada com uma mensagem que diz isso, em vez de
 * estourar — a pessoa precisa saber que a nota dela é válida e o app é que
 * ainda não lê aquele estado.
 *
 * Ordem de chegada: DF e SP (onde há mais nota para testar), depois GO, MG,
 * RJ, PR, RS.
 */
@Injectable()
export class RegistroDeAdaptadores {
  private readonly porUf = new Map<string, AdaptadorDeNfce>();

  constructor(adaptadorDoDf: AdaptadorDoDf, adaptadorDeSp: AdaptadorDeSp) {
    for (const adaptador of [adaptadorDoDf, adaptadorDeSp]) {
      this.porUf.set(adaptador.codigoDaUf, adaptador);
    }
  }

  para(codigoDaUf: string): AdaptadorDeNfce | null {
    return this.porUf.get(codigoDaUf) ?? null;
  }

  ufsAtendidas(): string[] {
    return [...this.porUf.values()].map((a) => a.uf);
  }
}
