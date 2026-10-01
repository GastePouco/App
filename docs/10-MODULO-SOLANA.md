# Módulo Solana — revisão 2 (26/09/2026)

> **Revisão 1** descrevia um oráculo de preços agregados com API paga. A
> revisão 2 mantém a espinha técnica e **muda o produto**: de feed de preços
> para **mercado de dados com prova**. O motivo está em "Por que mudou"; as
> ideias descartadas estão no fim, com o porquê — que é o que costuma fazer
> falta três semanas depois.

Este módulo é **independente do app B2C**: o GasteMenos funciona sem ele.

> Antes de implementar, confira a documentação atual do Anchor, do
> `@solana/web3.js` (ou `@solana/kit`) e do x402 para Solana: essas bibliotecas
> mudam rápido.

## Por que mudou

**Oráculo de agregados não é novidade em 2026.** A Truflation publica inflação
em tempo real on-chain, inclusive na Solana, com 200+ índices e ~15 milhões de
pontos de preço por dia vindos de 30+ fontes. Publicar média num PDA, do jeito
que a revisão 1 descrevia, era repetir o que já existe com menos dados.

**O ativo raro aqui não é o agregado — é a nota fiscal.** O Brasil tem NFC-e
universal, com chave de acesso de 44 dígitos que qualquer pessoa confere no
portal da SEFAZ. Quase nenhum país tem esse substrato.

> A Truflation te dá o número. Nós te mostramos a nota.

Cada ponto do nosso índice é auditável **individualmente**, contra um portal do
governo, por qualquer pessoa. Esse é o diferencial defensável, e ele decide o
resto do desenho.

**Quem paga é um agente, não uma empresa.** O x402 existe para pagamento entre
agentes: mais de 35 milhões de transações na Solana e cerca de metade do volume
agente-a-agente do protocolo, com facilitador da Coinbase suportando Solana. Um
agente de compras precisa saber quanto custa arroz em Ceilândia **hoje** — e é
disso que ele não dispõe. Não é rede de supermercado assinando contrato; é uma
fração de centavo por consulta, muitas vezes por dia.

## O que vamos construir

Três peças, nesta ordem:

### 1. Feed por SKU × região — o primitivo

Conta `PriceFeed` (PDA com seeds `["feed", product_key, geohash]`):

| Campo | Tipo | Nota |
|---|---|---|
| `product_key` | `[u8; 32]` | hash do GTIN, ou do nome normalizado quando não há GTIN |
| `geohash` | `[u8; 5]` | região de ~5 km |
| `median_cents`, `min_cents`, `max_cents` | `u32` | mediana, não média: uma compra de atacado distorce a média |
| `receipt_count` | `u32` | notas que sustentam o número |
| `contributor_count` | `u16` | **pessoas** distintas; acervo importado não entra aqui |
| `merkle_root` | `[u8; 32]` | raiz das observações do lote |
| `period_start`, `updated_at` | `i64` | UTC |
| `authority` | `Pubkey` | publisher |

Instruções: `init_feed`, `update_feed` (só a `authority`), `close_feed`.

### 2. Índice da cesta por cidade — o produto legível

Conta `BasketIndex` (PDA por cidade × período): valor da cesta, variação contra
a base, número de produtos cobertos e a raiz do lote.

O IPCA é mensal e sai com atraso. O nosso é **diário, por região, e cada ponto
tem uma nota atrás**. É o que um brasileiro entende sem explicação, e o que
responde ao tema do evento sem metáfora.

### 3. Mercado de dados via x402 — a receita, e o repasse

`GET /v1/prices/:productKey?geohash=…` responde **402** com os requisitos de
pagamento; com o cabeçalho válido, devolve o feed **mais a prova Merkle**.

E a outra ponta, que é o que torna isto um mercado de dois lados: **quem
escaneou recebe parte do que a consulta pagou**. A forma desse repasse está
planejada em `18-RECOMPENSAS.md`: recompensa por marco de notas lidas, gastável
dentro do app e sacável em USDC. Nenhum programa de fidelidade
faz isso — eles pagam com ponto que vale o que o varejista decidir. No MVP o
crédito é acumulado off-chain e mostrado no app; o saque on-chain é roadmap
declarado, não promessa escondida.

## As duas fontes de dado, e por que elas não se misturam

| Fonte | O que é | Conta como pessoa? | Rende ponto? |
|---|---|---|---|
| **Leitura no app** | alguém escaneou o QR da própria nota | sim | sim |
| **Acervo importado** | 50 mil notas do DF, já estruturadas | **não** | não |

A leitura no app continua sendo o motor: é ela que cresce a cobertura, traz
região nova e cria **contribuinte** — pessoa de verdade, que recebe repasse.
DF e SP já têm adaptador; os outros estados entram um a um, cada portal com o
seu (ver `06-NFCE-LEITURA.md`).

O acervo dá **profundidade imediata** ao índice, que é o que faltava para o
número significar alguma coisa no dia da demonstração. Mas ele muda duas
decisões:

**Nota importada não pertence a ninguém.** `Receipt.userId` vira opcional. Não é
conveniência: é a verdade do dado. Fingir que essas notas são de alguém
inventaria vínculo onde não há. Entram com `pointsEligible: false` — ponto é
recompensa por ler nota, e ninguém leu estas.

**O piso de anonimato vale para pessoas, não para o acervo.** O piso de 5 notas
e 3 pessoas existe para impedir que um preço identifique quem comprou. Nota sem
dono não identifica ninguém: conta para `receipt_count` e **não** para
`contributor_count`. O feed mostra os dois números separados — inflar "pessoas"
com acervo seria mentir sobre a confiança do dado.

**A auditabilidade depende da chave de acesso vir junto.** Com a chave, qualquer
pessoa abre o portal do DF, resolve o captcha e confere o preço; o captcha barra
automação, não gente, e auditoria é feita por gente. Sem a chave, essas notas
são dado não verificável e **não podem sustentar a alegação de auditabilidade**
— nem no pitch, nem no README.

## Estrutura

```
apps/oracle/
├─ programs/gastemenos_oracle/   # Anchor: PriceFeed e BasketIndex
├─ publisher/                    # lê PriceStat, monta Merkle, publica
└─ x402-api/                     # API paga por consulta
apps/api/src/modules/acervo/     # importação em lote
```

O verificador de promoção **deixa de ser app separado**: vira o selo "confirmado
pelo oráculo" na tela Ofertas, que já existe. Uma página a menos para manter, e
uma história a mais dentro do produto.

## Critérios de aceite

- Programa com testes Anchor: `init`, `update` pela authority, **recusa** de
  update por outra chave, recusa de feed abaixo do piso de anonimato.
- Importador traz o acervo com deduplicação por chave e é **idempotente**:
  rodar duas vezes não duplica nem recontabiliza.
- Publisher publica feed e índice na devnet a partir de dado real.
- API responde 402 sem pagamento e 200 com pagamento válido em devnet, com a
  prova Merkle no corpo.
- Uma nota do lote é conferida **no portal da SEFAZ** e bate com o feed.

## Roteiro da demonstração (3 min)

1. Escanear uma nota real no app.
2. O item entra no agregado da região, com o piso de anonimato visível.
3. Publisher publica índice e feed na devnet — transação no explorer.
4. Um agente pede o preço → recebe 402 → paga USDC → recebe dado e prova.
5. Abrir uma nota daquele lote no portal da SEFAZ: mesmo preço.
6. O saldo de quem escaneou sobe com a fração daquela consulta.

## Apostas, nesta ordem

1. **Publicar também via Switchboard On-Demand** — composabilidade com primitivo
   existente, critério de julgamento declarado. Barato.
2. **Atestado de compra verificada** (Solana Attestation Service): a prova de
   compra hoje é do varejista; aqui é de quem comprou, sem revelar quem.
3. **zkTLS** (Reclaim/TLSNotary): provar que o HTML veio do domínio da SEFAZ.
   Mata o "confie no publisher". Maior novidade disponível e maior risco de não
   fechar no prazo — por isso é aposta, nunca espinha.

## Ideias descartadas, e por quê

- **Mercado que liquida no índice** (hedge da cesta básica). É o que mais
  responde ao tema, e é instrumento financeiro: não se improvisa em duas
  semanas, e errar aqui é errar feio. Fica no pitch como roadmap.
- **Rede de publishers com stake e slashing.** Resolve o modelo de confiança
  pela descentralização, mas é projeto inteiro. O zkTLS ataca o mesmo problema
  e cabe num PoC.
- **Token próprio / pagamento ao usuário em token.** Continua fora: taxa,
  custódia e expectativa de preço em cima de um app que precisa ser útil sem
  nada disso.
- **Mainnet no hackathon.** Devnet é honesto e ninguém tira ponto por isso.
