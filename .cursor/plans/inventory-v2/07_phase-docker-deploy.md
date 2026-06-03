# Faza 6 — Docker i Traefik deploy

## Cilj

Produkcijski compose sa mrežom `web`, TLS Let's Encrypt (`le`), host `inventory-v2.ba101.top`.

## Servisi (`docker-compose.prod.yml`)

| Servis | Slika / build | Port interni | Napomena |
|--------|---------------|--------------|----------|
| `backend` | build `./backend` | 3000 | NestJS |
| `frontend` | build `./frontend` → `serve` (Node) | 3000 | statički `dist/`, **bez nginx** |

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
  - traefik.http.routers.inventory-v2-web.rule=Host(`inventory-v2.ba101.top`)
  - traefik.http.routers.inventory-v2-web.entrypoints=websecure
  - traefik.http.routers.inventory-v2-web.tls=true
  - traefik.http.routers.inventory-v2-web.tls.certresolver=le
  - traefik.http.services.inventory-v2-web.loadbalancer.server.port=3000
```

## Traefik labele — backend (PathPrefix `/backend`)

**Strategija A (preporučeno):** Nest `setGlobalPrefix('backend')` — Traefik **bez** strip middleware.

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=web
  - traefik.http.routers.inventory-v2-api.rule=Host(`inventory-v2.ba101.top`) && PathPrefix(`/backend`)
  - traefik.http.routers.inventory-v2-api.entrypoints=websecure
  - traefik.http.routers.inventory-v2-api.tls=true
  - traefik.http.routers.inventory-v2-api.tls.certresolver=le
  - traefik.http.services.inventory-v2-api.loadbalancer.server.port=3000
  - traefik.http.routers.inventory-v2-api.priority=100
```

**Strategija B:** StripPrefix `/backend` + Nest bez prefiksa — dokumentovati u matrici ako server već koristi strip.

## Frontend (bez nginx)

- Kontejner servira `dist/` preko `serve -s` na portu **3000**.
- Routing isključivo **Traefik labelama** — nema reverse proxy u compose-u.
- API: browser direktno na `https://inventory-v2.ba101.top/backend/...` (odvojen Traefik router).

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

## Dockerfile — frontend

Vidi `frontend/Dockerfile` — multi-stage build + `serve` na portu 3000.

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
