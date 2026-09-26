# Web do GasteMenos (Vite + PWA), servido por nginx.
#
# O build é estático: o que vai para produção são arquivos, e servi-los com
# Node seria pagar um processo por algo que o nginx faz melhor.
#
# Duas coisas que o SPA exige do servidor e quase sempre esquecem:
#
# 1. **Rota que não é arquivo cai no index.html**, senão abrir
#    /gastos direto na barra de endereço dá 404.
# 2. **O service worker não pode ser cacheado.** `sw.js` com cache longo prende
#    a pessoa numa versão antiga — o app "atualiza" e nada muda.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @gastemenos/web...

COPY design-system design-system
COPY packages packages
COPY apps/web apps/web

RUN pnpm --filter @gastemenos/shared build && pnpm --filter @gastemenos/web build

# ----------------------------------------------------------------- ar

FROM nginx:1.27-alpine AS producao

COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# Em `templates/`, o entrypoint do nginx roda envsubst antes de subir.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Nome do serviço da API na rede do Coolify; trocável por variável.
ENV API_HOST=api
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

EXPOSE 80
