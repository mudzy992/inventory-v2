# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY backend/ .
# prisma.config.ts zahtijeva DATABASE_URL pri učitavanju; generate se NE spaja na bazu,
# pa je placeholder namjerno tu.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/evidens"
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-common \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

ARG APP_UID=100
ARG APP_GID=101
RUN groupadd -g "${APP_GID}" app 2>/dev/null || groupadd --system app \
  && useradd -u "${APP_UID}" -g app -d /app -M app 2>/dev/null \
  || useradd --system --gid app --home-dir /app app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/generated ./generated

RUN mkdir -p /app/uploads && chown -R app:app /app
USER app
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]