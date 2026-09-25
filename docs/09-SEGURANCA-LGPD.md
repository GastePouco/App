# Segurança e LGPD

> Este documento orienta a implementação; a política de privacidade e os termos precisam ser revisados por um advogado antes do lançamento.

## Dados pessoais e finalidade

| Dado | Para quê | Onde aparece para outros |
| --- | --- | --- |
| Nome, e-mail, foto | conta | nome no ranking (ou "Economizador anônimo") |
| Celular | verificação em duas etapas | nunca |
| CEP | região de preços e ofertas | nunca (só o geohash de ~5 km é usado) |
| CPF na nota (opcional) | importação futura de notas | nunca; guardado como hash com sal |
| Notas e itens | gastos, lista, pontos | nunca individualmente; preços entram na base sem ligação com a pessoa |
| Perfil de consumo | orçamento sugerido, ordem das ofertas | nunca; parceiros só recebem dados agregados com consentimento |

## Regras

- **Consentimento**: termos e política aceitos no cadastro (versão gravada em `Consent`). Compartilhar com parceiros e ofertas patrocinadas por notificação começam **desligados**.
- **Minimização**: nunca guardar o CPF do consumidor que aparece na nota; nunca guardar a URL completa do QR por mais de 30 dias; HTML bruto da nota guardado só 30 dias para depuração.
  - Implementado: a página só é guardada quando a leitura falha com `PARSE_FAILED`, **com o CPF removido antes de gravar** (`semCpf`), e o job diário apaga o arquivo passados 30 dias. Sem isso não haveria como corrigir o parser quando a SEFAZ muda o HTML — mas "depuração" não é desculpa para guardar CPF.
- **Ações administrativas**: papel `ADMIN` em `User.role`, lido do banco a cada requisição, e toda alteração registrada em `AdminLog` (quem, o quê, quando). O registro **não tem chave estrangeira** para a conta: uma trilha que some quando o responsável encerra a conta não responde "quem apagou isso?", que é a única razão de ela existir.
- **Anonimato dos preços**: `PriceObservation` usa `userHash` (HMAC do userId com segredo), não o userId. Agregados só são mostrados com 5+ notas de 3+ pessoas.
- **Acesso aos dados**: "Baixar meus dados" gera um ZIP com JSON e CSV (conta, preferências, notas, itens, listas, pontos, selos) em até 24 h; link expira em 7 dias.
- **Exclusão**: "Encerrar conta" marca `PENDING_DELETION` com prazo de 30 dias (a pessoa pode voltar entrando de novo). No prazo, o job apaga a conta e tudo ligado a ela; observações de preço permanecem só com `userHash`, que deixa de poder ser ligado a alguém.
- **Pausa**: some do ranking, notificações param, sequência congela; dados intactos.
- **Transparência**: tela Privacidade e dados explica cada interruptor em linguagem simples; o selo "Patrocinado" é obrigatório em conteúdo pago.

## Segurança

- Senhas com Argon2id; tokens de acesso de 15 min; refresh rotativo com detecção de reutilização (revoga a família).
  - **Exceção da renovação perdida.** Um refresh já queimado que reaparece
    **enquanto a sessão que o substituiu nunca foi usada** não é reutilização:
    é o cliente que não chegou a receber o token novo — a navegação cancelou a
    resposta no meio, ou duas abas renovaram juntas e só uma resposta chegou.
    Nesse caso a API reemite a partir da sessão órfã, em vez de derrubar a
    família. A detecção continua valendo para o caso que ela existe para pegar,
    o token roubado usado **em paralelo** com o legítimo: aí a sessão sucessora
    está em uso. Implementado em `SessoesService.rotacionar` (coluna
    `Session.successorId`), com as duas direções fixadas em
    `apps/api/test/sessoes.spec.ts`.
- Cookies `httpOnly`, `Secure`, `SameSite=Lax`; CORS restrito ao domínio do web; CSP no web.
- Rate limit (Nest Throttler + Redis) em login, cadastro, reenvio de código, leitura de nota (10 com pontos por dia) e busca.
- Verificação em duas etapas opcional por SMS ou e-mail; aviso por e-mail em troca de senha, novo aparelho e pedido de exclusão.
- Google OAuth com PKCE e `state`; ligar conta Google a uma conta existente só com o mesmo e-mail verificado.
  - O `state` e o verificador do PKCE ficam num **cookie httpOnly assinado com HMAC**, válido por 10 minutos e apagado no retorno (`estado-em-cookie.ts`). O padrão do `passport-oauth2` é `req.session`, o que exigiria `express-session` — armazenamento de sessão no servidor, compartilhado entre instâncias, para os segundos de um redirecionamento. A única sessão desta API é o cookie de refresh.
  - Sem `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` a estratégia não é registrada, e `/v1/auth/google` responde **503 `GOOGLE_UNAVAILABLE`** com texto que diz o que fazer, em vez de 500.
- Logs sem dados pessoais (mascarar e-mail, nunca logar tokens, CPF ou HTML de nota).
- Backups diários criptografados do Postgres, com retenção de 30 dias — em produção, o PITR do Supabase (`docs/13-SUPABASE.md`).
- O schema do banco fica fechado para as chaves públicas do Supabase: RLS ligada em toda tabela, sem policy, e privilégios revogados de `anon`/`authenticated` (`apps/api/prisma/sql/blindar-schema.sql`). A API conecta como dona das tabelas.
- O ZIP de "Baixar meus dados" **nunca ganha URL pública nem assinada**: sai pelo endpoint autenticado, que lê o arquivo com a chave de serviço no servidor. Link assinado circula em conversa e vale para quem o receber.
