import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Switch, Toast } from '@gastemenos/ui';
import { TelaDeAjuste } from './TelaDeAjuste.js';
import { api, baixarArquivo } from '../../lib/api.js';

/** `referencia/telas/Notificacoes.dc.html` e `Privacidade.dc.html` */

interface Preferencias {
  notifyPriceDrop: boolean;
  notifyListOffer: boolean;
  notifyReminder: boolean;
  notifyRanking: boolean;
  notifyStreak: boolean;
  weeklyEmail: boolean;
  notifySponsored: boolean;
  sharePrices: boolean;
  showInRegion: boolean;
  showName: boolean;
  personalizeOffers: boolean;
  sharePartners: boolean;
  quietStart: string;
  quietEnd: string;
}

function usePreferencias() {
  const fila = useQueryClient();

  const preferencias = useQuery({
    queryKey: ['preferencias'],
    queryFn: () => api.get<Preferencias>('/me/preferences'),
  });

  const alterar = useMutation({
    mutationFn: (mudanca: Partial<Preferencias>) => api.patch('/me/preferences', mudanca),
    onSuccess: () => fila.invalidateQueries({ queryKey: ['preferencias'] }),
  });

  return { preferencias, alterar };
}

export function Notificacoes(): React.ReactElement {
  const { preferencias, alterar } = usePreferencias();
  const dados = preferencias.data;

  return (
    <TelaDeAjuste
      titulo="Notificações"
      descricao="Escolha o que você quer receber. Avisos de segurança da conta chegam sempre."
    >
      {!dados ? (
        <p role="status" className="text-body-m text-ink-muted">
          Carregando…
        </p>
      ) : (
        <>
          <section aria-labelledby="precos">
            <h2 id="precos" className="mb-3 text-title-s text-ink">
              Preços
            </h2>
            <div className="overflow-hidden rounded-l">
              <Switch
                label="Queda de preço"
                description="Quando algo que você compra fica mais barato na sua região."
                checked={dados.notifyPriceDrop}
                onChange={(ligado) => alterar.mutate({ notifyPriceDrop: ligado })}
              />
              <Switch
                label="Ofertas dos itens da minha lista"
                checked={dados.notifyListOffer}
                onChange={(ligado) => alterar.mutate({ notifyListOffer: ligado })}
              />
              <Switch
                label="Lembrete de compra"
                description="Quando algo que você compra sempre parece estar acabando."
                checked={dados.notifyReminder}
                onChange={(ligado) => alterar.mutate({ notifyReminder: ligado })}
              />
            </div>
          </section>

          <section aria-labelledby="jogo">
            <h2 id="jogo" className="mb-3 text-title-s text-ink">
              Jogo
            </h2>
            <div className="overflow-hidden rounded-l">
              <Switch
                label="Ranking"
                description="Mudanças de posição entre amigos."
                checked={dados.notifyRanking}
                onChange={(ligado) => alterar.mutate({ notifyRanking: ligado })}
              />
              <Switch
                label="Sequência em risco"
                description="Domingo à tarde, se você ainda não leu nota na semana."
                checked={dados.notifyStreak}
                onChange={(ligado) => alterar.mutate({ notifyStreak: ligado })}
              />
            </div>
          </section>

          <section aria-labelledby="parceiros">
            <h2 id="parceiros" className="mb-3 text-title-s text-ink">
              Parceiros
            </h2>
            <div className="overflow-hidden rounded-l">
              {/*
                Começa desligado e assim continua até a pessoa ligar: conteúdo
                pago por notificação exige consentimento ativo
                (docs/09-SEGURANCA-LGPD.md).
              */}
              <Switch
                label="Ofertas patrocinadas"
                description="Avisos pagos por supermercados parceiros. Vêm sempre marcados como Patrocinado."
                checked={dados.notifySponsored}
                onChange={(ligado) => alterar.mutate({ notifySponsored: ligado })}
              />
              <Switch
                label="Resumo semanal por e-mail"
                checked={dados.weeklyEmail}
                onChange={(ligado) => alterar.mutate({ weeklyEmail: ligado })}
              />
            </div>
          </section>

          <Card tone="sunken" className="gap-2">
            <span className="text-label text-ink">Horário de silêncio</span>
            <span className="text-body-s text-ink-muted">
              {`Entre ${dados.quietStart} e ${dados.quietEnd} as notificações ficam guardadas na central, sem tocar o celular.`}
            </span>
          </Card>
        </>
      )}
    </TelaDeAjuste>
  );
}

/** `referencia/telas/Privacidade.dc.html` */
export function Privacidade(): React.ReactElement {
  const { preferencias, alterar } = usePreferencias();
  const dados = preferencias.data;

  const [aviso, setAviso] = useState<string | null>(null);
  const [exportacao, setExportacao] = useState<string | null>(null);

  const pedirDados = useMutation({
    mutationFn: () => api.post<{ id: string }>('/me/export'),
    onSuccess: (resposta) => {
      setExportacao(resposta.id);
      setAviso('Estamos montando seu arquivo. Avisamos por e-mail quando ficar pronto.');
    },
  });

  return (
    <TelaDeAjuste
      titulo="Privacidade e dados"
      descricao="O que sai da sua conta e para onde. Você decide, e pode mudar quando quiser."
    >
      {!dados ? (
        <p role="status" className="text-body-m text-ink-muted">
          Carregando…
        </p>
      ) : (
        <>
          <section aria-labelledby="precos-comunidade">
            <h2 id="precos-comunidade" className="mb-3 text-title-s text-ink">
              Preços da comunidade
            </h2>
            <div className="overflow-hidden rounded-l">
              <Switch
                label="Compartilhar meus preços"
                description="Os preços das suas notas entram na média da região sem nenhuma ligação com você. É isso que faz o app saber onde está mais barato."
                checked={dados.sharePrices}
                onChange={(ligado) => alterar.mutate({ sharePrices: ligado })}
              />
            </div>
          </section>

          <section aria-labelledby="ranking-privacidade">
            <h2 id="ranking-privacidade" className="mb-3 text-title-s text-ink">
              Ranking
            </h2>
            <div className="overflow-hidden rounded-l">
              <Switch
                label="Aparecer no ranking da região"
                description="Entre amigos você continua aparecendo — foi você quem escolheu cada um."
                checked={dados.showInRegion}
                onChange={(ligado) => alterar.mutate({ showInRegion: ligado })}
              />
              <Switch
                label="Mostrar meu nome"
                description="Desligado, você aparece como Economizador anônimo, sem perder a sua posição."
                checked={dados.showName}
                onChange={(ligado) => alterar.mutate({ showName: ligado })}
              />
            </div>
          </section>

          <section aria-labelledby="parceiros-privacidade">
            <h2 id="parceiros-privacidade" className="mb-3 text-title-s text-ink">
              Parceiros
            </h2>
            <div className="overflow-hidden rounded-l">
              <Switch
                label="Usar meu perfil para ordenar ofertas"
                description="Só dentro do app. Nada sai daqui."
                checked={dados.personalizeOffers}
                onChange={(ligado) => alterar.mutate({ personalizeOffers: ligado })}
              />
              <Switch
                label="Compartilhar dados agregados com parceiros"
                description="Números de consumo da região, sem nome e sem ligação com você. Começa desligado."
                checked={dados.sharePartners}
                onChange={(ligado) => alterar.mutate({ sharePartners: ligado })}
              />
            </div>
          </section>

          <section aria-labelledby="seus-dados">
            <h2 id="seus-dados" className="mb-3 text-title-s text-ink">
              Seus dados
            </h2>
            <Card className="gap-3">
              <p className="text-body-s text-ink-muted">
                Você pode levar tudo o que é seu: conta, notas, itens, listas, pontos e selos, em
                um arquivo com planilhas e JSON. O link vale por 7 dias.
              </p>
              <Button
                variant="secondary"
                fullWidth
                icon="download"
                disabled={pedirDados.isPending}
                onClick={() => pedirDados.mutate()}
              >
                {pedirDados.isPending ? 'Pedindo…' : 'Baixar meus dados'}
              </Button>

              {exportacao ? (
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() =>
                    void baixarArquivo(
                      `/me/export/${exportacao}/download`,
                      'meus-dados-gastemenos.zip',
                    ).catch((falha) =>
                      setAviso(
                        falha instanceof Error
                          ? falha.message
                          : 'O arquivo ainda não está pronto. Tente em instantes.',
                      ),
                    )
                  }
                >
                  Baixar quando estiver pronto
                </Button>
              ) : null}
            </Card>
          </section>

          {aviso ? <Toast>{aviso}</Toast> : null}

          <Button variant="ghost" fullWidth icon="trash" href="/perfil/encerrar">
            Encerrar minha conta
          </Button>
        </>
      )}
    </TelaDeAjuste>
  );
}
