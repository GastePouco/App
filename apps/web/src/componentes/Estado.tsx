import type { ReactNode } from 'react';
import { Button, Card, Icon } from '@gastemenos/ui';
import { mensagemDoErro } from '@gastemenos/shared';

/**
 * Os três estados que toda tela com dado precisa ter: carregando, vazio e
 * falhou.
 *
 * Existem juntos num arquivo só porque são a mesma decisão vista de três
 * ângulos — o que a pessoa vê quando **não** há o conteúdo que ela veio ver.
 * Tela que trata só o caminho feliz mostra uma área em branco e deixa quem está
 * olhando sem saber se o app travou, se acabou de carregar ou se não há nada
 * (docs/08-ACESSIBILIDADE.md).
 */

/**
 * `role="status"` para o leitor de tela anunciar sem interromper o que a
 * pessoa está fazendo. Texto visível, não só spinner: quem usa leitor de tela
 * não "vê" animação, e quem tem conexão ruim precisa saber que o app não
 * travou.
 */
export function Carregando({ oQue = 'informações' }: { oQue?: string }): React.ReactElement {
  return (
    <p role="status" className="px-1 py-6 text-body-m text-ink-muted">
      {`Carregando ${oQue}…`}
    </p>
  );
}

/** Vazio explica **por que** está vazio e o que fazer — não só "sem dados". */
export function SemDados({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
}): React.ReactElement {
  return (
    <Card tone="sunken" className="items-center gap-2 py-8 text-center">
      <p className="text-body-l text-ink">{titulo}</p>
      {descricao ? <p className="text-body-s text-ink-muted">{descricao}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </Card>
  );
}

/**
 * Falha de carregamento, com o caminho de volta.
 *
 * Erro sem ação é beco sem saída: a pessoa fica olhando a mensagem sem nada
 * para fazer a não ser sair. `tentarDeNovo` costuma ser o `refetch` da própria
 * consulta.
 */
export function FalhouCarregar({
  erro,
  tentarDeNovo,
}: {
  erro: unknown;
  tentarDeNovo?: () => void;
}): React.ReactElement {
  const semRede = typeof navigator !== 'undefined' && navigator.onLine === false;

  return (
    <Card tone="offer" className="items-start gap-3" role="alert">
      <span className="flex items-center gap-2 text-body-l text-ink">
        <Icon name="close" size={20} aria-hidden="true" />
        {semRede ? 'Sem internet agora' : 'Não conseguimos carregar'}
      </span>
      <p className="text-body-s text-ink">
        {semRede
          ? 'Mostramos o que já estava salvo. Assim que a conexão voltar, atualizamos.'
          : mensagemDoErro(erro)}
      </p>
      {tentarDeNovo ? (
        <Button variant="secondary" size="m" onClick={tentarDeNovo}>
          Tentar de novo
        </Button>
      ) : null}
    </Card>
  );
}
