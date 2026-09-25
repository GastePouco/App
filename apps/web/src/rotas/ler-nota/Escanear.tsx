import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatarChave, limparChave, lerChaveDeAcesso } from '@gastemenos/shared';
import { Button, Card, Icon, IconButton, TextField } from '@gastemenos/ui';
import { Erro } from '../../componentes/Erro.js';
import { ErroDaApi, api } from '../../lib/api.js';
import { useLeitorDeQr } from './useLeitorDeQr.js';
import { guardarParaDepois } from './filaLocal.js';

/**
 * `referencia/telas/Escanear.dc.html`
 *
 * Três caminhos para a mesma coisa, sempre visíveis: câmera, foto da galeria e
 * digitar os 44 números. A câmera não pode ser obrigatória — nem todo aparelho
 * tem uma que funcione, nem toda pessoa consegue enquadrar um código pequeno
 * (docs/08-ACESSIBILIDADE.md).
 *
 * A chave é validada **aqui**, antes de sair do aparelho: dígito verificador
 * errado é resposta imediata, sem gastar uma ida à rede nem uma visita ao
 * portal da SEFAZ. A API valida de novo, porque cliente não se confia.
 */

type Modo = 'camera' | 'chave';

export function Escanear(): React.ReactElement {
  const navegar = useNavigate();
  const [modo, setModo] = useState<Modo>('camera');
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function enviar(dados: { qrUrl?: string; accessKey?: string; source: string }) {
    setEnviando(true);
    setErro(null);

    try {
      const nota = await api.post<{ id: string }>('/receipts', dados);

      // Vibra ao ler, se o aparelho souber e a pessoa não tiver desligado.
      navigator.vibrate?.(80);

      navegar(`/notas/${nota.id}/resultado`, { replace: true });
    } catch (falha) {
      if (falha instanceof ErroDaApi && falha.code === 'OFFLINE') {
        // Sem rede a leitura não se perde: vai para a fila local e sobe quando
        // a conexão voltar (docs/02-ARQUITETURA.md).
        await guardarParaDepois(dados);
        setErro('Sem internet. Guardamos sua nota e vamos enviar quando a conexão voltar.');
        return;
      }
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler a nota.');
    } finally {
      setEnviando(false);
    }
  }

  const leitor = useLeitorDeQr(modo === 'camera' && !enviando, (valor) => {
    void enviar({ qrUrl: valor, source: 'qr' });
  });

  function enviarChave(evento: React.FormEvent): void {
    evento.preventDefault();

    const numeros = limparChave(chave);
    const leitura = lerChaveDeAcesso(numeros);

    if (!leitura.ok) {
      setErro(
        leitura.code === 'NOT_NFCE'
          ? 'Essa é uma nota de outro tipo. Por enquanto só lemos notas de compras em lojas (NFC-e).'
          : 'A chave precisa ter 44 números. Confira e tente de novo.',
      );
      return;
    }

    void enviar({ accessKey: numeros, source: 'key' });
  }

  async function lerDaGaleria(evento: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setErro(null);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const endereco = URL.createObjectURL(arquivo);
      try {
        const achado = await new BrowserQRCodeReader().decodeFromImageUrl(endereco);
        await enviar({ qrUrl: achado.getText(), source: 'gallery' });
      } finally {
        URL.revokeObjectURL(endereco);
      }
    } catch {
      setErro(
        'Não achamos um QR code nessa foto. Tente enquadrar só o código, ou digite os 44 números.',
      );
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-camera">
      <header className="flex items-center justify-between px-5 pt-6">
        <IconButton icon="back" label="Voltar" variant="ghost" onClick={() => navegar('/inicio')} />
        <h1 tabIndex={-1} className="text-title-s text-on-brand outline-none">
          Ler nota fiscal
        </h1>
        <IconButton icon="help" label="Ajuda" variant="ghost" href="/ajuda" />
      </header>

      {modo === 'camera' ? (
        <section className="flex flex-1 flex-col px-5 pt-6" aria-label="Câmera">
          <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '1' }}>
            <video ref={leitor.videoRef} className="h-full w-full object-cover" />

            {/* Visor: só decoração, a instrução está escrita abaixo. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-8 rounded-l border-2 border-lime"
            />

            {leitor.estado !== 'lendo' ? (
              <p
                role="status"
                className="absolute inset-0 flex items-center justify-center px-6 text-center text-body-m text-on-brand"
              >
                {leitor.estado === 'iniciando' && 'Abrindo a câmera…'}
                {leitor.estado === 'sem-permissao' &&
                  'Você precisa autorizar a câmera nas configurações do navegador. Ou use a galeria, ou digite os números.'}
                {leitor.estado === 'sem-camera' &&
                  'Não achamos uma câmera neste aparelho. Use a galeria ou digite os números.'}
                {leitor.estado === 'erro' &&
                  'A câmera não conseguiu ler. Use a galeria ou digite os números.'}
              </p>
            ) : null}
          </div>

          <p className="mt-4 text-center text-body-m text-on-brand">
            Aponte para o QR code no rodapé da nota.
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {leitor.temLanterna ? (
              <Button
                variant="secondary"
                size="m"
                icon="flash"
                onClick={() => void leitor.alternarLanterna()}
                aria-pressed={leitor.lanternaLigada}
              >
                {leitor.lanternaLigada ? 'Desligar a luz' : 'Acender a luz'}
              </Button>
            ) : null}

            <Button
              variant="secondary"
              size="m"
              icon="image"
              onClick={() => arquivoRef.current?.click()}
            >
              Galeria
            </Button>

            <Button variant="secondary" size="m" icon="keyboard" onClick={() => setModo('chave')}>
              Digitar chave
            </Button>
          </div>

          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            className="gm-sr"
            aria-label="Escolher foto da nota na galeria"
            onChange={(evento) => void lerDaGaleria(evento)}
          />
        </section>
      ) : (
        <section className="flex flex-1 flex-col px-5 pt-6" aria-label="Digitar a chave">
          <Card>
            <form onSubmit={enviarChave} className="flex flex-col gap-4" noValidate>
              <TextField
                label="Chave de acesso"
                hint="São os 44 números impressos perto do QR code."
                inputMode="numeric"
                autoFocus
                value={formatarChave(chave)}
                onChange={(evento) => setChave(limparChave(evento.target.value))}
              />
              <p className="text-caption text-ink-muted" aria-live="polite">
                {`${limparChave(chave).length} de 44 números`}
              </p>

              {/* Dito antes de enviar, não depois de falhar: o portal do DF só
                  abre a nota pelo QR, porque confere um código que viaja dentro
                  dele e não está nos 44 números. */}
              <p className="text-caption text-ink-muted">
                Em notas do Distrito Federal o portal só abre pelo QR code. Se a chave não passar,
                volte e leia o QR.
              </p>

              <Erro mensagem={erro} />

              <Button
                type="submit"
                fullWidth
                disabled={limparChave(chave).length !== 44 || enviando}
              >
                {enviando ? 'Enviando…' : 'Ler esta nota'}
              </Button>
            </form>
          </Card>

          <Button
            variant="ghost"
            fullWidth
            icon="scan"
            className="mt-4"
            onClick={() => {
              setErro(null);
              setModo('camera');
            }}
          >
            Usar a câmera
          </Button>
        </section>
      )}

      {modo === 'camera' ? (
        <div className="px-5 pb-8 pt-4">
          <Erro mensagem={erro} />
          <p className="mt-4 text-center text-body-s text-on-brand opacity-80">
            <Icon name="help" size={16} className="mr-1 inline" />
            Não está conseguindo?{' '}
            <a href="/ajuda" className="underline">
              Veja como
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
