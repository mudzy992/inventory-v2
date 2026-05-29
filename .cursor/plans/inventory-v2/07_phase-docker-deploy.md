# Faza 6 — Docker i Traefik deploy

## Cilj

Produkcijski compose sa mrežom `web`, TLS Let's Encrypt (`le`), host `opremnica.ba101.top`.

## Servisi (`docker-compose.prod.yml`)

| Servis | Slika / build | Port interni | Napomena |
|--------|---------------|--------------|----------|
| `backend` | build `./backend` | 3000 | NestJS |
| `frontend` | build `./frontend` → nginx | 80 | statički `dist/` |

**Napomena:** Traefik je van compose-a (već na serveru) — samo labele na servisima.

## Mreža

```yaml
networks:
  web:
    external: true
  internal:
    driver: bridge
```

- `frontend` + `backend` → `web` (+ `internal` za backend ako treba izolacija)
- **MySQL:** eksterni server — `DATABASE_URL` u `.env`, nema MySQL kontejnera

## Traefik labele — frontend

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=web
  - traefik.http.routers.opremnica-frontend.rule=Host(`opremnica.ba101.top`)
  - traefik.http.routers.opremnica-frontend.entrypoints=websecure
  - traefik.http.routers.opremnica-frontend.tls=true
  - traefik.http.routers.opremnica-frontend.tls.certresolver=le
  - traefik.http.services.opremnica-frontend.loadbalancer.server.port=80
```

## Traefik labele — backend (PathPrefix `/backend`)

**Strategija A (preporučeno):** Nest `setGlobalPrefix('backend')` — Traefik **bez** strip middleware.

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=web
  - traefik.http.routers.opremnica-api.rule=Host(`opremnica.ba101.top`) && PathPrefix(`/backend`)
  - traefik.http.routers.opremnica-api.entrypoints=websecure
  - traefik.http.routers.opremnica-api.tls=true
  - traefik.http.routers.opremnica-api.tls.certresolver=le
  - traefik.http.services.opremnica-api.loadbalancer.server.port=3000
  - traefik.http.routers.opremnica-api.priority=100
```

**Strategija B:** StripPrefix `/backend` + Nest bez prefiksa — dokumentovati u matrici ako server već koristi strip.

## Frontend nginx

- `try_files` za SPA
- **Ne** proxy `/backend` ako API ide direktno na isti host (browser zove `https://opremnica.ba101.top/backend/...`)

## Socket.IO iza Traefik

- Router: `PathPrefix(`/backend/socket.io`)` ili dedicated path
- `traefik.http.services.opremnica-api.loadbalancer.server.scheme=http`
- WebSocket headers: Traefik 2.x automatski uz `websecure`

## Dockerfile — backend (skica)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json prisma ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

## Dockerfile — frontend (skica)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=https://opremnica.ba101.top/backend
COPY . .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
```

## Lokalni dev compose (`docker-compose.yml`)

- samo `mysql` + opcionalno `backend` bez Traefik labela
- port map: `3306`, `3000`, `5173` host dev

## Deploy checklist

- [ ] DNS `A` / `CNAME` → server sa Traefik
- [ ] `.env` na serveru (ne u git)
- [ ] `prisma migrate deploy` u entrypoint ili jednokratno
- [ ] Volume za uploads i mysql

## Matrica

`.cursor/docs/matrices/deploy-traefik/MATRIX.md`
