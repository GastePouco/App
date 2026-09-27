# Manual da aplicação — o que existe hoje

> Situação em **27/09/2026**. Cada linha foi conferida no código, não na
> memória. O que está em desenvolvimento está no fim, separado do que funciona —
> e há uma seção no meio para o que é mais traiçoeiro: o que está **ligado mas
> não entrega**.

## O que é

Um PWA de controle de gastos no varejo. A pessoa lê o QR code da nota fiscal
(NFC-e), o app guarda itens e preços, mostra para onde foi o dinheiro, compara
cada preço com a média da região — que vem das notas lidas pela comunidade — e
recompensa cada leitura com pontos, níveis e ranking.

Três aplicações: o app das pessoas, a API e o painel administrativo.

## Como acessar

| O quê | Endereço local | Comando |
|---|---|---|
| App | `http://127.0.0.1:5173` | `pnpm --filter @gastemenos/web dev` |
| Painel | `http://127.0.0.1:5174` | `pnpm --filter @gastemenos/admin dev` |
| API | `http://127.0.0.1:3001/v1` | `pnpm --filter @gastemenos/api dev` |
| Swagger | `http://127.0.0.1:3001/docs` | só fora de produção |

Contas do seed: `camila.alves@email.com` (a persona da demonstração) e
`admin@gastemenos.com.br` (operação), ambas com senha `Economia2026`.

---

## Funciona hoje

### Acesso

- **Cadastro** com nome, e-mail, senha e CEP, com aceite de termos obrigatório
  (o botão diz por que está desabilitado, em vez de ficar cinza em silêncio).
- **Confirmação por código de 6 dígitos**, que morre depois de cinco erros.
- **Entrar com Google**, com PKCE e `state` guardados em cookie assinado — a
  API não tem sessão de servidor.
- **Recuperar senha** por link, sem nunca revelar se o e-mail tem conta.
- **Sessão que se mantém** pelo cookie de refresh rotativo, com detecção de
  reutilização e tolerância à renovação perdida.
- **Aparelhos conectados**: ver e desconectar, um a um ou todos.

### Leitura de nota fiscal

- **Câmera** (`BarcodeDetector`, com `@zxing/browser` de reserva), **foto da
  galeria** e **digitar os 44 números** — três caminhos, sempre visíveis.
- **Chave validada no aparelho** pelo dígito verificador, antes de gastar rede.
- **Sem internet, a leitura não se perde**: vai para o IndexedDB e sobe quando a
  conexão voltar.
- **Cada nota vale uma vez** no sistema inteiro, não por pessoa.
- **Respeito ao portal**: 1 requisição por segundo por UF, User-Agent
  identificado, 3 tentativas, cache de 24 h.
- **UFs atendidas: DF e SP.** Nos dois, a leitura é pelo **QR code**: a consulta
  por chave digitada tem captcha em ambos os portais (medido, não suposto).
- Falha de leitura guarda a página por 30 dias, **sem o CPF**, para conserto do
  parser pelo painel.

### Gastos

- Total do mês, comparação com o mês anterior e quanto falta para o orçamento.
- Rosca por categoria e barras por semana, **com tabela em texto** ao lado — o
  gráfico nunca é a única forma de ler o número.
- Períodos: mês, trimestre e ano.
- Detalhe da nota item a item, com o preço de cada um contra a média da região.
- Excluir uma nota estorna os pontos dela.

### Preços da região

- Histórico de preço por produto, com mínimo, máximo e mediana.
- Onde está mais barato agora, por loja.
- Alerta de queda de preço por produto.
- **Piso de anonimato**: um preço só aparece com pelo menos 5 notas de 3 pessoas
  distintas, e isso vale na **gravação**, não só na exibição.

### Lista de compras

- Itens marcáveis, com estimativa de quanto vai custar.
- **Comparação da lista inteira por mercado** — não item a item, porque ninguém
  dirige a três lugares para economizar dois reais.
- Sugestão de recompra pelo intervalo mediano entre compras do mesmo produto.

### Ofertas

- Quedas de preço detectadas nas notas da comunidade.
- Ofertas patrocinadas, **sempre com o selo "Patrocinado"** e no máximo uma por
  página.
- Confirmar que a oferta era verdade, o que rende pontos.

### Jogo

- Pontos por nota lida, mercado novo, sequência semanal, confirmação de oferta e
  convite aceito.
- 13 níveis com nome, 9 selos com progresso recalculado (não incrementado).
- Sequência de semanas, de segunda a domingo no fuso de Brasília.
- Ranking mensal: amigos ou região × economia, compras ou pontos.
- Convidar amigos por código; o ponto só entra quando o convidado lê a primeira
  nota.
- Cartão de compartilhamento desenhado em canvas, 1080×1920.

### Notificações

- Central com filtros (todas, preços, jogo) e agrupamento por dia.
- Interruptor por tipo, resumo semanal e **horário de silêncio** que atravessa a
  meia-noite.
- Avisos de conta (segurança) ignoram os interruptores, de propósito.

### Conta, privacidade e acessibilidade

- Dados pessoais; trocar e-mail exige código no endereço novo.
- Alterar senha, com as regras conferidas enquanto se digita.
- **Baixar meus dados**: ZIP com JSON e CSV (conta, notas, itens, listas,
  pontos, selos), link válido por 7 dias.
- **Pausar a conta** (some do ranking, para notificações, congela a sequência) e
  **encerrar** com 30 dias de carência e confirmação escrita.
- **Acessibilidade**: três temas (claro, escuro, alto contraste), três tamanhos
  de texto, modo fácil, reduzir movimento, ler em voz alta e vibração.

### Ajuda

Perguntas por tema, busca que atravessa os tópicos e ignora acento, e contato
por e-mail.

### Painel administrativo (CRM)

| Tela | O que faz |
|---|---|
| Painel | taxa de sucesso da leitura, contribuintes na semana, catálogo, contas |
| Ofertas | ofertas e parceiros; com parceiro, nasce patrocinada |
| Catálogo | fila de revisão por impacto e fusão de duplicados |
| Notas com falha | triagem com a página guardada, exibida como texto |
| Contas | busca por e-mail **exato**, e-mail mascarado, fila de atenção |
| Auditoria | quem fez o quê, incluindo quem **consultou** uma conta |

---

## Ligado, mas ainda não entrega

Esta seção existe porque é o tipo de coisa que passa por pronta numa
demonstração e falha no dia seguinte.

| O quê | Estado real |
|---|---|
| **E-mail** | **Nada é enviado.** Sem SMTP, o código vai para o log da API (é assim que se testa o cadastro). Com SMTP configurado, o serviço registra um aviso dizendo que o envio não foi implementado. Confirmação, recuperação de senha e avisos de segurança dependem disso. |
| **Notificação push** | A inscrição do aparelho é guardada e **nada é enviado**: não há chamada de envio em lugar nenhum. A central de notificações dentro do app funciona. |
| **Localização das lojas** | Toda loja recebe as coordenadas do **centro de Brasília**, fixas no código. Para o DF isso aproxima; para São Paulo coloca a loja na cidade errada — e a região (geohash) é o que agrupa os preços. **Precisa ser resolvido antes de os dados de SP valerem alguma coisa.** |

---

## Em desenvolvimento

### Leitura de notas

- **O parser do DF nunca leu uma nota real.** O de SP está validado contra
  dados de uma nota verdadeira; do DF não temos nem isso.
- **Outras UFs**: cada portal tem endereço e página próprios, e cada um pede um
  adaptador.
- **Importação dos 50 mil XMLs do PDV**: desenho escolhido, esperando a decisão
  entre importar para cá ou ler por API do sistema de origem.

### Módulo Solana (fase 9)

Nada implementado. A direção está em `10-MODULO-SOLANA.md`, revisão 2: feed de
preço por SKU, índice da cesta por cidade, mercado de dados por x402 com repasse
a quem escaneou. Apostas em ordem: Switchboard, atestado de compra, zkTLS.

### Segurança e conta

- **Verificação em duas etapas**: o campo existe no banco, a implementação não.
- **Login com Google no painel**: o `redirect_uri` aponta só para o domínio do
  app, e a tela do painel não tem o botão.

### Produto

- Importar notas pelo CPF (programa Nota Legal), com consentimento.
- Painel para o parceiro cadastrar as próprias ofertas.
- Pausar ou encerrar conta de alguém pelo painel — fora de propósito, hoje.
- Aplicativos nativos nas lojas.

### Entrega

- **Deploy**: imagens Docker prontas e testadas (API, app e painel sobem, migram
  e respondem), `docker-compose.producao.yml` pronto — falta apontar o Coolify.
- **Repositório**: o código está só nesta máquina, sem remoto. O Colosseum pede
  link do GitHub na submissão.

---

## O que é garantido, e tem teste

- **Acessibilidade**: 27 rotas do app passam por axe nas três combinações de
  tema, tamanho de texto e largura — zero violações. Lighthouse: acessibilidade,
  boas práticas e SEO em 100; desempenho 98.
- **PWA**: instalável, com service worker e abrindo sem rede.
- **Privacidade**: CPF nunca é guardado; preço entra na base por HMAC, sem
  ligação com a conta; exclusão em 30 dias com carência.
- **Segurança**: auditoria completa em `16-SEGURANCA-AUDITORIA.md`.
- **Números**: 162 testes na API, 81 de ponta a ponta, 106 nos pacotes.

## Onde ler mais

`01-PRD.md` (produto), `02-ARQUITETURA.md`, `04-API.md`, `06-NFCE-LEITURA.md`,
`07-GAMIFICACAO.md`, `08-ACESSIBILIDADE.md`, `09-SEGURANCA-LGPD.md`,
`10-MODULO-SOLANA.md`, `12-PROGRESSO.md` (o diário das fases, com os erros),
`13-SUPABASE.md`, `14-DEPLOY.md`, `15-CRM.md`, `16-SEGURANCA-AUDITORIA.md`.
