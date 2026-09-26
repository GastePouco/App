import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@gastemenos/ui';
import { api } from '../lib/api.js';

interface NotaComFalha {
  id: string;
  status: string;
  failureReason: string | null;
  source: string;
  createdAt: string;
  uf: string;
  temPagina: boolean;
}

const EXPLICACAO: Record<string, string> = {
  PARSE_FAILED: 'A página abriu e a leitura não entendeu o formato — é aqui que o parser precisa de conserto.',
  PORTAL_UNAVAILABLE: 'O portal do estado não respondeu. Costuma passar sozinho.',
  NEEDS_QR: 'Chave digitada num estado que só abre pelo QR. Não é defeito nosso.',
};

/**
 * Triagem da leitura.
 *
 * A página guardada é o que permite consertar o parser quando a SEFAZ muda o
 * HTML — sem ela, a prova do formato novo some junto com a requisição. Ela vive
 * 30 dias, sai sem o CPF do consumidor, e **abrir uma fica registrado**.
 */
export function Notas(): React.ReactElement {
  const [aberta, setAberta] = useState<{ id: string; html: string } | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);

  const notas = useQuery({
    queryKey: ['notas-com-falha'],
    queryFn: () => api.get<NotaComFalha[]>('/admin/receipts/failed?limit=100'),
  });

  async function abrir(id: string): Promise<void> {
    setCarregando(id);
    try {
      const resposta = await fetch(`/v1/admin/receipts/${id}/page`, { credentials: 'include' });
      setAberta({ id, html: await resposta.text() });
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-title-m text-ink">Notas com falha</h1>
        <p className="text-body-s text-ink-muted">
          Sem chave de acesso e sem quem leu: o que interessa aqui é o formato que quebrou.
        </p>
      </div>

      {notas.isPending ? (
        <p role="status" className="text-body-m text-ink-muted">
          Carregando…
        </p>
      ) : (notas.data ?? []).length === 0 ? (
        <Card tone="sunken">
          <p className="text-body-m text-ink">Nenhuma leitura falhou. Bom sinal.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {(notas.data ?? []).map((nota) => (
            <li key={nota.id}>
              <Card className="gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body-l text-ink">{nota.status}</span>
                  <span className="text-caption text-ink-muted">
                    {`UF ${nota.uf} · ${nota.source} · ${new Date(nota.createdAt).toLocaleString('pt-BR')}`}
                  </span>
                </div>

                <p className="text-body-s text-ink-muted">
                  {EXPLICACAO[nota.status] ?? 'Sem explicação registrada.'}
                </p>

                {nota.temPagina ? (
                  <div>
                    <Button
                      size="m"
                      variant="secondary"
                      disabled={carregando === nota.id}
                      onClick={() => void abrir(nota.id)}
                    >
                      {carregando === nota.id ? 'Abrindo…' : 'Ver a página guardada'}
                    </Button>
                  </div>
                ) : (
                  <span className="text-caption text-ink-muted">
                    Sem página guardada — a falha foi antes de baixar.
                  </span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {aberta ? (
        <Card className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-label text-ink">{`Página da nota ${aberta.id}`}</span>
            <Button size="m" variant="ghost" onClick={() => setAberta(null)}>
              Fechar
            </Button>
          </div>

          {/* Texto puro, nunca renderizado: HTML de terceiro dentro do painel
              seria script de terceiro rodando com a sessão de quem opera. */}
          <pre className="max-h-[420px] overflow-auto rounded-m bg-surface-sunken p-4 text-caption text-ink">
            {aberta.html.slice(0, 20_000)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
