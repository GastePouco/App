# API do GasteMenos (NestJS + Prisma).
#
# Três estágios, cada um por um motivo:
#
# 1. `deps` instala com o lockfile inteiro do monorepo. Copiar só os manifestos
#    antes do código faz esta camada ser reaproveitada enquanto as dependências
#    não mudarem — que é a diferença entre um deploy de 30 s e um de 4 min.
# 2. `build` compila a API e gera o client do Prisma.
# 3. A imagem final leva só o que roda: sem código-fonte, sem ferramentas de
#    build, sem as dependências de desenvolvimento.
#
# Roda como usuário sem privilégio. Se um dia um bug de execução remota
# aparecer aqui, a diferença entre root e `node` é a diferença entre um
# incidente e um desastre.

FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @gastemenos/api... --filter @gastemenos/shared...

# ---------------------------------------------------------------- build

FROM deps AS build
WORKDIR /repo

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @gastemenos/shared build \
 && pnpm --filter @gastemenos/api exec prisma generate \
 && pnpm --filter @gastemenos/api build

# Tira o que era só para compilar. O `rm -rf` antes é necessário: o pnpm se
# recusa a apagar node_modules sem terminal interativo, e sem apagar ele mantém
# as dependências de desenvolvimento.
#
# `prisma` é dependência de produção de propósito — a CLI roda na subida do
# container, no `migrate deploy`, e baixá-la naquele momento seria depender da
# rede do registro para o app subir.
RUN rm -rf node_modules apps/api/node_modules packages/shared/node_modules  && pnpm install --frozen-lockfile --prod --filter @gastemenos/api...  && pnpm --filter @gastemenos/api exec prisma generate

# ----------------------------------------------------------------- ar

FROM node:22-alpine AS producao
RUN corepack enable
WORKDIR /repo

ENV NODE_ENV=production

COPY --from=build --chown=node:node /repo/node_modules node_modules
COPY --from=build --chown=node:node /repo/package.json package.json
COPY --from=build --chown=node:node /repo/pnpm-workspace.yaml pnpm-workspace.yaml
COPY --from=build --chown=node:node /repo/packages/shared packages/shared
COPY --from=build --chown=node:node /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/prisma apps/api/prisma

USER node
WORKDIR /repo/apps/api
EXPOSE 3000

# A migration roda na subida, antes da API aceitar tráfego: schema atrasado com
# código novo quebra na primeira requisição, e aí já há gente dentro.
# `dist/src/main.js`, não `dist/main.js`: o tsconfig inclui prisma/ e test/,
# então o compilador mantém a pasta src dentro de dist.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
