# Supabase como banco de produção

> **Estado:** ✅ EXECUTADO. Projeto em sa-east-1 com as 4
> migrations aplicadas, 29 tabelas, RLS ligada em todas, nenhum privilégio para
> `anon`/`authenticated`, balde `exportacoes` privado e ida e volta de arquivo
> verificada. Conferido de fora: a chave publicável recebe 401 (`42501`) em
> `User`, `Receipt`, `PriceObservation`, `Session` e `Store`.
> ⬜ PENDENTE só o deploy da API e do web (Coolify) com essas variáveis.

O Supabase entra **só como Postgres gerenciado e armazenamento de arquivo**. A
API continua sendo o único cliente do banco: nada de PostgREST, nada de Supabase
Auth, nada de `@supabase/supabase-js` no web.

Por que não o Supabase inteiro: o login, as sessões rotativas, o consentimento
versionado e o mínimo de anonimato dos preços (5 notas de 3 pessoas) são regra de
negócio testada em `apps/api/test`. Em Supabase Auth + RLS elas virariam policy
SQL sem teste — que foi exatamente onde o aplicativo anterior tinha o furo. E a
API é necessária de qualquer forma, por causa do publisher do oráculo e do x402.

---

## 1. Conexão

O Prisma separa a conexão de uso da conexão de migration, e no Supabase elas são
portas diferentes do mesmo pooler:

| Variável | Porta | Para quê | Por quê |
|---|---|---|---|
| `DATABASE_URL` | 6543 | requisições do dia a dia | transaction mode aguenta muita conexão curta |
| `DIRECT_URL` | 5432 | `migrate`, `db execute`, `introspect` | transaction mode **não** aceita DDL nem prepared statement |

```bash
DATABASE_URL="postgresql://postgres.<PROJECT-REF>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.<PROJECT-REF>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

`pgbouncer=true` desliga os prepared statements do Prisma; `connection_limit=1`
evita que cada instância da API segure um punhado de conexões do pooler.

Em desenvolvimento as duas apontam para o Postgres do Docker — é o que está em
`.env.example`. **Testes e CI continuam no Docker**, nunca no Supabase: a suíte
cria e apaga usuários, e o incidente do `deleteMany` (ver `12-PROGRESSO.md`,
fase 6) é o motivo de nenhuma suíte apontar para base compartilhada.

Região: **sa-east-1 (São Paulo)**. O job de agregação de preços e as consultas de
ranking fazem várias idas ao banco; atravessar o Atlântico a cada uma cobra caro.

## 2. Fechar o schema para as chaves públicas

O ponto que mais dá errado com Prisma + Supabase: as tabelas nascem em `public`,
e o Supabase publica `public` pela API PostgREST. A chave `anon` é publica por
definição — vai no javascript de qualquer cliente. Sem tratar isso, ela lê a base
inteira.

`apps/api/prisma/sql/blindar-schema.sql` resolve com duas camadas:

1. **RLS ligada em toda tabela, sem nenhuma policy.** Sem policy ninguém passa. A
   API não sente: conecta como dona das tabelas, e dona não entra na RLS (só
   entraria com `FORCE ROW LEVEL SECURITY`).
2. **Privilégios revogados de `anon` e `authenticated`**, inclusive os padrões
   para tabelas futuras. RLS protege linha; privilégio protege a tabela.

O script é idempotente e não faz nada fora do Supabase (os papéis não existem no
Docker). Ele já foi aplicado como a migration `20260924170500_blindar_schema`, e
**precisa rodar de novo depois de toda migration que criar tabela**:

```bash
DATABASE_URL="$DIRECT_URL" pnpm --filter @gastemenos/api db:blindar
```

`DATABASE_URL="$DIRECT_URL"` porque `prisma db execute` usa a conexão de uso, e
`DO $$ ... $$` com DDL quer a conexão direta.

No painel, ainda vale tirar `public` de **Settings → API → Exposed schemas**. São
defesas independentes: a de cima é do banco e vai junto com o dump; a do painel
alguém pode reverter num clique.

## 3. Arquivos: Supabase Storage

O ZIP de "Baixar meus dados" ia para o disco do container. Disco de container é
efêmero: um deploy entre o pedido e o download apagaria o arquivo, e a pessoa
veria "pronto" num link que não baixa nada.

`ArmazenamentoService` tem dois destinos e escolhe pelo ambiente: disco quando
não há credencial (desenvolvimento e teste), Supabase Storage quando há.

```bash
SUPABASE_URL="https://<PROJECT-REF>.supabase.co"
SUPABASE_SECRET_KEY="sb_secret_..."
SUPABASE_STORAGE_BUCKET="exportacoes"
```

`SUPABASE_SECRET_KEY` é o nome atual das chaves do Supabase (`sb_secret_…`, que
substituíram a `service_role`); `SUPABASE_SERVICE_ROLE_KEY` ainda é aceito, para
não quebrar ambiente já configurado.

A **chave publicável** (`sb_publishable_…`) não é usada em lugar nenhum deste
repositório, e isso é proposital: o web fala com a nossa API, nunca com o
Supabase. Se um dia ela aparecer no código do web, alguma coisa saiu do lugar.

O balde é **privado**, sem policy nenhuma: o acesso é sempre pela chave secreta,
no servidor. Ele foi criado com `file_size_limit` de 50 MB e
`allowed_mime_types` `["application/zip"]` — um balde que só aceita o que a API
grava é uma superfície a menos.

**O arquivo nunca ganha URL pública, nem assinada.** Quem baixa passa pelo
endpoint autenticado `GET /v1/me/export/:id/download`, que lê o conteúdo pelo
serviço e devolve. Link assinado é portátil por natureza — circula em conversa,
sobrevive à troca de senha e vale para qualquer um que o receba. Num arquivo com
o histórico de compras inteiro de uma pessoa, isso não serve.

A chave de serviço ignora RLS e nunca pode chegar ao web: ela vive só no
ambiente da API.

## 4. O que o Supabase não resolve

- **Redis.** A fila da leitura de nota (BullMQ) continua precisando de um Redis
  no servidor. `REDIS_URL` aponta para ele no deploy.
- **Os quatro `@Cron`** (agregação de preços, fechamento do mês, aviso de
  sequência, expurgo LGPD) rodam no processo da API. Com mais de uma instância,
  cada job rodaria em todas — o que já vale hoje, Supabase ou não. Antes de
  escalar horizontalmente, envolver os jobs num `pg_advisory_lock`.
- **Backup.** Passa a ser do Supabase (PITR no plano pago). O item de backup
  diário em `09-SEGURANCA-LGPD.md` está atendido por ele.

## 5. Rodar comandos contra o Supabase sem mexer no desenvolvimento

O `.env` aponta para o Postgres do Docker e **continua assim**: é onde
desenvolvimento e teste têm de rodar. Os comandos que falam com produção usam um
segundo arquivo, `.env.supabase` (fora do git, como todo `.env.*`):

```bash
cd apps/api

# Conferir o que falta aplicar:
npx dotenv -e ../../.env.supabase -- npx prisma migrate status

# Aplicar o schema:
npx dotenv -e ../../.env.supabase -- npx prisma migrate deploy

# Fechar o schema de novo, depois de uma migration que crie tabela:
npx dotenv -e ../../.env.supabase -- npx prisma db execute   --file prisma/sql/blindar-schema.sql --schema prisma/schema.prisma
```

Cuidado com a senha do Postgres na string de conexão: caractere como `&` ou `#`
precisa ir **percent-encoded** (`%26`, `%23`), senão a URL termina antes da hora
e o erro que aparece é de autenticação, não de sintaxe.

### Seed: em banco remoto ele não apaga nada

O seed apaga todas as tabelas antes de inserir, porque reexecutá-lo é rotina em
desenvolvimento. Contra um banco que não é local ele muda de comportamento:
**exige a base vazia e só insere**. Se houver dado, para e manda limpar à mão.

Isso não é uma confirmação a mais para digitar — confirmação a gente digita no
automático. É tirar do seed, por construção, a capacidade de destruir dado
remoto.

```bash
npx dotenv -e ../../.env.supabase -- npx tsx prisma/seed.ts
```

O conteúdo é de demonstração (Camila Alves, R$ 1.284,60 em setembro). Serve para
o vídeo do hackathon e para conferir as telas; para valer como produção, a base
tem de nascer vazia e com `USER_HASH_SECRET` definitivo.

### Conferência final

```bash
# RLS em todas as tabelas
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

# Nenhum privilégio para as chaves públicas
SELECT grantee, count(*) FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
 GROUP BY grantee;
```

E de fora, com a chave publicável, que é o teste que vale: qualquer tabela em
`/rest/v1/` tem de responder **401** com `42501`. No painel, tirar `public` de
**Settings → API → Exposed schemas** fecha por cima disso.

## 6. Rodar a aplicação local contra o Supabase

```bash
pnpm --filter @gastemenos/api dev:supabase   # API lendo .env.supabase
pnpm --filter @gastemenos/web dev            # web, como sempre
```

`pnpm dev` (sem sufixo) continua no Postgres do Docker, e **os testes também** —
eles leem o `.env`. É essa separação que impede a suíte, que cria e apaga
usuários, de encostar na base do Supabase.

Para confirmar de qual banco a API está lendo, mude um dado direto no Supabase
e chame `/v1/me`: se o valor novo aparecer, é de lá.

## 7. O que continua igual

Prisma, todos os módulos da API, os testes, o web e o design system. A troca é de
endereço do banco e de destino de arquivo; nenhuma regra de negócio muda.
