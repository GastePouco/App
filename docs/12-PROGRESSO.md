# Progresso da implementação

Estado de cada fase de `11-ROADMAP-E-PROMPTS.md`. Atualize ao concluir uma fase.

| Fase | O que é | Estado |
| --- | --- | --- |
| 0 | Monorepo e infraestrutura | ✅ **EXECUTADO** |
| 1 | Design system em código | ✅ **EXECUTADO** |
| 2 | Primeiro uso e acesso | ✅ **EXECUTADO** |
| 3 | Ler nota fiscal | 🟡 **PARCIAL** — tudo implementado e testado; falta validar contra uma nota real do DF |
| 4 | Início, gastos e detalhe da nota | ✅ **EXECUTADO** |
| 5 | Preços da região, lista e ofertas | ✅ **EXECUTADO** |
| 6 | Jogo: níveis, selos, ranking, compartilhar | ✅ **EXECUTADO** |
| 7 | Minha conta, notificações e ajuda | ✅ **EXECUTADO** |
| 8 | Polimento, acessibilidade e lançamento | 🟡 **PARCIAL** — tudo pronto e medido; falta subir no servidor |
| 9 | Módulo Solana | ⬜ PLANEJADO |

## Como conferir o que já existe

```bash
pnpm i
docker compose up -d db redis
pnpm --filter @gastemenos/api db:migrate
pnpm --filter @gastemenos/api db:seed
pnpm dev                      # web :5173, api :3001 (Swagger em /docs)
pnpm lint && pnpm typecheck && pnpm test
RATE_LIMIT_TEST_FACTOR=20 pnpm dev     # a suíte e2e precisa da API com o fator
pnpm --filter @gastemenos/web test:e2e
```

Abra `http://127.0.0.1:5173/dev/ui` para o design system nos 3 temas e 3 tamanhos de texto.

## Fase 0 — executado

Monorepo pnpm + Turborepo, `apps/web` (React 18 + Vite 6 + Tailwind + Router +
TanStack Query + PWA), `apps/api` (NestJS 10 + Prisma 6 + Postgres 16),
`packages/tokens`, `packages/ui`, `packages/shared`, Docker Compose, ESLint,
Prettier, Vitest, Jest, Playwright e CI no GitHub Actions.

`packages/shared` concentra o que web e API não podem divergir: chave de acesso
de 44 dígitos (modelo 65, DV módulo 11), dinheiro em centavos, geohash de
região com os 8 vizinhos, tabela de pontos e níveis.

O seed confere os próprios números contra as telas de referência e falha se
divergirem: R$ 1.284,60 em setembro, o rateio por categoria, R$ 4.212,90 no
trimestre, R$ 12.940,30 no ano, nível 12 com 460 pontos no nível.

### Decisões de ambiente

- **Postgres em 5435 e API em 3001.** As portas 5432–5434 e 3000 já estavam
  ocupadas na máquina de desenvolvimento.
- **Endereços em `127.0.0.1`, não `localhost`.** No Windows `localhost` resolve
  `::1` primeiro, e nem o Prisma nem o Playwright alcançavam o bind.
- **`consistent-type-imports` desligado em `apps/api`.** O NestJS resolve a
  injeção pelo tipo do parâmetro do construtor em tempo de execução;
  `import type` apaga o símbolo e o app sobe para quebrar na primeira
  requisição.
- **`SMTP_URL` vazio por padrão.** Sem SMTP o código de 6 dígitos vai para o log
  da API, que é o que permite testar o cadastro sem caixa postal.

## Fase 1 — executado

Os 17 componentes de `design-system/bundle-referencia/` portados para TSX em
`packages/ui`, com as props de `index.d.ts`. `AppearanceProvider` escreve
`data-theme`, `data-text-size` e `data-reduce-motion` no `<html>`.

Os componentes recebem o link por contexto em vez de importar o React Router,
para o design system continuar utilizável fora do app.

47 testes de unidade (axe por componente, mais papéis, rótulos e estado) e 27
do Playwright nas três combinações exigidas por `08-ACESSIBILIDADE.md`.

### Dois defeitos de acessibilidade corrigidos no design system

Encontrados pelo axe em navegador de verdade — no jsdom a regra de contraste é
pulada em silêncio, porque não há canvas.

1. **Selo "Patrocinado": 4,42:1**, abaixo do mínimo AA de 4,5:1. Justo no
   elemento que é obrigatório ser legível. A camada escura sobre o laranja
   virou clara: 7,3:1, e o selo continua destacado.
2. **Botão `danger` no tema escuro: 2,07:1.** O CSS fixava `color: #FFFFFF`,
   que funciona no tema claro (`--danger` é vermelho escuro) e quebra no escuro
   (`--danger` vira salmão claro). Criado o token `on-danger`, que inverte com
   o tema.

As duas divergências de `bundle.css` estão comentadas no lugar, com a medição,
para ninguém "restaurar" depois.

## Fase 2 — executado

**API, verificada contra o banco real:**

- `POST /auth/register`, `verify-email`, `resend-code`, `login`, `refresh`,
  `logout`, `forgot-password`, `reset-password`, `GET /auth/sessions`
- `GET /me`, `GET/PUT /me/profile`, `GET /me/preferences`
- Senha com Argon2id; access token de 15 min; refresh rotativo em cookie
  `httpOnly` com detecção de reutilização (revoga a família inteira)
- Rate limit por rota: 5 logins/15 min, 1 reenvio/min, 3 pedidos de senha/15 min
- Persona e orçamento a partir das 5 respostas; 50 pontos ao confirmar o
  e-mail e 100 no perfil, sem crédito duplo

Fluxo conferido ponta a ponta: cadastro → código no log → confirmação →
**150 pontos**, com o segundo envio do perfil dando 0.

**Telas:** as 9 de primeiro uso e acesso, com 57 testes do Playwright passando
nos três temas — incluindo o fluxo inteiro em contraste, letra Muito grande e
320px de largura.

### Decisões das telas

- **Radio e checkbox nativos no perfil de consumo**, não `button` com
  `role="radio"`. Um radiogroup ARIA só está certo se as setas do teclado
  navegarem entre as opções, e isso o navegador já faz de graça com o elemento
  real (docs/08-ACESSIBILIDADE.md, "Elementos reais").
- **Um campo só para o código de 6 dígitos**, não seis caixinhas. Seis campos
  quebram o preenchimento automático do celular, atrapalham o leitor de tela e
  tornam corrigir um dígito um pequeno inferno para quem tem pouca firmeza no
  toque. `autoComplete="one-time-code"` faz o sistema oferecer o código.
- **A tela do Google é do GasteMenos**, não uma imitação da do Google, e diz o
  que o app recebe antes de mandar para lá.
- **O access token vive em memória, nunca em localStorage**, e a sessão volta
  pelo cookie httpOnly ao recarregar. Um 401 dispara uma renovação e repete a
  chamada, com uma renovação por vez — o refresh é rotativo e duas em paralelo
  se queimariam.
- **Ícones `eye`/`eyeOff` acrescentados ao design system**: o protótipo da tela
  Entrar já usava esse desenho, mas ele não vinha no bundle de referência.

### Limites de requisição e a suíte

As rotas de acesso têm limite por IP e os três projetos do Playwright rodam do
mesmo IP. `RATE_LIMIT_TEST_FACTOR` multiplica os limites em desenvolvimento; o
boot **recusa** esse valor em produção. Afrouxar o limite para o teste passar
seria trocar uma proteção real por um check verde.

### Rota de desenvolvimento

`GET /v1/dev/codigo?email=` devolve o código de confirmação, para o teste de
ponta a ponta não precisar raspar log. Três travas, porque uma só fica a uma
linha de um incidente: o módulo só é registrado fora de produção, o controller
confere `NODE_ENV` a cada chamada, e a rota fica fora do Swagger.

### Acrescentado ao schema

`VerificationCode` (+ enum `VerificationKind`) não existia em
`prisma/schema.prisma`, mas `04-API.md` pede código de 6 dígitos e link de
recuperação. Guardado como hash, com `expiresAt`.


## Fase 3 — parcial

**Implementado e testado (34 testes na API):**

- Parser da NFC-e por rótulo visível, não por classe CSS nem posição, com
  caminho de segurança pelo texto corrido da linha
- Adaptador do DF e registro por código IBGE da UF
- Fila BullMQ com 3 tentativas e espera crescente; buscador com 1 requisição
  por segundo por UF, User-Agent identificado e cache de 24 h por chave
- Deduplicação **global** pela chave de acesso
- Casamento de produto por GTIN → alias da loja → descrição normalizada
- Observação de preço com `userHash`, nunca o `userId`
- Economia calculada contra a média aparada da região, respeitando o anonimato
  mínimo de 5 notas e 3 pessoas
- Pontos numa transação com a gravação, com bônus de mercado novo uma vez por
  CNPJ; excluir a nota estorna
- SSE com teto de 30 s, e `GET /receipts`, `DELETE /receipts/:id`
- Telas Escanear (BarcodeDetector com reserva `@zxing/browser`, lanterna,
  galeria, digitar chave, vibração) e NotaLida (ConfettiBurst que respeita
  movimento reduzido), mais fila local em IndexedDB para leitura sem internet

### ⚠️ O que **não** está validado

O critério de aceite da fase diz "ler um QR real do DF registra a nota em menos
de 10 s". **Isso não foi verificado.** Não houve como capturar uma nota real do
DF nem chamar o portal da SEFAZ a partir do ambiente de desenvolvimento.

A fixture em `test/fixtures/nfce/df/nota-sintetica.html` é escrita à mão sobre
a estrutura do modelo padrão da SEFAZ. Os testes provam que o parser é
consistente com essa estrutura; **não** provam que ele lê o portal do DF. Um
parser testado só contra a fixture que o próprio autor escreveu está testando
as suposições do autor.

O que fazer antes de habilitar o DF em produção está em
`test/fixtures/nfce/df/README.md`, incluindo quais capturas valem a pena ter e
o lembrete de remover o CPF do consumidor antes de commitar.

### Decisões

- **Chave inventada à mão é recusada pela validação.** Os testes calculam o
  dígito verificador de verdade — o que custou duas correções e é exatamente o
  comportamento que se quer.
- **`prefers-reduced-motion` indisponível significa não animar.** Nem toda
  webview tem `matchMedia`; sem conseguir perguntar, confete indesejado
  incomoda quem tem sensibilidade a movimento e a falta dele não machuca
  ninguém.
- **Erro de portal volta para a fila; erro de parse não.** Tentar de novo com o
  mesmo HTML dá o mesmo resultado e só gasta visita ao portal.
- **A URL do QR é apagada depois de processar** (docs/09, "Minimização").
- **`eslint-plugin-react-hooks` ativado** no web e no design system.


## Fase 4 — executado

Endpoints `/spending/summary`, `/categories`, `/weeks`, `/insights`; gráficos
`DonutChart` e `WeeklyBars` em SVG próprio; telas Início, Início no modo fácil,
Gastos e Detalhe da nota; cache no IndexedDB para o app abrir sem rede.

**O aceite está provado por teste** (`test/gastos.spec.ts`, 12 casos): o seed
reproduz R$ 1.284,60 em setembro, R$ 4.212,90 no trimestre, R$ 12.940,30 no
ano, as 5 categorias uma a uma e os 42% de Mercearia do miolo da rosca. Se
alguém mexer num preço do seed ou num cálculo, a divergência aparece ali, não
três telas depois.

### Defeito de daltonismo na paleta dos gráficos

A paleta `chart-1..5` foi medida com o validador, não avaliada no olho. Na
ordem de uso da tela Gastos:

| Tema | Separação para daltonismo (pior par vizinho) |
| --- | --- |
| Claro | ΔE 18,5 — passa |
| Escuro | **ΔE 4,7 (protan)** — abaixo do piso de 6 |
| Alto contraste | **ΔE 3,0 (deutan)** — abaixo do piso de 6 |

O par ruim era Hortifrúti (`chart-4`) contra Bebidas (`chart-2`) — **fatias
vizinhas da rosca**. Abaixo de ΔE 6 nem legenda escrita resolve: as duas são
literalmente a mesma cor para quem tem protanopia ou deuteranopia.

`chart-4` foi trocado **só no escuro e no alto contraste**, com valores
calculados e reconferidos: `#6BC7DA` (ΔE 13,4) e `#00708F` (ΔE 14,3). O tema
claro passa e não foi tocado. **Esta é uma mudança de cor de marca** — se o
time de design discordar, o caminho é escolher outro valor que passe no
validador, não voltar ao anterior.

Os outros avisos do validador (faixa de luminosidade e piso de croma) foram
deixados como estão: são sinais de qualidade da paleta, não falhas de leitura,
e mexer neles seria redesenhar a identidade.

### Decisões dos gráficos

- **Cor segue a categoria, nunca a posição no ranking.** Quem aprendeu
  "Mercearia é verde" não pode ver isso mudar porque um mês trocou a ordem.
- **Vão de 2px entre fatias, não borda.** Borda escurece; o vão separa e é o
  que distingue fatias vizinhas sem depender de cor.
- **Nenhum número em cima de cada barra.** O valor de cada semana está na lista
  abaixo, que é a versão em tabela do mesmo dado.
- **Todo gráfico tem `role="img"` com resumo escrito** e uma lista de valores.
  Nenhum valor mora só no desenho.
- **Uma série, uma cor.** Colorir cada barra de um tom diferente gastaria o
  único canal livre repetindo o que o comprimento já diz.

### Dois bugs que os testes pegaram

1. **O teste de integração apagava os dados do seed.** Ele limpava "todas as
   notas desta loja" usando o CNPJ da fixture, que é o mesmo do Supermercado
   Vila Nova do seed — levava junto as 15 notas de setembro da Camila. A
   limpeza passou a ser por usuário, com cascade.
2. **Ler uma nota não renomeia a loja.** A nota traz a razão social em
   maiúsculas; sobrescrever o nome curado pioraria a tela a cada leitura.


## Fase 5 — executado

Módulo de preços com agregação por geohash, lista de compras com sugestão de
recompra, ofertas patrocinadas e da comunidade, e as telas Preços, Lista e
Ofertas. 14 testes de aceite em `test/precos.spec.ts`, 60 na API no total.

**O aceite está provado:** o histórico do café reproduz a queda de R$ 24,90 em
junho para R$ 21,40 em setembro, as lojas vêm ordenadas do mais barato, a lista
estima R$ 146,72, toda oferta patrocinada carrega o selo e região sem dados
devolve `enoughData: false` — que é o que faz a tela dizer "Ainda juntando
preços desta região" em vez de desenhar um gráfico vazio.

### O anonimato é aplicado na gravação, não só na leitura

Um agregado que não pode ser mostrado **não é gravado**. Filtrar só na leitura
deixaria no banco uma tabela de "quanto o fulano pagou no produto X", que é
exatamente o que o anonimato mínimo existe para impedir. Com 5 notas de 3
pessoas, ninguém é identificável; abaixo disso, dois vizinhos deduziriam o que
o terceiro comprou.

A observação guarda `userHash` (HMAC), nunca o `userId`, e a região é o geohash
de 5 caracteres — nunca o CEP, nunca a coordenada da loja.

### Decisões

- **"Onde sai mais barato" compara a lista inteira, não item a item.** A loja
  mais barata em cada produto costuma ser uma diferente; mandar a pessoa a
  quatro mercados para economizar R$ 6 é mau conselho. E só entra loja com
  preço recente para a maioria dos itens — uma loja com preço de 2 dos 12
  pareceria a mais barata só por ter menos a somar. A cobertura vai na resposta
  para a tela poder dizer isso.
- **A recompra usa mediana, não média.** Uma compra esquecida de três meses
  atrás puxaria a média e o aviso chegaria tarde. Sugere a 80% do intervalo,
  porque avisar no dia exato chega tarde para quem faz compra semanal.
- **Queda de preço só a partir de 5%.** Variação de centavos não é notícia e
  encheria a tela de ruído.
- **O job recalcula do zero os últimos 2 dias**, em vez de somar
  incrementalmente: uma nota excluída tira observações do passado, e um
  agregado incremental carregaria o erro para sempre.
- **No máximo uma oferta patrocinada por página**, e `sponsored` vai em toda
  resposta da API — quem consome não recebe conteúdo pago sem saber que é pago.
- **O gráfico de histórico tem uma série só.** O que a pessoa pagou entra como
  linha de referência, não como segunda série: duas escalas no mesmo gráfico é
  o erro clássico de eixo duplo.


## Fase 6 — executado

Ranking mensal (amigos e região × 3 categorias), 9 selos com progresso,
sequência semanal, convites, job de fechamento do mês, e as telas Ranking,
Conquistas e Compartilhar. 18 testes de aceite; 78 na API no total.

**O ranking é calculado, não plantado.** O seed dá notas e pontos de verdade
aos cinco amigos, e o teste confere a ordem e os valores contra
`Ranking.dc.html` nas três categorias. Fosse uma tabela de posições fixa, o
teste provaria só que alguém digitou o pódio certo.

### ⚠️ Um padrão perigoso, encontrado do pior jeito

O banco de desenvolvimento foi **apagado por completo** durante esta fase. A
causa:

```ts
afterEach(() => prisma.user.deleteMany({ where: { id: userId } }))
```

O `beforeAll` falhou por um erro de injeção, então o `beforeEach` nunca rodou e
`userId` ficou `undefined`. **O Prisma trata `undefined` como "filtro não
informado"** — a limpeza virou "apague todos os usuários" e levou o seed junto.

Num banco de teste isso custou um `db:seed`. Contra staging, ou contra um banco
que alguém apontou errado no `.env`, teria custado os dados de todo mundo.

A correção não é "tomar cuidado": toda remoção em teste passa agora por
`test/limpeza.ts`, que ignora id vazio. O incidente está documentado lá, no
arquivo, para quem for mexer entender por que a indireção existe.

### Decisões

- **O progresso dos selos é recalculado, não incrementado.** Um contador que só
  sobe mentiria quando a pessoa exclui uma nota: ela veria 15/15 no "Carrinho
  Esperto" com 14 notas no histórico. Selo já conquistado não se perde —
  `unlockedAt` fica gravado.
- **A semana é de segunda a domingo no fuso de Brasília.** 22h de domingo em
  Brasília é segunda em UTC; sem o ajuste, a nota cairia na semana seguinte e a
  pessoa perderia a sequência por um detalhe invisível para ela. Há teste
  para isso.
- **Quem esconde o nome mantém a posição.** Vira "Economizador anônimo" no
  lugar que conquistou; esconder o nome não pode custar o pódio.
- **Conta pausada some do ranking**, em qualquer visão: pausar é sair de vista,
  não só parar de receber notificação.
- **O ponto do convite só entra quando o convidado lê a primeira nota.**
  Creditar no cadastro transformaria convite em fábrica de conta vazia.
- **O ranking ao vivo é calculado a cada pedido**; o snapshot serve para
  congelar o mês. Um pódio que muda depois de anunciado não é pódio.
- **O cartão é desenhado em canvas a 1080×1920**, não convertido de HTML:
  `html2canvas` erra fonte e sombra e pesa ~200 KB; aqui são ~60 linhas e o
  resultado é exato. As cores saem dos tokens lidos do `<html>`, então o cartão
  acompanha o tema sem uma segunda tabela de cores.


## Fase 7 — executado

Conta, sessões, preferências, pausa, exclusão agendada, exportação de dados,
Web Push e horário de silêncio na API; as telas Perfil, Dados pessoais, Login e
segurança, Alterar senha, Notificações, Privacidade e dados, Acessibilidade,
Pausar conta, Encerrar conta, Central de notificações e Ajuda no web.

21 testes de aceite da conta + 5 de sessão (104 na API no total) e um teste e2e
que percorre as 11 telas com axe nas 3 combinações de tema, tamanho e largura —
60 testes de ponta a ponta no total.

### ⚠️ Um logout que ninguém pediu

O e2e das telas de conta derrubava a sessão no meio do caminho, sempre no mesmo
lugar: a terceira navegação. No log da API, uma linha só:

```
WARN [SessoesService] Refresh reutilizado; revogando todas as sessões do usuário.
```

Não era ataque nenhum. Cada carregamento de página renova a sessão; a navegação
seguinte cancelou a resposta antes de o cookie novo ser gravado, o navegador
voltou com o token antigo — e a detecção de reutilização fez o que estava
escrito: revogou a família inteira. Em produção isso é a pessoa tocando num link
durante a renovação, ou o app aberto em duas abas.

A correção está em `SessoesService.rotacionar`: a sessão passa a apontar para a
que a substituiu (`Session.successorId`). Um token queimado que reaparece
**enquanto a sucessora nunca foi usada** é renovação perdida, e a API reemite a
partir dela. Se a sucessora já foi usada, são duas partes com token na mão, e
aí sim a família cai. `apps/api/test/sessoes.spec.ts` fixa as duas direções.

Vale registrar por que isso não afrouxa a segurança: a detecção existe para o
token roubado usado **em paralelo** com o legítimo — e é exatamente nesse caso
que a sessão sucessora está em uso.

### Decisões

- **O agrupamento "Hoje / Esta semana" fica no web, não na API.** Só o
  navegador conhece o fuso de quem está lendo: uma notificação das 23h em
  Brasília é "hoje" para a pessoa e "amanhã" para o servidor em UTC.
- **A busca da Ajuda atravessa os tópicos.** Quem digita "pausar" acha a
  resposta que mora em "Conta e privacidade" sem precisar adivinhar a aba;
  acento não conta ("precos" acha "preços").
- **Nada de botão de chat sem atendimento.** A tela Ajuda abre e-mail, com o
  horário escrito. Chat entra quando houver equipe de plantão.
- **Pausar aparece dentro de Encerrar conta, antes do formulário.** Quem só
  quer sumir por um tempo não precisa apagar três anos de histórico.
- **Confirmação por palavra, em maiúsculas.** `ENCERRAR` digitado à mão é o que
  separa a decisão do toque sem querer; minúscula não libera.
- **O BOM do CSV virou `String.fromCharCode(0xfeff)`.** Como caractere literal
  ele era invisível no fonte — e o ESLint, com razão, recusava.


## Banco de produção no Supabase — executado

Supabase entra **só como Postgres gerenciado e Storage**; a API continua sendo o
único cliente do banco. O porquê de cada decisão e os comandos estão em
`13-SUPABASE.md`.

O projeto está de pé: 4 migrations aplicadas, 29 tabelas, RLS em todas, nenhum
privilégio para `anon`/`authenticated`, balde `exportacoes` privado com ida e
volta de arquivo verificada. A prova que vale é de fora: com a chave publicável,
`/rest/v1/User`, `Receipt`, `PriceObservation`, `Session` e `Store` respondem
401 (`42501`). Falta só implantar API e web.

O `.env` continua apontando para o Postgres do Docker. Os comandos que falam com
produção usam `.env.supabase`, fora do git — misturar os dois é como um teste
apaga banco de verdade.

A base do Supabase está com o seed de demonstração, e a aplicação local roda
contra ela com `pnpm --filter @gastemenos/api dev:supabase`. Conferido trocando
um nome direto no banco e vendo o valor novo sair em `/v1/me`.

### O seed deixou de poder apagar base remota

O seed apaga todas as tabelas antes de inserir — o que é o certo em
desenvolvimento e inaceitável em qualquer outro lugar. `NODE_ENV` não protegia
nada: quem roda o comando na própria máquina está em "development" mesmo com a
`DATABASE_URL` apontando para um banco gerenciado.

Agora, fora de localhost, ele **exige a base vazia e só insere**. Não foi
acrescentada uma confirmação para digitar: confirmação a gente digita no
automático, e o `afterEach` da fase 6 mostrou o preço disso. Tirar a capacidade
é diferente de pedir permissão.

O que mudou no repositório:

- `directUrl` no datasource do Prisma: no Supabase, o pooler de transação (6543)
  não aceita DDL nem prepared statement, e migration precisa da porta 5432.
- `ArmazenamentoService` com dois destinos — disco em desenvolvimento e teste,
  Supabase Storage quando há credencial. O disco do container é efêmero: um
  deploy entre o pedido e o download apagaria o ZIP de "Baixar meus dados".
- `prisma/sql/blindar-schema.sql` (aplicado como migration): RLS ligada em toda
  tabela, sem policy, e privilégios revogados de `anon`/`authenticated`.

### Por que o schema precisa ser fechado à mão

O Prisma cria as tabelas em `public`, e o Supabase publica `public` pela API
PostgREST. A chave `anon` é pública por definição — vai no javascript de
qualquer cliente. Sem tratar isso, **ela lê a base inteira**: é o mesmo furo do
aplicativo anterior, chegando por outro caminho.

Duas camadas, porque uma só não basta: RLS sem policy (ninguém passa) e
privilégio revogado (inclusive o padrão para tabelas futuras). A API não sente
nada: conecta como dona das tabelas, e dona não entra na RLS.

### Decisões

- **O ZIP nunca ganha URL pública nem assinada.** O download sai pelo endpoint
  autenticado, que lê o arquivo com a chave de serviço no servidor. Link
  assinado é portátil por natureza: circula em conversa, sobrevive à troca de
  senha e vale para qualquer um que o receba — num arquivo com o histórico de
  compras inteiro de uma pessoa, isso não serve.
- **Testes e CI continuam no Postgres do Docker.** A suíte cria e apaga
  usuários; o incidente do `deleteMany` na fase 6 é o motivo de nenhuma suíte
  apontar para base compartilhada.
- **Supabase Auth ficou de fora.** Login, sessões rotativas, consentimento
  versionado e o mínimo de anonimato dos preços são regra testada em
  `apps/api/test`; em policy SQL virariam regra sem teste.


## Login com o Google — executado

O fluxo é redirecionamento pelo servidor (Passport, PKCE + `state`), não SDK no
navegador: nenhum script nosso fala com o Google. No console do Google, o que
importa é o **redirect URI**, que precisa bater caractere a caractere com
`GOOGLE_CALLBACK_URL`; **JavaScript origins** pode ficar vazio.

### Duas falhas que só apareceram na primeira ligação de verdade

**"Unknown authentication strategy" com 500 na cara da pessoa.** A estratégia só
é registrada quando há credencial no ambiente — o que é certo, senão a API nem
sobe em desenvolvimento. Mas a rota continuava exposta, e quem tocava em
"Continuar com o Google" lia "algo deu errado do nosso lado": verdade e inútil,
porque convida a tentar de novo. Agora `GoogleConfiguradoGuarda` responde 503
`GOOGLE_UNAVAILABLE`, dizendo para usar e-mail e senha.

**"OAuth 2.0 authentication requires session support when using state."** O
`passport-oauth2` guarda `state` e verificador do PKCE em `req.session`, e esta
API não tem sessão de servidor — nem deve ter, porque a sessão da pessoa é o
cookie de refresh e nada mais. Acrescentar `express-session` significaria um
armazenamento compartilhado entre instâncias para durar os segundos de um
redirecionamento.

`EstadoEmCookie` guarda os dois num cookie httpOnly assinado com HMAC, válido
por 10 minutos, apagado na verificação. `SameSite=Lax` é obrigatório aqui:
`Strict` não acompanharia a volta do Google, e o login quebraria.

O teste fixa também a **quantidade de parâmetros** das funções: o
`passport-oauth2` escolhe a variante do `store` por `store.length`, então um
parâmetro a mais muda o contrato em silêncio e só quebra em produção.


## Fase 3 — o que a primeira chave real mostrou (25/09/2026)

Uma chave de nota de Brasília, de verdade, derrubou duas suposições.

**O endereço do portal do DF estava errado.** O adaptador apontava para
`dfe.fazenda.df.gov.br`, host que **não existe** — o DNS nem resolve. Nenhum
teste pegou, e não pegaria: todos usam HTML salvo, que é justamente o que os
torna rápidos e determinísticos. Fixture não testa endereço.

**No DF não dá para consultar pela chave digitada.** O endereço do QR
(`www.fazenda.df.gov.br/nfce/qrcode?p=…`) exige o parâmetro inteiro, com o hash
que o emissor assina; com os 44 dígitos o portal responde "Hash QR Code
inválido". E a consulta por chave do Portal de Serviços é uma aplicação Angular
atrás do desafio da Cloudflare. Agora `urlDaConsulta` devolve `null` nesse caso,
a nota vira `NEEDS_QR` sem visitar o portal, e a tela avisa **antes** de a
pessoa digitar 44 números à toa.

### E um furo de segurança que estava lá desde o começo

O processador buscava `qrUrl ?? urlDaConsulta(chave)` — e `qrUrl` vem do celular
da pessoa, sem conferência nenhuma. QR code é fácil de forjar: um adesivo na
gôndola bastaria para a nossa API buscar o endereço que o atacante escolhesse.
E servidor alcança o que a internet não alcança: `169.254.169.254` (metadados da
nuvem, onde moram credenciais), `127.0.0.1`, qualquer porta da rede interna.

Cada adaptador agora declara `hostsPermitidos`, conferidos por host exato antes
de qualquer requisição — `endsWith` deixaria passar
`fazenda.df.gov.br.exemplo.com`. Seis testes em `test/qr-de-fora.spec.ts`.

**Ainda pendente**: o parser continua sem validação contra HTML real. Falta a
URL completa do QR de uma nota (a que tem o hash), para salvar a página em
`apps/api/test/fixtures/nfce/df/` — sem o CPF do consumidor.


## Fase 3 — SP entra, e o parser finalmente tem prova (25/09/2026)

O aplicativo anterior lia São Paulo em produção, e o repositório dele guardava o
que faltava aqui: o **texto capturado de uma nota real** (Zaffari, 29/08/2026,
66 itens, R$ 1.901,57), conferido contra a página da SEFAZ-SP em 11/09/2026.

Com isso, `AdaptadorDeSp` entrou e o parser passou a ser testado contra dado de
nota de verdade: 66 itens, total certo, 0,6379 kg de carne moída a R$ 65,90
fechando em R$ 42,04, loja, CNPJ e data. **Em duas versões da página**: com as
classes do site e sem classe nenhuma. A segunda é a que vale — prova que a
leitura sobrevive à SEFAZ trocar o HTML, porque aí só restam os rótulos que a
pessoa lê na tela.

O que é real e o que foi reconstruído está escrito em
`test/fixtures/nfce/sp/montar.mjs`: os números são da nota, o HTML em volta foi
remontado com as classes do layout, e o CPF virou `000.000.000-00` — o campo
fica porque o parser precisa detectar que ele existia.

SP tem o mesmo desenho do DF: `/qrcode?p=…` sem captcha, consulta por chave com
reCAPTCHA. Ou seja, **o QR é o caminho nas duas UFs**, e a chave digitada é
fallback que depende do estado — o adaptador por UF existe justamente para isso.

**Continua pendente**: HTML real do DF. O de SP é reconstruído a partir de dados
reais; o do DF nem isso temos.


## Pontas soltas da fase 5 — executado (25/09/2026)

Duas coisas ficaram para trás quando a fase 5 foi dada como concluída, e as duas
apareceram ao conversar sobre o CRM.

**O admin de ofertas patrocinadas não existia.** O aceite da fase pedia; foram
entregues o selo, o limite de uma paga por página e o `sponsored` em toda
resposta — mas as ofertas vinham só do seed. Agora existem `/admin/offers` e
`/admin/partners`.

O DTO de criar oferta **não tem campo `sponsored`**, de propósito: com
`partnerId`, a oferta nasce patrocinada. Deixar isso como caixinha para marcar é
exatamente como um selo obrigatório deixa de ser marcado na prática.

**A página da nota que falhava era descartada.** `docs/06` já mandava guardar, e
o campo `rawStorageKey` estava no schema desde o começo, vazio. Sem ele, a SEFAZ
muda o HTML, a leitura quebra e a prova do formato novo some junto com a
requisição. Agora a página é guardada quando a falha é `PARSE_FAILED` — **com o
CPF do consumidor removido antes de gravar**, e apagada em 30 dias pelo expurgo
diário. Depuração não é desculpa para guardar CPF.

### Fundação do CRM, que veio junto

- `User.role` (USER/ADMIN), lido do banco **a cada requisição**: tirar alguém do
  admin vale na hora, não em 15 minutos.
- `AdminGuarda` depois do `JwtGuarda` — um diz quem é, o outro diz se pode.
- `AdminLog`: toda ação com quem, o quê e quando. **Sem chave estrangeira** para
  a conta, e isso é decisão, não esquecimento: com FK, encerrar a conta de um
  admin ou falharia ou levaria a trilha junto. Trilha que some quando o
  responsável sai não responde "quem apagou isso?".
- `prisma/promover-admin.mts`: em produção ninguém nasce admin. A pessoa se
  cadastra pelo app e alguém com acesso ao banco promove aquele e-mail — assim
  não existe senha de admin conhecida de antemão dentro do repositório.

145 testes na API. O CRM completo (produtos, usuários, métricas e as telas) vem
depois da fase 9.


## Fase 8 — polimento, acessibilidade e lançamento (25/09/2026)

Auditoria de axe em **27 rotas × 3 combinações** de tema, tamanho de texto e
largura: zero violações. Lighthouse no build de produção: acessibilidade,
boas práticas e SEO em **100**, desempenho em 98. As imagens de Docker sobem,
migram e respondem — só falta apontar o Coolify. Detalhes em `14-DEPLOY.md`.

### Três coisas que estavam quebradas e ninguém tinha percebido

**Não havia PWA.** O `vite-plugin-pwa` estava configurado com
`registerType: 'prompt'`, mas ninguém chamava `registerSW` — o service worker
nunca era registrado. O manifest existia apontando para ícones que **não
existiam**: `public/` estava vazia. Agora os ícones são gerados do logo por um
script sem dependência nativa (`zlib` e aritmética; o traço sai de carimbar
discos ao longo dos segmentos, que é o que dá as pontas arredondadas).

**A tela de ler nota tinha texto invisível no tema escuro.** O fundo da câmera é
escuro nos três temas, mas o texto usava `--ink` e os botões `--on-brand` — e os
dois viram escuro em algum tema. Medido com axe: "Galeria" e "Digitar chave"
abaixo de 4,5:1. Acrescentei o token **`on-camera`** (claro nos três temas) ao
design system. É a terceira vez que o mesmo padrão aparece: componente que
assume a cor da superfície onde está.

**O comando de produção apontava para o arquivo errado.** `pnpm start` rodava
`node dist/main.js`, e o compilador gera `dist/src/main.js` — ou seja, nunca
funcionou. Só apareceu ao rodar a imagem de verdade, que é o argumento para
construir a imagem antes do dia do deploy.

### Estados que faltavam

- **Erro** nas telas de dado (Início, Gastos, Preços, Lista, Ofertas, Ranking,
  Conquistas, Notificações): antes falhavam em silêncio, com área em branco.
- **Sem conexão**: faixa global com `aria-live`, que resolve todas as telas de
  uma vez em vez de repetir a lógica em vinte lugares.
- **Versão nova**: a atualização só entra quando a pessoa aceita — trocar o app
  embaixo de quem está lendo uma nota perderia o que ela estava fazendo.
- **Tela quebrada**: `errorElement` em todas as rotas, mais um 404 com saída.

### Decisões

- **Rolagem horizontal precisa de foco.** A trilha de níveis rolava sem alcance
  de teclado. A primeira correção — `role="group"` no `<ol>` — quebrou a
  semântica de lista, e o próprio axe pegou. A certa é a rolagem num contêiner
  com `role="region"` e rótulo, mantendo o `ol` como lista.
- **Nenhuma renovação de sessão para quem nunca entrou.** Toda primeira visita
  começava com um 401 no console (e no monitoramento). Uma marca local, que não
  é segredo nem sessão, evita o pedido — quem limpar o armazenamento perde o
  atalho, não a sessão.
- **Os testes e2e rodam contra o banco local, não o Supabase.** Com a API
  apontada para lá, seis execuções em paralelo começaram a falhar por latência —
  e teste que falha por rede ensina a ignorar teste vermelho.


## CRM / painel administrativo — executado (26/09/2026)

Seis telas em `apps/admin`, API com 13 testes de aceite (158 na API no total),
axe limpo em todas, imagem Docker construída e testada. O detalhe está em
`15-CRM.md`; aqui ficam as decisões que valem para além do CRM.

**Aplicação separada, não rota dentro do app.** O código do painel não vai no
pacote que o consumidor baixa, e o deploy fica separável — o painel pode ficar
atrás de rede fechada sem prender o app público junto.

**A fila de revisão é ordenada por impacto, não por data.** Corrigir o produto
com 300 observações conserta 300 números; o com 2 conserta 2. Ordenar por data
faria a pessoa gastar o dia no lugar errado.

**Consultar uma conta fica registrado, não só alterar.** Saber quem *olhou* é
metade da proteção. E a busca é por e-mail exato, com o endereço voltando
mascarado: `contains` deixaria alguém digitar "@gmail" e receber metade da base.

**Ninguém tira o próprio papel de admin.** Com uma conta só, isso trancaria todo
mundo para fora, e destrancar exigiria acesso ao banco.

### Dois achados no caminho

`/me` não devolvia `role`, então o painel recusava o próprio admin com "essa
conta não tem acesso" — bug que só apareceu ao abrir a tela no navegador, não
nos testes de API.

`WeeklyBars` tinha "semana que mais pesou" escrito no código. Reaproveitado para
"notas por dia", o texto acessível passava a mentir sobre o que estava ali.
Virou propriedade com o padrão de antes.

E a mesma armadilha da fase 8 reapareceu: tabela com rolagem horizontal sem
alcance de teclado, na tela de auditoria. Mesma correção — a rolagem num
contêiner com `role="region"`, rótulo e `tabindex`.


## Auditoria de segurança — 26/09/2026

Revisão de toda a aplicação, com cada achado conferido no código ou testado
contra o sistema rodando. O documento é `16-SEGURANCA-AUDITORIA.md`; aqui ficam
os dois achados que ensinam algo além de si mesmos.

**O limite por IP não existia.** Atrás de proxy, `req.ip` é o proxy — então o
limite de login valia para o mundo inteiro somado, e trinta requisições erradas
trancariam o acesso de todas as pessoas. Faltava `trust proxy`. E a correção tem
uma armadilha própria: com `true` em vez do número de saltos, o Express passa a
confiar no `X-Forwarded-For` que **o cliente manda**, e o limite deixa de existir
por outro caminho.

**"Baixar meus dados" nunca funcionou** — era um `<a href>` para um endpoint que
exige `Authorization`, cabeçalho que navegação de navegador não envia. O perigo
não era o 401: era a correção tentadora de abrir o endereço, o que deixaria o
histórico de compras de alguém a um id de distância de qualquer pessoa.

Também entraram: contador de tentativas nos códigos de 6 dígitos (cinco erros e
o código morre), Swagger fora de produção, CSP e `X-Frame-Options` no web.

E uma correção de documentação que vale como achado: `09-SEGURANCA-LGPD.md`
prometia verificação em duas etapas que **não existe**. Documento que promete
segurança inexistente é pior que documento omisso, porque alguém decide
confiando nele.


## O service worker respondia pela API (26/09/2026)

`https://…/v1/auth/google` mostrava "404 Not Found" no navegador enquanto o
servidor respondia **302 para o Google** — conferido nos três caminhos: túnel,
proxy do Vite e API direta.

A causa é do próprio PWA, entregue na fase 8. O Workbox registra uma
`NavigationRoute` que responde `index.html` a **qualquer navegação de topo** —
é o que faz abrir `/gastos` direto na barra de endereço funcionar. Sem lista de
exceção, ela engolia `/v1/...` também.

E `/v1/auth/google` é navegação de topo de verdade: o login com Google começa
com `window.location.href` e **volta do Google** por outra navegação, no
`/callback`. Ou seja: o login com Google estaria quebrado em produção assim que
o service worker instalasse, com um sintoma que aponta para o lugar errado — o
servidor responde certo e o navegador nem pergunta.

`navigateFallbackDenylist: [/^\/v1\//, /^\/docs/]`, e um teste que navega para
`/v1/saude` com o service worker ativo e exige JSON de volta.

**Para quem já abriu o app antes desta correção**: o service worker antigo
continua no navegador até ser substituído. Recarregar com Ctrl+Shift+R, ou
DevTools → Application → Service Workers → Unregister.


## O login com Google voltava para a tela de login (26/09/2026)

A pessoa escolhia a conta no Google, voltava — e caía na tela de entrar, com o
cookie de sessão válido no navegador.

A causa foi uma otimização minha da fase 8. Para não começar toda primeira
visita com um 401 no console, o app só pedia renovação quando existia uma marca
de "já entrou" — marca que o **javascript** escrevia em `localStorage` ao
guardar o token.

No login com Google não existe esse momento: a sessão nasce no **servidor**, no
callback, e o navegador chega no app já com o cookie e sem nenhum javascript do
app ter rodado antes. Sem a marca, o app não pedia renovação, se considerava
deslogado e mandava para o login.

A correção é a regra que faltava: **quem grava a marca tem de ser quem cria a
sessão**. Agora a API grava `gm_sessao=1` junto com o refresh — cookie sem
segredo, legível pelo javascript, que some no logout e sobrevive a limpar o
armazenamento local. Vale para qualquer caminho de entrada, inclusive os que
ainda não existem.

O teste reproduz o caminho do Google sem depender do Google: cria a sessão pelo
servidor, abre o app e exige que ele reconheça.
