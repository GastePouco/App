# Recompensa por notas lidas — planejamento

> **Status:** **fase 1 EXECUTADA** (02/10/2026) — saldo, elegibilidade, crédito
> por marco e gasto no app, tudo off-chain e funcionando. Fases 2 a 5 em
> planejamento. Altera o escopo do módulo Solana — ver "O que isto faz com o
> plano anterior".

## O que é

A pessoa lê notas. Ao atingir um número configurável de notas (o pedido inicial
é **200**), ela pode **resgatar uma recompensa** — e tem duas saídas para ela:

1. **Gastar dentro do app**, na hora, sem tocar em blockchain.
2. **Sacar em USDC** para a carteira dela, quando quiser.

## A decisão que define o custo

> A transferência mais barata é a que não acontece.

Por isso o saldo nasce **fora da blockchain** e é imediatamente útil dentro do
app. O saque é opt-in. Se a maioria gastar no app — e vai, porque é o caminho
sem fricção —, o custo por pessoa é **zero**.

Isso não é economia de centavos: é o que torna a recompensa viável para quem
não tem carteira, não quer ter, e mesmo assim merece receber pelo que
contribuiu.

## Qual moeda, e por quê USDC

| | USDC | SOL |
|---|---|---|
| Valor estável | sim | não |
| "Você ganhou R$ 5" continua R$ 5 amanhã | sim | não |
| Mesma unidade da receita do x402 | sim | não |
| Pessoa precisa entender volatilidade | não | sim |

**USDC.** Recompensa pequena em ativo volátil é uma promessa que pode valer
metade na semana seguinte — e quem leu 200 notas não assinou para especular.

## Quanto custa transferir, medido

Preços de rede em 01/10/2026, depois da redução de aluguel do SIMD-0437 (etapa 1
em 03/09/2026):

| Caminho | Custo por pessoa | Observação |
|---|---|---|
| **Crédito no app** | **zero** | nenhuma transação |
| USDC para conta de token já existente | ~0,000005 SOL (fração de centavo) | taxa de rede |
| USDC para conta nova (ATA) | **~0,00186 SOL hoje**, ~0,0002 na etapa final | uma vez por pessoa, e é o custo dominante |
| USDC comprimido (ZK Compression) | sem aluguel, sem conta por pessoa | o mais barato em escala; exige descomprimir para usar fora |
| SOL para carteira nova | precisa ficar acima do mínimo isento (~0,00089 SOL) | mais volatilidade |

**A conclusão prática:** o que custa não é a transferência, é **criar a conta de
token da pessoa**. Daí as três regras do desenho:

1. **Mínimo para saque** (sugestão: US$ 2). Abaixo disso, a criação da conta
   come uma fatia grande demais do que a pessoa recebe.
2. **Nós pagamos a taxa**, via relayer (Kora, da Solana Foundation): a pessoa
   **não precisa ter SOL** para receber. Exigir que ela compre SOL para sacar
   R$ 10 seria piada de mau gosto.
3. **ZK Compression entra se um dia a distribuição for em massa** — sem aluguel
   e sem conta por pessoa. Custa um passo a mais de descompressão, que só vale a
   pena quando são milhares de saques pequenos.

## O número 200 não fecha com o uso real

A meta do produto é **4 notas por pessoa por mês** (`01-PRD.md`). Nessa taxa:

| Notas por mês | Tempo até 200 |
|---|---|
| 4 (meta) | **50 meses** |
| 10 | 20 meses |
| 20 (entusiasta) | 10 meses |

Uma recompensa que chega em quatro anos não muda comportamento nenhum — ela
nem é percebida. O limite deve ser configurável, como pedido, mas **o padrão é o
que vai ao ar**, e sugiro:

- **Primeira recompensa em 25 notas** (~6 meses na meta, ~1 mês para quem usa de
  verdade): é o marco que prova que o sistema paga.
- **Depois, a cada 50 notas.**
- `200` fica disponível na configuração para quem quiser esticar.

Se a intenção era "200 pontos" em vez de "200 notas", o cálculo muda: 60 pontos
por nota faz 200 pontos chegarem na quarta nota. Vale confirmar.

## De onde sai o dinheiro

Recompensa sem fonte é subsídio que escala para prejuízo. Três fontes possíveis,
em ordem de solidez:

1. **Receita do dado** (x402, `10-MODULO-SOLANA.md`): quem consulta preço paga,
   e parte volta para quem gerou o dado. É o único modelo que fecha sozinho.
2. **Patrocínio** (parceiros já pagam por oferta patrocinada hoje).
3. **Marketing**, com teto duro por mês.

**A regra que não pode ser quebrada:** o valor pago por nota tem de ficar
**abaixo** do que aquela nota rende em consulta ao longo da vida dela. Com
R$ 0,02 de receita por nota e R$ 0,05 de recompensa, cada pessoa nova aumenta o
prejuízo — e o crescimento vira o problema, não a solução.

No lançamento, antes de haver receita de dado, isso é **marketing com teto**: um
orçamento mensal fechado, e quando acaba, acabou — a recompensa seguinte entra
no ciclo do mês seguinte. Melhor dizer "no próximo mês" do que dever.

## O que o saldo compra dentro do app

A regra que separa o que pode e o que não pode ser vendido:

> **Nunca se vende o que torna o app útil ou acessível.**

| Pode ser pago | Nunca |
|---|---|
| **Tirar ofertas patrocinadas por 30 dias** — existe, R$ 2,00 | Comparação de preço (é o produto) |
| **Selo de apoiador no ranking por 90 dias** — existe, R$ 1,00 | Qualquer recurso de acessibilidade |
| | Baixar seus dados (é direito, LGPD) |
| | Leitura de nota |
| | Posição no ranking |

A loja tem **dois** itens, e não os cinco que esta página listava. Três saíram, e
o motivo é o mesmo nos três:

- **"Mais alertas de preço além da cota"** — hoje **não existe cota de alertas**.
  Vender a saída de um limite exigiria inventar o limite primeiro, ou seja,
  piorar o app de graça para ter o que vender de volta. Fora.
- **"Histórico completo além de 90 dias"** — mesma coisa: o histórico não é
  cortado em 90 dias hoje.
- **"Raio maior na comparação de mercados"** — comparação de preço é o produto, e
  vender uma comparação melhor é vender o produto em pedaços.

E a regra que ficou escrita no código, junto do catálogo: **todo item precisa de
um ponto que o aplique**. Item em tabela de banco sem código que o honre é
promessa que a pessoa paga e não recebe — por isso o catálogo mora em
`packages/shared/src/recompensas.ts`, não numa tabela editável pelo CRM.

Vender acessibilidade transformaria "modo fácil" e "letra grande" em privilégio
de quem paga — e o app inteiro foi construído contra isso. Vender a exportação
de dados seria cobrar por um direito previsto em lei.

## Como funciona por dentro

### Saldo

Livro-razão em **centavos de real**, igual ao de pontos: cada linha é um crédito
ou débito com motivo e chave de idempotência. Nunca um campo `saldo` mutável —
saldo é a soma, e assim um crédito duplicado aparece em vez de sumir.

> **Decisão da implementação:** o rascunho desta página dizia micro-USDC. Virou
> **centavo de real**. O app inteiro conta dinheiro em centavos de real, e quem
> lê nota de supermercado pensa em real — denominar o saldo em dólar faria o
> número da tela mudar sozinho todo dia, por causa do câmbio, sem nada ter
> acontecido. A conversão para USDC passa a acontecer **no saque** (fase 2), com
> a cotação do dia e o valor convertido mostrado **antes** de confirmar. O risco
> de câmbio fica com quem o entende, não com quem leu a nota.

```
RewardLedger    userId, amountCents, reason (MILESTONE|PURCHASE|ADJUSTMENT),
                refId, createdAt      @@unique([userId, reason, refId])
RewardBenefit   userId, code, startsAt, endsAt   @@unique([userId, code])
```

Fase 2 acrescenta `RewardClaim` (saque) e `UserWallet` (posse provada por
assinatura). Não existem ainda, e não há coluna esperando por eles.

### Elegibilidade

Conta **nota que virou dado**, não nota lida. Uma nota recusada, duplicada ou
que falhou na leitura não entra. Isso alinha a recompensa ao que de fato tem
valor — e corta de saída a farra de escanear qualquer papel.

E quem recebe precisa ser **uma pessoa identificada**:

| Exigência | Por quê |
|---|---|
| E-mail confirmado | é por onde a pessoa é avisada e recupera a conta |
| Questionário de consumo respondido | é o cadastro que o app usa para orçamento e persona |
| CEP (ou região) | sem região a nota não vira preço de lugar nenhum |
| **CPF vinculado, um por conta** | é o que faz a recompensa ser por **pessoa**, não por conta |

**O celular não entra na lista.** A gente não usa para nada hoje, e exigir dado
que não se usa é coletar por coletar — o contrário de minimização.

**Nada é perdido por cadastro incompleto.** O marco batido fica **esperando**:
a tela mostra "você tem R$ 2,00 esperando" com a lista do que falta, e o job
noturno credita assim que a pessoa completa. Exigência que apaga o que a pessoa
já fez é punição; exigência que mostra o valor parado é convite.

### O CPF, e o que ele resolve de verdade

O CPF **não vai para o banco**. Vai um HMAC com segredo de servidor
(`CPF_HASH_SECRET`), **separado** do segredo das observações de preço: o espaço
de CPFs válidos é pequeno (~10^9), então quem tem o segredo reverte qualquer
hash por força bruta — e vazar um hash não pode custar os dois dados.

Três consequências que o desenho assume de frente:

1. **Unicidade significa que o CPF em outra conta é recusado.** Quem tenta
   descobre que existe uma conta com aquele CPF. É um oráculo, e é o preço de
   impedir dez contas com dez recompensas: a rota é autenticada, limitada a
   cinco por minuto, e quem sonda já precisa saber o CPF que está sondando.
2. **Digitar CPF não prova nada** — o dígito verificador pega erro de digitação,
   não má-fé. Quem verifica é a **nota fiscal**: a página da SEFAZ mostra o CPF do
   consumidor quando ele foi informado na compra, e o parser transforma esse
   número em hash ali mesmo. Se o hash bate com o da conta, está provado que quem
   leu foi quem comprou — **sem o número ter sido guardado em lugar nenhum**.
   Isso grava `User.cpfVerifiedAt`.
3. **`cpfVerifiedAt` não é exigência da fase 1.** Muita gente não informa CPF no
   caixa, e cobrar isso excluiria quem contribui de verdade. Ele é o sinal de
   confiança que a **fase 2** vai pedir para o saque — ali, pagar dinheiro para
   fora pede prova, não palavra.

A pessoa pode **desvincular** quando quiser: o hash e a confirmação caem juntos
(manter a data sem o vínculo afirmaria uma prova que não existe mais), o
consentimento revogado fica registrado em `Consent`, e o que ela perde é a
elegibilidade — não o app.

### O resgate

1. Pessoa atinge o limite → crédito no livro-razão (job idempotente).
2. Gasta no app (débito) **ou** pede saque.
3. Saque exige: carteira vinculada (posse provada por assinatura), saldo acima
   do mínimo, e passa pela fila de revisão se cair em regra de risco.
4. Transferência de USDC do tesouro para a carteira, taxa paga por nós.
5. Assinatura da transação guardada no `RewardClaim` — a pessoa vê o link do
   explorer.

### Onde a blockchain entra de verdade

O saque é uma transferência, e transferência sozinha não precisa de programa
nenhum. O que justifica Solana aqui, além do pagamento:

**Publicar a raiz Merkle da elegibilidade de cada ciclo.** Quem leu quantas
notas (por `userHash`, nunca por pessoa) entra numa árvore cuja raiz vai
on-chain. Qualquer pessoa confere que o seu saldo saiu da regra publicada, e não
de um número que a gente digitou. É a mesma propriedade que sustenta o oráculo:
**o dado é conferível por quem não confia em nós**.

Sem isso, "recompensa em cripto" é só um pagamento com passos a mais.

## Fraude

As notas são emitidas pelo governo e **não dá para inventar uma**: a chave é
conferida e cada nota vale uma vez no sistema inteiro. O que sobra é alguém
juntar notas de terceiros — lixeira de supermercado, ou um caixa escaneando
todas.

Defesas, em camadas:

- limite diário de notas com ponto (já existe);
- recompensa conta só nota que virou observação de preço;
- teto por pessoa por ciclo;
- carteira única por conta;
- padrão suspeito (muitas notas, mesma loja, mesmo dia, horários em sequência)
  cai na **fila de revisão do CRM** antes de pagar — e pagamento revisado por
  gente é mais barato que fraude automatizada.

A observação incômoda que esta página trazia — "sem CPF não dá para impedir
várias contas" — **deixou de valer**: o CPF é único por conta, e a recompensa só
sai para quem vinculou o seu. Duas ressalvas honestas ficam:

- **CPF válido é fácil de gerar.** Quem usar o CPF de terceiros passa pelo
  cadastro; o que o segura é a confirmação pela nota (fase 2, para o saque) e a
  fila de revisão.
- **O limite de dano continua sendo o orçamento mensal fechado.** Ele é a única
  defesa que não depende de a gente ter previsto o ataque.

## O que precisa de advogado antes da mainnet

Pagar pessoas em cripto no Brasil muda o enquadramento do produto:

- **Guardar saldo resgatável** se aproxima de custódia (Lei 14.478/2022 e a
  regulamentação de prestadoras de serviço de ativos virtuais).
- **Crédito no app** é programa de fidelidade — outra natureza, bem mais simples.
- Quem recebe tem obrigações de declaração.

Desenho que reduz o problema: **crédito no app é ponto, não dinheiro**; o saque
sai do tesouro direto para a carteira da pessoa, sem a gente custodiar fundo de
usuário. Devnet não tem esse problema; mainnet não entra sem parecer.

## Fases

| Fase | O que entrega | Chain |
|---|---|---|
| 1 ✅ | Livro-razão, elegibilidade, crédito e **gasto no app** | nenhuma |
| 2 | Vincular carteira (prova por assinatura) e saque em USDC | devnet |
| 3 | Raiz Merkle da elegibilidade publicada por ciclo | devnet |
| 4 | Relayer pagando a taxa; mínimo e tetos ajustados pelo uso real | devnet |
| 5 | Mainnet | só com parecer jurídico |

A fase 1 sozinha já é um produto: recompensa que se gasta no app, sem carteira,
sem taxa, sem explicar blockchain para ninguém.

## O que isto faz com o plano anterior

`10-MODULO-SOLANA.md` (revisão 2) tem três peças: feed de preço por SKU, índice
da cesta e mercado de dados via x402 com repasse a quem escaneou. **A recompensa
por notas é esse repasse, com outra forma**: em vez de fração por consulta, um
marco atingível.

As duas convivem, e é assim que recomendo:

- **O oráculo responde "por que isso importa"** — dado de preço auditável, que
  ninguém mais tem, vendido a quem precisa.
- **A recompensa responde "por que eu usaria"** — e é o que aparece na tela.

**O risco de trocar uma pela outra:** "escaneie e ganhe" é padrão conhecido e
visto como genérico; o oráculo auditável é o que diferencia. Recompensa sem a
fonte de receita vira subsídio, e o jurado pergunta de onde sai o dinheiro na
primeira olhada. Minha recomendação é manter o oráculo como espinha e a
recompensa como a ponta visível — não trocar.

## O que a fase 1 entregou (02/10/2026)

### Como o marco é contado e pago

- **Conta nota que virou observação de preço.** Nota recusada, duplicada, que
  falhou na leitura ou de loja sem região **não** entra. Quem lê 30 notas e vê 28
  no contador lê o porquê na própria tela.
- **A chave de idempotência é o índice do marco** (`marco:1`, `marco:2`), nunca a
  quantidade de notas. Baixar o primeiro marco de 25 para 20 numa campanha nova
  não repaga ninguém — o que uma chave do tipo `marco:25-notas` faria.
- **O crédito acontece em dois lugares**, os dois idempotentes: no fim da leitura
  da nota e na varredura noturna (`rewards:pending-milestones`, 03h20). Nenhum
  `GET` credita nada — dinheiro que aparece porque alguém abriu uma tela é o tipo
  de efeito colateral que ninguém encontra depois.
- **Teto mensal é teto.** Estourado o orçamento, o marco não é perdido nem pago:
  a varredura o credita quando o mês virar.
- **Avisa quem recebeu.** Cada marco gera notificação do tipo `REWARD`, que não
  passa por interruptor de preferência: não é marketing, é o aviso de que a
  pessoa recebeu algo. Quem fechou o app depois de ler a nota descobre do mesmo
  jeito.

### Gastar

- `FOR UPDATE` na linha da pessoa antes de conferir o saldo. Sem a trava, dois
  pedidos simultâneos leem o mesmo saldo, os dois passam, e o saldo fica
  negativo — `read committed` não impede isso sozinho.
- **Janela de idempotência de um minuto por item.** Toque duplo no botão, ou
  reenvio de uma requisição que o celular perdeu, não cobra duas vezes; a
  resposta volta com `repeated: true` e a tela diz "nada foi cobrado de novo".
- **Comprar de novo soma ao prazo que ainda falta**, em vez de desperdiçá-lo.

### Onde o benefício é aplicado

| Benefício | Ponto de aplicação |
|---|---|
| `SEM_PATROCINIO` | `OfertasService.listar` nem consulta oferta paga — e, por consequência, **não conta impressão**: parceiro não paga por quem não viu |
| `SELO_APOIADOR` | `RankingService.calcular` marca `supporter` em lote (uma consulta, não uma por linha); a tela mostra estrela **com a palavra "Apoiador"** para leitor de tela, e o selo não entra na ordenação |

### Superfície

- `GET /v1/rewards` — saldo, notas contadas, progresso, loja, benefícios ativos e
  extrato, numa resposta só: três requisições num celular em 3G são três chances
  de meia tela.
- `POST /v1/rewards/purchase` — `{ code }`, validado contra o catálogo do código.
- `PUT /v1/me/cpf` — vincula (valida dígito, confere unicidade, registra
  consentimento, devolve mascarado). Cinco por minuto.
- `DELETE /v1/me/cpf` — desvincula e registra a revogação.
- Tela `/recompensas`, alcançável por Perfil e por Conquistas. **Sem referência
  aprovada em `referencia/telas/`** — a recompensa nasceu depois do pacote de
  design, e a tela foi montada só com componentes e tokens existentes para que a
  revisão depois seja arranjo, não reescrita.
- A tela diz, em voz alta, que **o saque em USDC ainda não existe**.

### Configuração

| Variável | Padrão | O que é |
|---|---|---|
| `REWARD_FIRST_MILESTONE` | 25 | notas (que viraram dado) do primeiro marco |
| `REWARD_MILESTONE_STEP` | 50 | notas entre um marco e o seguinte |
| `REWARD_MILESTONE_CENTS` | 200 | quanto cada marco credita |
| `REWARD_MONTHLY_BUDGET_CENTS` | 50000 | teto de crédito por mês, somando todas as pessoas |
| `CPF_HASH_SECRET` | — | segredo do HMAC do CPF; **obrigatório em produção**, separado do `USER_HASH_SECRET` |

Valor inválido (letra, zero, negativo) cai no padrão e **avisa no log**: um teto
que virasse `NaN` em silêncio pagaria recompensa sem limite.

### Testes

`apps/api/test/recompensas.spec.ts` fixa o que custa caro quando sai errado:
pagar duas vezes, pagar por nota que não virou dado, gastar saldo que não existe,
teto que segura e depois paga, mudança de regra que não repaga, selo que não mexe
na posição, e patrocinada que some sem contar impressão. O portão tem um teste
por exigência — tirar uma de cada vez é o que mostra qual está sendo cobrada —, o
CPF tem os seus em `conta.spec.ts` (hash, mascaramento, dígito, unicidade,
consentimento dos dois lados, remoção) e o encontro com a nota está em
`notas.integracao.spec.ts`. As regras puras do
marco têm teste à parte em `packages/shared/src/recompensas.test.ts` — incluindo
um que recusa item de loja que venda acessibilidade, exportação ou comparação.

## Decisões tomadas

1. **200 notas ou 200 pontos?** → **Notas**, e o padrão virou **25**, com 200
   disponível na configuração. A 4 notas/mês, 200 notas levam 50 meses; o
   primeiro marco precisa ser alcançável para provar que o sistema paga.
2. **Quanto vale a recompensa?** → **R$ 2,00 por marco**, configurável. É um
   número de campanha, não de receita: a R$ 0,08 por nota ele está **acima** do
   que uma nota rende hoje em consulta. Por isso entra com **teto mensal** e
   tratado como marketing — e por isso o teto é código, não intenção.
3. **Fase 1 agora, ou direto com carteira?** → **Fase 1 primeiro**, e foi o que
   se construiu: recompensa que se gasta no app, sem carteira, sem taxa, sem
   explicar blockchain para ninguém.

## O que continua em aberto

- **A fonte do dinheiro.** Enquanto não há receita de x402, é orçamento de
  marketing com teto. A regra que não pode ser quebrada continua valendo: o valor
  pago por nota tem de ficar **abaixo** do que aquela nota rende ao longo da vida
  dela. Hoje não fica.
- **Teto por pessoa por ciclo.** O teto de hoje é global (do mês), não por conta.
  Com CPF único, um teto por pessoa passa a ser possível — e ainda não existe.
- **A fila de revisão de risco** (padrão suspeito antes de pagar) é da fase 2,
  junto com o saque: enquanto o saldo só vale dentro do app, fraude rende
  desconto em anúncio, não dinheiro.
