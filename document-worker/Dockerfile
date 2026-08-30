# syntax=docker/dockerfile:1
#
# Document Worker — zaseban interni servis za Evidens Document Engine.
# Konzumira BullMQ `document-generation` red (backend/src/modules/documents/)
# i konvertuje DOCX/XLSX/ODT -> PDF preko LibreOffice-a (soffice --headless).
#
# NAMJERNO odvojen od backend image-a (vidi ../backend/Dockerfile) — LibreOffice
# je težak, ima veliku napad površinu (parsiranje proizvoljnih Office formata) i
# nema razloga da bude u istom kontejneru kao javno izložen (Traefik/Coolify)
# HTTP API. Ovaj servis nema HTTP API i NIJE izložen javno — vidi docker-compose.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Nema package-lock.json u repo-u dok se prvi put ne pokrene `npm install` —
# fallback na `npm install` ako `npm ci` ne uspije zbog nedostajućeg lockfile-a.
RUN npm ci 2>/dev/null || npm install


FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# LibreOffice (headless konverzija) + minimalan font set (dovoljan za
# korektan izgled DOCX/XLSX obrazaca korišćenih u Evidensu). libreoffice-writer
# pokriva .docx/.odt, libreoffice-calc pokriva .xlsx (zahtjev: DOCX, XLSX, ODT
# -> PDF). `--no-install-recommends` + čišćenje apt cache-a drži image manjim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-common \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-core \
    curl \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -f

ARG APP_UID=100
ARG APP_GID=101

# Isti UID:GID kao backend (vidi ../backend/Dockerfile) — worker dijeli isti
# UPLOAD_DIR volume (host direktorij vlasništva app:app, vidi
# scripts/fix-upload-permissions.sh); poklapajući UID:GID izbjegava dodatnu
# permission-fixing logiku samo za ovaj servis.
RUN groupadd -g "${APP_GID}" app 2>/dev/null || groupadd --system app \
  && useradd -u "${APP_UID}" -g app -d /app -M app 2>/dev/null \
  || useradd --system --gid app --home-dir /app app

COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist

RUN mkdir -p /app/uploads /tmp/document-worker \
  && chown -R app:app /app/uploads /tmp/document-worker

USER app

# NEMA EXPOSE — servis je čisto interni BullMQ konzument, ne sluša na mrežnom
# portu koji bi trebalo objaviti drugim kontejnerima. Health server (127.0.0.1
# only, vidi src/health-server.ts) postoji isključivo za Docker HEALTHCHECK,
# koji se izvršava unutar mrežnog namespace-a ovog kontejnera.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
