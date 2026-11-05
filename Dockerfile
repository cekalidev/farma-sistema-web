# syntax=docker/dockerfile:1

# Imagen del frontend: build con Vite+ y servido estático con nginx sin root.
#
#   docker build -t farma-web .
#   docker run -p 8080:8080 -e API_UPSTREAM=http://api:8000 farma-web
#
# Con Podman, añade `--format docker` para que se conserve el HEALTHCHECK.

ARG VITE_PLUS_VERSION=1.5.0
ARG NGINX_VERSION=1.30.6-alpine3.24

# ---------- build ----------
FROM ghcr.io/voidzero-dev/vite-plus:${VITE_PLUS_VERSION} AS build
WORKDIR /app

# Sin hooks de git (no hay repo en el contexto) y modo no interactivo
ENV VP_GIT_HOOKS=0 \
    CI=true

# Dependencias primero para aprovechar la caché de capas
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version* ./
RUN vp install --frozen-lockfile

COPY --chown=vp:vp . .

# Variables públicas: quedan incrustadas en el bundle, nunca secretos
ARG VITE_API_URL=/api/v1
ARG VITE_API_MOCKS=no
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_API_MOCKS=${VITE_API_MOCKS}

# El service worker de MSW solo se publica si la app corre entera con mocks
RUN vp build \
 && if [ "$VITE_API_MOCKS" != "todo" ]; then rm -f dist/mockServiceWorker.js; fi

# ---------- runtime ----------
FROM docker.io/nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime

LABEL org.opencontainers.image.title="farma-sistema-web" \
      org.opencontainers.image.description="SPA de farmacia servida con nginx sin root"

# Upstream de la API (sin barra final). El entrypoint de nginx aplica envsubst
# a /etc/nginx/templates/*.template; el filtro evita tocar otras variables.
ENV API_UPSTREAM=http://api:8000 \
    NGINX_ENVSUBST_FILTER=^API_

COPY --chown=101:101 docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
