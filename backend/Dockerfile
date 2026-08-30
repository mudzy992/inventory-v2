# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


FROM deps AS build

COPY . .

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/evidens"

RUN npx prisma generate
RUN npm run build


FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/tmp

# NAPOMENA: LibreOffice se OD SADA ne instalira ovdje — DOCX→PDF konverzija
# radi zaseban "document-worker" servis/image (vidi ../document-worker/),
# koji se puni preko BullMQ `document-generation` reda (vidi
# src/modules/documents/). Backend samo enqueue-uje poslove i čita
# rezultate sa dijeljenog uploads volume-a; nikad sam ne poziva `soffice`.
# Ovo drži backend image manjim/bržim za build i uklanja LibreOffice napad
# površinu iz javno-izloženog (Traefik/Coolify) kontejnera.

ARG APP_UID=100
ARG APP_GID=101

RUN groupadd -g "${APP_GID}" app 2>/dev/null || groupadd --system app \
  && useradd -u "${APP_UID}" -g app -d /app -M app 2>/dev/null \
  || useradd --system --gid app --home-dir /app app

COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts ./
COPY --from=build --chown=app:app /app/generated ./generated

RUN mkdir -p /app/uploads \
  && chown app:app /app/uploads

USER app

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]