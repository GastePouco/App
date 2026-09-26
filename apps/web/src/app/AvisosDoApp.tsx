import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from '@gastemenos/ui';

/**
 * Os dois avisos que valem para o app inteiro: perdeu a conexão e saiu versão
 * nova.
 *
 * Ficam aqui, acima do roteador, porque não pertencem a tela nenhuma — e
 * porque repetir isso em vinte telas é como metade delas fica sem.
 */

/** Faixa fixa no rodapé, acima da barra de navegação. */
function Faixa({
  children,
  tom,
}: {
  children: React.ReactNode;
  tom: 'aviso' | 'novidade';
}): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[480px] items-center justify-between gap-3 px-5 py-3 text-body-s ${
        tom === 'aviso' ? 'bg-offer-soft text-offer-ink' : 'bg-brand text-on-brand'
      }`}
    >
      {children}
    </div>
  );
}

export function AvisosDoApp(): React.ReactElement | null {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const [atualizar, setAtualizar] = useState<(() => void) | null>(null);

  useEffect(() => {
    const caiu = () => setOffline(true);
    const voltou = () => setOffline(false);

    window.addEventListener('offline', caiu);
    window.addEventListener('online', voltou);
    return () => {
      window.removeEventListener('offline', caiu);
      window.removeEventListener('online', voltou);
    };
  }, []);

  useEffect(() => {
    /*
     * `registerType: 'prompt'` no vite.config: a versão nova só entra quando a
     * pessoa aceita. Trocar o app embaixo de quem está no meio de uma leitura
     * de nota perderia o que ela estava fazendo — e recarregar sozinho é o
     * jeito mais rápido de alguém desconfiar do aplicativo.
     */
    const atualizarSW = registerSW({
      immediate: true,
      onNeedRefresh: () => setTemVersaoNova(true),
    });

    setAtualizar(() => () => void atualizarSW(true));
  }, []);

  // Sem conexão vem primeiro: é o que afeta o que está na tela agora.
  if (offline) {
    return <Faixa tom="aviso">Sem internet. Mostrando o que já estava salvo.</Faixa>;
  }

  if (temVersaoNova && atualizar) {
    return (
      <Faixa tom="novidade">
        <span>Tem uma versão nova do aplicativo.</span>
        <Button size="m" variant="secondary" onClick={atualizar}>
          Atualizar
        </Button>
      </Faixa>
    );
  }

  return null;
}
