import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField } from '@gastemenos/ui';
import { ErroDaApi, api } from '../lib/api.js';

interface Conta {
  id: string;
  email: string;
  nome: string;
  papel: 'USER' | 'ADMIN';
  estado: string;
  pausadaAte: string | null;
  exclusaoEm: string | null;
  criadaEm: string;
  regiao: string | null;
  notas: number;
}

interface NaFila {
  id: string;
  email: string;
  estado: string;
  pausadaAte: string | null;
  exclusaoEm: string | null;
}

/**
 * Contas, do lado da operação.
 *
 * **Não existe lista de todo mundo.** A busca é por e-mail exato — quem procura
 * já sabe quem procura, porque a pessoa pediu ajuda. Uma lista paginada da base
 * transformaria suporte em vitrine, e o e-mail sai mascarado mesmo assim.
 *
 * Toda consulta a uma conta fica registrada em Auditoria, não só a alteração.
 */
export function Contas(): React.ReactElement {
  const fila = useQueryClient();
  const [email, setEmail] = useState('');
  const [busca, setBusca] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const conta = useQuery({
    queryKey: ['conta', busca],
    queryFn: () => api.get<Conta>(`/admin/users?email=${encodeURIComponent(busca ?? '')}`),
    enabled: Boolean(busca),
    retry: false,
  });

  const aguardando = useQuery({
    queryKey: ['fila-de-contas'],
    queryFn: () => api.get<NaFila[]>('/admin/users/queue'),
  });

  const mudarPapel = useMutation({
    mutationFn: (dados: { id: string; role: 'USER' | 'ADMIN' }) =>
      api.patch(`/admin/users/${dados.id}/role`, { role: dados.role }),
    onSuccess: () => fila.invalidateQueries({ queryKey: ['conta'] }),
    onError: (falha) =>
      setErro(falha instanceof ErroDaApi ? falha.paraOUsuario : 'Não foi possível mudar o papel.'),
  });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="busca">
        <h1 id="busca" className="mb-1 text-title-m text-ink">
          Buscar conta
        </h1>
        <p className="mb-4 text-body-s text-ink-muted">
          Por e-mail exato. A consulta fica registrada na auditoria.
        </p>

        <Card className="gap-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              setErro(null);
              setBusca(email.trim().toLowerCase());
            }}
          >
            <TextField
              label="E-mail"
              type="email"
              className="flex-1"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
            <Button size="m" type="submit" disabled={!email}>
              Buscar
            </Button>
          </form>

          {busca && conta.isError ? (
            <p role="alert" className="text-body-s text-ink-muted">
              Nenhuma conta com esse e-mail.
            </p>
          ) : null}

          {conta.data ? (
            <div className="flex flex-col gap-2">
              <span className="text-body-l text-ink">{conta.data.nome}</span>
              <span className="text-body-s text-ink-muted">
                {`${conta.data.email} · ${conta.data.estado} · papel ${conta.data.papel}`}
              </span>
              <span className="text-caption text-ink-muted">
                {`${conta.data.notas} notas · região ${conta.data.regiao ?? '—'} · desde ${new Date(
                  conta.data.criadaEm,
                ).toLocaleDateString('pt-BR')}`}
              </span>
              {conta.data.exclusaoEm ? (
                <span className="text-caption text-offer-ink">
                  {`Exclusão agendada para ${new Date(conta.data.exclusaoEm).toLocaleDateString('pt-BR')}`}
                </span>
              ) : null}

              {erro ? (
                <p role="alert" className="text-body-s text-offer-ink">
                  {erro}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  size="m"
                  variant="secondary"
                  disabled={mudarPapel.isPending}
                  onClick={() =>
                    mudarPapel.mutate({
                      id: conta.data!.id,
                      role: conta.data!.papel === 'ADMIN' ? 'USER' : 'ADMIN',
                    })
                  }
                >
                  {conta.data.papel === 'ADMIN' ? 'Tirar acesso de admin' : 'Dar acesso de admin'}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="fila">
        <h2 id="fila" className="mb-1 text-title-m text-ink">
          Precisam de atenção
        </h2>
        <p className="mb-4 text-body-s text-ink-muted">
          Exclusão agendada e pausa com prazo vencido. Não é lista de pessoas — é fila de trabalho.
        </p>

        {(aguardando.data ?? []).length === 0 ? (
          <Card tone="sunken">
            <p className="text-body-m text-ink">Nada pendente.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {(aguardando.data ?? []).map((linha) => (
              <li key={linha.id}>
                <Card className="gap-1">
                  <span className="text-body-m text-ink">{linha.email}</span>
                  <span className="text-caption text-ink-muted">
                    {linha.estado === 'PENDING_DELETION'
                      ? `Exclusão em ${new Date(linha.exclusaoEm ?? '').toLocaleDateString('pt-BR')}`
                      : `Pausa venceu em ${new Date(linha.pausadaAte ?? '').toLocaleDateString('pt-BR')}`}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
