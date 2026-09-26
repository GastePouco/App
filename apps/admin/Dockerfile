# Painel administrativo (Vite), servido por nginx.
#
# Aplicação separada do app das pessoas de propósito: o código do painel não vai
# no pacote que o consumidor baixa, e o deploy é separável — dá para deixar o
# painel atrás de rede fechada sem prender o app público junto.
#
# O build é estático: o que vai para produção são arquivos, e servi-los com
# Node seria pagar um processo por algo que o nginx faz melhor.
#
# Rota que não é arquivo cai no index.html: sem isso, abrir /contas direto na
# barra de endereço dá 404.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @gastemenos/admin...

COPY design-system design-system
COPY packages packages
COPY apps/admin apps/admin

RUN pnpm --filter @gastemenos/shared build && pnpm --filter @gastemenos/admin build

# ----------------------------------------------------------------- ar

FROM nginx:1.27-alpine AS producao

COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
# Em `templates/`, o entrypoint do nginx roda envsubst antes de subir.
COPY apps/admin/nginx.conf.template /etc/nginx/templates/default.conf.template

# Nome do serviço da API na rede do Coolify; trocável por variável.
ENV API_HOST=api
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

EXPOSE 80
