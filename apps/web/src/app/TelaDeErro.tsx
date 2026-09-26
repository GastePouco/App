import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button, Card } from '@gastemenos/ui';

/**
 * O que a pessoa vê quando o app quebra de verdade.
 *
 * Sem isto, um erro em qualquer tela deixa a página **em branco** — o pior
 * resultado possível, porque não diz o que houve nem oferece saída, e quem está
 * do outro lado conclui que o aplicativo sumiu com os dados dela.
 *
 * Três cuidados:
 *
 * - **Nada de detalhe técnico na tela.** Pilha de erro não ajuda quem está no
 *   mercado e às vezes carrega caminho de arquivo ou consulta.
 * - **Sempre uma saída**: recarregar e voltar ao início.
 * - **O erro vai para o console**, que é onde o monitoramento do navegador
 *   recolhe. A API tem o `x-request-id` para o mesmo fim do lado do servidor.
 */
export function TelaDeErro(): React.ReactElement {
  const erro = useRouteError();

  if (import.meta.env.DEV) console.error('Erro na rota:', erro);

  const naoEncontrado = isRouteErrorResponse(erro) && erro.status === 404;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col justify-center gap-5 px-5">
      <h1 tabIndex={-1} className="text-title-l text-ink outline-none">
        {naoEncontrado ? 'Essa página não existe' : 'Algo quebrou aqui'}
      </h1>

      <Card tone="sunken" className="gap-2">
        <p className="text-body-m text-ink">
          {naoEncontrado
            ? 'O endereço que você abriu não leva a lugar nenhum do aplicativo.'
            : 'Não foi culpa sua, e seus dados estão salvos. Tente de novo; se continuar, volte ao início.'}
        </p>
      </Card>

      {!naoEncontrado ? (
        <Button fullWidth onClick={() => window.location.reload()}>
          Tentar de novo
        </Button>
      ) : null}

      <Button variant="secondary" fullWidth href="/inicio">
        Ir para o início
      </Button>
    </main>
  );
}
