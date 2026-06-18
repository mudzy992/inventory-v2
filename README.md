# Evidens

**Sub-naslov:** Evidencija i zaduženje opreme

Web aplikacija za evidenciju opreme po organizacionoj hijerarhiji — zaduženja, prenosi, dokumenti, QR.

| | |
|---|---|
| **Produkcija** | https://evidens.ba101.top |
| **API** | https://evidens.ba101.top/backend |
| **GitHub** | [mudzy992/inventory-v2](https://github.com/mudzy992/inventory-v2) |

## Struktura

```
inventory-v2/
├── backend/     # NestJS + Prisma (faza 1+)
├── frontend/    # React + Vite + Tailwind
├── docker/      # rezervisano (routing isključivo preko Traefik labela)
└── .cursor/     # plan, matrice, pravila
```

## Lokalni razvoj

```bash
# 1. Backend (port 3000)
cd backend
npm install
npm run prisma:generate
npm run db:migrate
npm run db:seed    # prazan — bez demo korisnika
npm run dev

# 2. Frontend (port 5173, drugi terminal)
cd frontend
npm install
npm run dev
```

Frontend u dev modu šalje requeste na **`/backend`** (Vite proxy → `http://localhost:3000`).  
U Network tabu vidiš `localhost:5173/backend/...` — to je ispravno; Vite prosljeđuje na backend.

Produkcijski build koristi `VITE_API_URL` (npr. `https://evidens.ba101.top/backend`).

Provjera: `GET http://localhost:3000/backend/health` · prvi start → setup wizard u browseru.

Demo korisnici (opcionalno): u `backend/` pokreni `npm run db:seed:demo` → `admin` / `admin123`.

Potpuni wipe baze (dev): `cd backend && npx prisma migrate reset`.

## Env

1. Kopiraj `.env.example` → `.env` (već postoji template).
2. Popuni **eksterni MySQL** (`DATABASE_HOST`, `DATABASE_URL`, …).
3. Postavi `JWT_SECRET`.
4. **Ne** stavljaj `NODE_ENV` u `.env` — Vite dev to ne podržava (koristi se samo u Dockeru).

`.env` nije u gitu.

Socket.IO u dev modu ide preko Vite proxyja (`/backend` → `localhost:3000`); backend mora raditi prije nego što se frontend spoji.

## Docker

```bash
# Dev (bez Traefik)
docker compose up --build

# Produkcija (Traefik mreža web mora postojati)
docker compose -f docker-compose.prod.yml up -d --build
```

## Plan i matrice

- [Plan overview](.cursor/plans/inventory-v2/00_overview.md)
- [Checklist](.cursor/plans/inventory-v2/CHECKLIST.md)
- [Design tokens](.cursor/docs/design-tokens.md)
