import { useId } from 'react';
import { cx } from '../cx.js';

export interface BarraSemanal {
  /** "Semana 1", "1–7 set". */
  label: string;
  /** Em centavos. */
  valor: number;
}

export interface WeeklyBarsProps {
  barras: BarraSemanal[];
  formatarValor: (centavos: number) => string;
  /** Vira o resumo lido em voz alta e o rótulo do gráfico. */
  titulo: string;
  /**
   * Como chamar a maior barra na tabela. O padrão fala em semana porque o
   * componente nasceu na tela de gastos; quem usa para outra coisa (dias, por
   * exemplo) troca, senão o texto acessível mente sobre o que está ali.
   */
  destaqueDoMaior?: string;
  altura?: number;
  className?: string;
}

/**
 * Gasto por semana do mês.
 *
 * Uma série só, então uma cor só — colorir cada barra de um tom diferente
 * gastaria o único canal livre repetindo o que o comprimento já diz. A semana
 * que mais pesou é destacada, que é a informação que a tela quer dar.
 *
 * Sem número em cima de cada barra: o valor de cada semana está na lista
 * abaixo, que é a versão em tabela do mesmo dado. Rótulo em toda barra vira
 * ruído e ninguém lê.
 */
export function WeeklyBars({
  barras,
  formatarValor,
  titulo,
  destaqueDoMaior = 'semana que mais pesou',
  altura = 120,
  className,
}: WeeklyBarsProps): React.ReactElement {
  const idDoResumo = useId();

  const comValor = barras.filter((barra) => barra.valor > 0);
  if (comValor.length === 0) {
    return (
      <p className={cx('text-body-m text-ink-muted', className)}>
        Ainda não há gastos neste período.
      </p>
    );
  }

  const maior = Math.max(...barras.map((barra) => barra.valor));
  const indiceDoMaior = barras.findIndex((barra) => barra.valor === maior);

  const resumo = `${titulo}. ${barras
    .map((barra) => `${barra.label}, ${formatarValor(barra.valor)}`)
    .join('. ')}. Semana de maior gasto: ${barras[indiceDoMaior]?.label}.`;

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div
        role="img"
        aria-labelledby={idDoResumo}
        className="flex items-end gap-2"
        style={{ height: altura }}
      >
        {barras.map((barra, indice) => {
          const fracao = maior > 0 ? barra.valor / maior : 0;
          const destaque = indice === indiceDoMaior;

          return (
            <div key={barra.label} className="flex h-full flex-1 flex-col justify-end">
              <div
                aria-hidden="true"
                // Topo arredondado, base ancorada na linha de referência.
                className={`rounded-t-s ${destaque ? 'bg-brand' : 'bg-brand-soft'}`}
                style={{ height: `${Math.max(fracao * 100, barra.valor > 0 ? 4 : 1)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Eixo: rótulos das semanas, alinhados às barras. */}
      <div aria-hidden="true" className="flex gap-2">
        {barras.map((barra) => (
          <span key={barra.label} className="flex-1 text-center text-caption text-ink-muted">
            {barra.label}
          </span>
        ))}
      </div>

      <p id={idDoResumo} className="gm-sr">
        {resumo}
      </p>

      {/* Versão em tabela: todo valor alcançável sem depender do desenho. */}
      <ul className="flex flex-col gap-1">
        {barras.map((barra, indice) => (
          <li
            key={barra.label}
            className="flex items-center justify-between text-body-s text-ink-muted"
          >
            <span>
              {barra.label}
              {indice === indiceDoMaior ? ` · ${destaqueDoMaior}` : ''}
            </span>
            <span className="tabular-nums text-ink">{formatarValor(barra.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
