# Recompensa por notas lidas — planejamento

> **Status:** PLANEJAMENTO (01/10/2026). Nada implementado.
> Altera o escopo do módulo Solana — ver "O que isto faz com o plano anterior".

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
| Tirar ofertas patrocinadas por 30 dias | Comparação de preço (é o produto) |
| Mais alertas de preço além da cota | Qualquer recurso de acessibilidade |
| Histórico completo além de 90 dias | Baixar seus dados (é direito, LGPD) |
| Raio maior na comparação de mercados | Leitura de nota |
| Selo cosmético no ranking | Posição no ranking |

Vender acessibilidade transformaria "modo fácil" e "letra grande" em privilégio
de quem paga — e o app inteiro foi construído contra isso. Vender a exportação
de dados seria cobrar por um direito previsto em lei.

## Como funciona por dentro

### Saldo

Livro-razão em **micro-USDC inteiros** (6 casas, como o token), igual ao de
pontos: cada linha é um crédito ou débito com motivo e chave de idempotência.
Nunca um campo `saldo` mutável — saldo é a soma, e assim um crédito duplicado
aparece em vez de sumir.

```
RewardLedger   userId, amountMicros, reason, refId, createdAt
RewardClaim    userId, amountMicros, wallet, status, signature, createdAt
UserWallet     userId, address, verifiedAt   (posse provada por assinatura)
```

### Elegibilidade

Conta **nota que virou dado**, não nota lida. Uma nota recusada, duplicada ou
que falhou na leitura não entra. Isso alinha a recompensa ao que de fato tem
valor — e corta de saída a farra de escanear qualquer papel.

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

E uma observação incômoda: **sem CPF não dá para impedir várias contas**. O teto
por conta vira teto por conta, não por pessoa. O limite de dano é o orçamento
mensal fechado.

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
| 1 | Livro-razão, elegibilidade, crédito e **gasto no app** | nenhuma |
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

## Perguntas em aberto

1. **200 notas ou 200 pontos?** Muda a primeira recompensa de quatro anos para
   quatro notas.
2. **Quanto vale a recompensa?** Sem isso não dá para fechar nem o orçamento nem
   a regra "paga menos do que a nota rende".
3. **Fase 1 agora, ou direto com carteira?** A fase 1 não precisa de nada de
   blockchain e já muda o comportamento de uso.
