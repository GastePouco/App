import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cpfValido, formatarCentavos, formatarCpf } from '@gastemenos/shared';
import { BottomNav, Button, Card, Icon, ProgressBar, TextField, Toast } from '@gastemenos/ui';
import { api } from '../../lib/api.js';
import { FalhouCarregar } from '../../componentes/Estado.js';

/**
 * Saldo de recompensa e o que ele compra (docs/18-RECOMPENSAS.md, fase 1).
 *
 * Esta tela **não tem referência aprovada** em `referencia/telas/` — a
 * recompensa nasceu depois do pacote de design. Ela é montada só com
 * componentes e tokens do design system, sem CSS novo, para que a revisão de
 * design depois seja ajuste de arranjo e não reescrita.
 *
 * Duas honestidades que a tela precisa dizer em voz alta:
 *
 * - **o saque em USDC ainda não existe.** Está planejado (fase 2) e é escrito
 *   como plano, não como recurso. Prometer saque que não existe é o tipo de
 *   coisa que o app inteiro foi construído para não fazer;
 * - **o que conta é nota que virou dado.** Quem lê 30 notas e vê 28 no contador
 *   merece saber por quê antes de achar que o app engoliu duas.
 *
 * E a lista de requisitos é mostrada como **convite**, não como muro: o marco
 * batido com cadastro incompleto fica esperando, e a tela diz isso com o número
 * na mão. "Você tem R$ 2,00 esperando" move mais que "complete seu cadastro".
 */

interface ItemDaLoja {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  days: number;
  affordable: boolean;
  activeUntil: string | null;
}

interface Lancamento {
  id: string;
  amountCents: number;
  reason: string;
  description: string;
  createdAt: string;
}

interface Requisitos {
  eligible: boolean;
  emailVerified: boolean;
  profile: boolean;
  cpf: boolean;
  region: boolean;
  cpfConfirmedByReceipt: boolean;
}

interface SituacaoDaRecompensa {
  balanceCents: number;
  receiptsCounted: number;
  milestonesReached: number;
  milestonesWaiting: number;
  requirements: Requisitos;
  nextMilestone: { index: number; receipts: number; missing: number; amountCents: number };
  progress: number;
  benefits: Array<{ code: string; endsAt: string }>;
  store: ItemDaLoja[];
  history: Lancamento[];
}

const dia = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Uma linha da lista de requisitos.
 *
 * Pronto leva a palavra "pronto", não só o ícone: significado nunca sai só da
 * cor (docs/08-ACESSIBILIDADE.md). E o que falta leva o caminho para resolver,
 * na mesma linha — lista de pendência sem saída é cobrança.
 */
function ItemDoRequisito({
  pronto,
  texto,
  href,
  acao,
}: {
  pronto: boolean;
  texto: string;
  href?: string;
  acao?: string;
}): React.ReactElement {
  return (
    <li className="flex items-center gap-2 text-body-m text-ink">
      <Icon name={pronto ? 'check' : 'close'} size={16} />
      <span className="flex-1">{texto}</span>
      {pronto ? (
        <span className="text-caption text-success">pronto</span>
      ) : href && acao ? (
        <Button variant="ghost" size="m" href={href}>
          {acao}
        </Button>
      ) : (
        <span className="text-caption text-ink-muted">falta</span>
      )}
    </li>
  );
}

export function Recompensas(): React.ReactElement {
  const [aviso, setAviso] = useState<string | null>(null);
  const clientes = useQueryClient();

  const situacao = useQuery({
    queryKey: ['recompensas'],
    queryFn: () => api.get<SituacaoDaRecompensa>('/rewards'),
  });

  const comprar = useMutation({
    mutationFn: (code: string) =>
      api.post<{ code: string; endsAt: string; repeated: boolean }>('/rewards/purchase', { code }),
    onSuccess: async (resultado) => {
      const item = situacao.data?.store.find((linha) => linha.code === resultado.code);
      setAviso(
        resultado.repeated
          ? 'Esse item já estava ativo. Nada foi cobrado de novo.'
          : `${item?.name ?? 'Pronto'} — ativo até ${dia(resultado.endsAt)}.`,
      );
      await clientes.invalidateQueries({ queryKey: ['recompensas'] });
      // A tela Ofertas muda de conteúdo quando o patrocínio sai; sem isto a
      // pessoa paga e continua vendo anúncio até o cache expirar.
      await clientes.invalidateQueries({ queryKey: ['ofertas'] });
    },
    onError: (falha: Error) => setAviso(falha.message),
  });

  const [cpf, setCpf] = useState('');
  const [erroDoCpf, setErroDoCpf] = useState<string | null>(null);

  const vincularCpf = useMutation({
    mutationFn: (valor: string) => api.put<{ cpfMascarado: string }>('/me/cpf', { cpf: valor }),
    onSuccess: async (resposta) => {
      setCpf('');
      setErroDoCpf(null);
      setAviso(`CPF ${resposta.cpfMascarado} vinculado. Sua recompensa está liberada.`);
      await clientes.invalidateQueries({ queryKey: ['recompensas'] });
    },
    onError: (falha: Error) => setErroDoCpf(falha.message),
  });

  const removerCpf = useMutation({
    mutationFn: () => api.delete<void>('/me/cpf'),
    onSuccess: async () => {
      setAviso('CPF removido. A recompensa fica em espera até você vincular de novo.');
      await clientes.invalidateQueries({ queryKey: ['recompensas'] });
    },
    onError: (falha: Error) => setAviso(falha.message),
  });

  function enviarCpf(evento: React.FormEvent): void {
    evento.preventDefault();
    // Confere o dígito antes de sair do aparelho: erro de digitação não precisa
    // de ida ao servidor, e a API confere de novo de qualquer jeito.
    if (!cpfValido(cpf)) {
      setErroDoCpf('Confira o CPF: esses números não formam um CPF válido.');
      return;
    }
    vincularCpf.mutate(cpf);
  }

  const dados = situacao.data;

  return (
    <div className="mx-auto w-full max-w-[480px] pb-nav">
      <header className="px-5 pt-6">
        <p className="text-overline text-ink-muted">SUA RECOMPENSA</p>
        <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
          Saldo por notas lidas
        </h1>
      </header>

      <main className="flex flex-col gap-6 px-5 pt-6">
        {situacao.isError ? (
          <FalhouCarregar erro={situacao.error} tentarDeNovo={() => void situacao.refetch()} />
        ) : situacao.isPending ? (
          <p role="status" className="text-body-m text-ink-muted">
            Carregando…
          </p>
        ) : dados ? (
          <>
            <Card className="gap-3">
              <span className="text-overline text-ink-muted">SALDO</span>
              <strong className="tabular-nums text-money-xl text-ink">
                {formatarCentavos(dados.balanceCents)}
              </strong>
              <p className="text-body-s text-ink-muted">
                {dados.milestonesReached > 0
                  ? `${dados.milestonesReached} marco${dados.milestonesReached > 1 ? 's' : ''} de notas até agora.`
                  : 'Seu primeiro marco está logo aí.'}
              </p>
            </Card>

            <section aria-labelledby="progresso">
              <h2 id="progresso" className="mb-3 text-title-s text-ink">
                Próxima recompensa
              </h2>
              <Card className="gap-3">
                <ProgressBar
                  value={dados.progress / 100}
                  label={`Progresso até ${dados.nextMilestone.receipts} notas`}
                />
                <p className="text-body-m text-ink">
                  {dados.nextMilestone.missing === 0
                    ? 'Marco batido. A recompensa entra no seu saldo em instantes.'
                    : `Faltam ${dados.nextMilestone.missing} nota${
                        dados.nextMilestone.missing > 1 ? 's' : ''
                      } para ganhar ${formatarCentavos(dados.nextMilestone.amountCents)}.`}
                </p>
                <p className="text-caption text-ink-muted">
                  {`${dados.receiptsCounted} nota${dados.receiptsCounted === 1 ? '' : 's'} contada${
                    dados.receiptsCounted === 1 ? '' : 's'
                  } até aqui. Conta nota que entrou na base de preços: nota repetida ou que falhou na leitura não entra.`}
                </p>
              </Card>
            </section>

            {!dados.requirements.eligible ? (
              <section aria-labelledby="requisitos">
                <h2 id="requisitos" className="mb-3 text-title-s text-ink">
                  Para receber
                </h2>
                <Card tone="soft" className="gap-3">
                  {dados.milestonesWaiting > 0 ? (
                    <p className="text-body-m text-ink">
                      {`Você já bateu ${dados.milestonesWaiting} marco${
                        dados.milestonesWaiting > 1 ? 's' : ''
                      } e tem ${formatarCentavos(
                        dados.milestonesWaiting * dados.nextMilestone.amountCents,
                      )} esperando. Nada se perde: assim que estes itens estiverem prontos, o valor entra no seu saldo.`}
                    </p>
                  ) : (
                    <p className="text-body-m text-ink">
                      A recompensa é uma por pessoa. Para o valor poder sair, precisamos saber que a
                      conta é de alguém de verdade:
                    </p>
                  )}

                  <ul className="flex flex-col gap-2">
                    <ItemDoRequisito
                      pronto={dados.requirements.emailVerified}
                      texto="E-mail confirmado"
                      href="/confirmar-email"
                      acao="Confirmar"
                    />
                    <ItemDoRequisito
                      pronto={dados.requirements.profile}
                      texto="Questionário de consumo respondido"
                      href="/perfil-de-consumo"
                      acao="Responder"
                    />
                    <ItemDoRequisito
                      pronto={dados.requirements.region}
                      texto="CEP, para saber a sua região"
                      href="/perfil/dados"
                      acao="Preencher"
                    />
                    <ItemDoRequisito pronto={dados.requirements.cpf} texto="CPF vinculado" />
                  </ul>

                  {!dados.requirements.cpf ? (
                    <form className="flex flex-col gap-3" onSubmit={enviarCpf}>
                      <TextField
                        label="Seu CPF"
                        inputMode="numeric"
                        autoComplete="off"
                        value={formatarCpf(cpf)}
                        onChange={(evento) => {
                          setCpf(evento.target.value);
                          setErroDoCpf(null);
                        }}
                        {...(erroDoCpf ? { error: erroDoCpf } : {})}
                        hint="Guardamos só um código irreversível, nunca o número. Serve para garantir uma recompensa por pessoa."
                      />
                      <Button type="submit" disabled={vincularCpf.isPending}>
                        Vincular CPF
                      </Button>
                    </form>
                  ) : null}

                  <p className="text-caption text-ink-muted">
                    Não pedimos celular: a gente não usa para nada aqui, e dado que não se usa não
                    se pede.
                  </p>
                </Card>
              </section>
            ) : null}

            {dados.requirements.cpf ? (
              <section aria-labelledby="cpf">
                <h2 id="cpf" className="mb-3 text-title-s text-ink">
                  Seu CPF
                </h2>
                <Card className="gap-2">
                  <p className="flex items-center gap-1 text-body-m text-ink">
                    <Icon name="check" size={16} />
                    CPF vinculado
                  </p>
                  <p className="text-caption text-ink-muted">
                    {dados.requirements.cpfConfirmedByReceipt
                      ? 'Uma nota que você leu trouxe esse mesmo CPF — então está provado que a compra foi sua, sem a gente ter guardado o número.'
                      : 'Não mostramos o número de volta porque não o temos: guardamos só um código irreversível. Quando você ler uma nota emitida nesse CPF, ele fica confirmado.'}
                  </p>
                  <Button
                    variant="ghost"
                    disabled={removerCpf.isPending}
                    onClick={() => removerCpf.mutate()}
                  >
                    Remover meu CPF
                  </Button>
                </Card>
              </section>
            ) : null}

            <section aria-labelledby="loja">
              <h2 id="loja" className="mb-3 text-title-s text-ink">
                O que o saldo compra
              </h2>
              <ul className="flex flex-col gap-3">
                {dados.store.map((item) => {
                  const ativo = item.activeUntil !== null;

                  return (
                    <li key={item.code} className="flex flex-col gap-2 rounded-l bg-surface-raised px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-label text-ink">{item.name}</span>
                        <span className="shrink-0 tabular-nums text-label text-points-ink">
                          {formatarCentavos(item.priceCents)}
                        </span>
                      </div>
                      <p className="text-caption text-ink-muted">{item.description}</p>

                      {ativo ? (
                        <p className="flex items-center gap-1 text-caption text-success">
                          <Icon name="check" size={14} />
                          {`Ativo até ${dia(item.activeUntil!)}`}
                        </p>
                      ) : null}

                      <Button
                        variant={ativo ? 'secondary' : 'primary'}
                        disabled={!item.affordable || comprar.isPending}
                        onClick={() => comprar.mutate(item.code)}
                      >
                        {/* O botão diz o que falta, em vez de só ficar apagado:
                            botão desabilitado sem motivo é o mesmo que erro
                            silencioso (docs/08-ACESSIBILIDADE.md). */}
                        {!item.affordable
                          ? 'Saldo ainda não cobre'
                          : ativo
                            ? `Estender ${item.days} dias`
                            : `Trocar por ${item.days} dias`}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="extrato">
              <h2 id="extrato" className="mb-3 text-title-s text-ink">
                Extrato
              </h2>
              {dados.history.length === 0 ? (
                <p className="text-body-m text-ink-muted">
                  Nada por aqui ainda. Cada nota lida te aproxima do primeiro marco.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dados.history.map((linha) => (
                    <li
                      key={linha.id}
                      className="flex items-center gap-3 rounded-l bg-surface-raised px-4 py-3"
                    >
                      <span className="flex flex-1 flex-col">
                        <span className="text-body-m text-ink">{linha.description}</span>
                        <span className="text-caption text-ink-muted">{dia(linha.createdAt)}</span>
                      </span>
                      {/* O sinal vai escrito junto do valor: cor sozinha não
                          distingue crédito de gasto. */}
                      <span
                        className={`tabular-nums text-label ${
                          linha.amountCents >= 0 ? 'text-success' : 'text-ink-muted'
                        }`}
                      >
                        {`${linha.amountCents >= 0 ? '+' : '−'}${formatarCentavos(Math.abs(linha.amountCents))}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Card tone="soft" className="gap-2">
              <span className="text-label text-ink">Sacar para carteira</span>
              <p className="text-body-s text-ink-muted">
                Ainda não existe. O plano é sacar em USDC, com a taxa paga por nós, e está escrito
                em docs/18-RECOMPENSAS.md. Enquanto não existir, o saldo vale aqui dentro — e nada
                aqui depende de você ter carteira.
              </p>
            </Card>
          </>
        ) : null}

        {aviso ? <Toast>{aviso}</Toast> : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px]">
        <BottomNav active="ranking" />
      </div>
    </div>
  );
}
