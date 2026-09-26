import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Chip } from '@gastemenos/ui';
import { api } from '../lib/api.js';

interface Registro {
  id: string;
  quando: string;
  quem: string;
  quemId: string;
  acao: string;
  alvo: string | null;
  detalhes: unknown;
}

const ACOES = [
  { id: '', rotulo: 'Tudo' },
  { id: 'offer.create', rotulo: 'Ofertas criadas' },
  { id: 'offer.delete', rotulo: 'Ofertas excluídas' },
  { id: 'product.merge', rotulo: 'Produtos fundidos' },
  { id: 'user.read', rotulo: 'Contas consultadas' },
  { id: 'user.role', rotulo: 'Papéis alterados' },
  { id: 'receipt.html.read', rotulo: 'Páginas abertas' },
];

/**
 * A trilha de auditoria — e o fato de ela ser legível aqui é metade da
 * proteção. A outra metade é quem opera saber que tudo fica registrado,
 * inclusive **consultar** uma conta, não só alterar.
 *
 * O registro não tem chave estrangeira para a conta de quem agiu: ele sobrevive
 * ao encerramento dela, e aí o nome aparece como "(conta encerrada)" com o id
 * preservado.
 */
export function Auditoria(): React.ReactElement {
  const [acao, setAcao] = useState('');

  const trilha = useQuery({
    queryKey: ['auditoria', acao],
    queryFn: () =>
      api.get<Registro[]>(`/admin/logs?limit=200${acao ? `&action=${acao}` : ''}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mb-1 text-title-m text-ink">Auditoria</h1>
        <p className="text-body-s text-ink-muted">
          Quem fez o quê, e quando. Consultar uma conta também entra aqui.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por ação">
        {ACOES.map((opcao) => (
          <Chip key={opcao.id} selected={acao === opcao.id} onClick={() => setAcao(opcao.id)}>
            {opcao.rotulo}
          </Chip>
        ))}
      </div>

      {trilha.isPending ? (
        <p role="status" className="text-body-m text-ink-muted">
          Carregando…
        </p>
      ) : (trilha.data ?? []).length === 0 ? (
        <Card tone="sunken">
          <p className="text-body-m text-ink">Nada registrado com esse filtro.</p>
        </Card>
      ) : (
        <Card>
          {/* A rolagem fica num contêiner que recebe foco: tabela larga que só
              rola com o mouse deixa metade das colunas fora do alcance de quem
              usa teclado. */}
          <div tabIndex={0} role="region" aria-label="Ações administrativas" className="overflow-x-auto">
          <table className="w-full border-collapse text-body-s">
            <caption className="sr-only">Ações administrativas registradas</caption>
            <thead>
              <tr className="text-left text-label text-ink-muted">
                <th scope="col" className="py-2 pr-4">Quando</th>
                <th scope="col" className="py-2 pr-4">Quem</th>
                <th scope="col" className="py-2 pr-4">Ação</th>
                <th scope="col" className="py-2 pr-4">Alvo</th>
                <th scope="col" className="py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {(trilha.data ?? []).map((registro) => (
                <tr key={registro.id} className="border-t border-line align-top text-ink">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(registro.quando).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-4">{registro.quem}</td>
                  <td className="py-2 pr-4">{registro.acao}</td>
                  <td className="py-2 pr-4 text-ink-muted">{registro.alvo ?? '—'}</td>
                  <td className="py-2 text-caption text-ink-muted">
                    {registro.detalhes ? JSON.stringify(registro.detalhes) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
