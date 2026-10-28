# inventory-v2 — backend

NestJS 11 + Prisma 7 + PostgreSQL (eksterni server; MySQL zadržan kao backup/rollback — vidi `docs/migration-mysql-postgres.md`).

## Preduvjeti

- Node 22+
- Root `.env` sa `DATABASE_URL`, `JWT_SECRET`, `API_PREFIX=backend`

## Lokalno

```bash
cd backend
npm install
npm run prisma:generate
npm run db:migrate:dev    # prva migracija
npm run db:seed           # prazan seed (bez demo podataka)
npm run dev
```

Otvori frontend — prikazuje se **setup wizard** dok nema korisnika u bazi.

### Demo podaci (opcionalno)

```bash
npm run db:seed:demo
```

Kredencijali: `admin` / `admin123`, `kenan.hodzic` / `user123`.

### Potpuni wipe baze (dev)

```bash
npx prisma migrate reset
```

Briše sve podatke, ponovo primjenjuje migracije i pokreće prazan `db:seed`.

Ako reset padne sa `P3018` (npr. `Can't DROP ... check that column/key exists`), prvo označi neuspjelu migraciju kao rolled back, pa ponovi reset:

```bash
npx prisma migrate resolve --rolled-back <ime_migracije>
npx prisma migrate reset
```

**Napomena (2026-06-03):** Usklađene su `20260602090000_inventory_session_v3` i `20260602120000_inventory_committee_scope_v2` za čist `migrate reset` na praznoj bazi.

## Setup API

| Endpoint | Auth | Opis |
|----------|------|------|
| `GET /backend/setup/status` | — | `{ needsSetup: true }` ako nema korisnika |
| `POST /backend/setup/initialize` | — | Jednokratna instalacija (preduzeće + admin) |

Opcionalno: `SETUP_TOKEN` u `.env` — tada POST mora sadržavati `setupToken` u JSON tijelu.

## Skripte

| Skripta | Opis |
|---------|------|
| `npm run dev` | Watch mode |
| `npm run build` | Produkcijski build |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:dev` | Dev migracije |
| `npm run db:seed` | Prazan seed (bez demo) |
| `npm run db:seed:demo` | Demo org/oprema/korisnici |
| `npm run db:studio` | Prisma Studio |

## Moduli

| Modul | Putanja | Napomena |
|-------|---------|----------|
| health | `/backend/health` | DB ping |
| setup | `/backend/setup/*` | Inicijalna instalacija |
| public | `/backend/public/equipment/:id` | Javni QR pregled |
| auth | `/backend/auth/*` | JWT |
| users | `/backend/users` | admin |
| settings | `/backend/settings/*` | public/private |
| org-units | `/backend/org-units`, `/tree` | admin |
| employees | `/backend/employees` | admin CRUD, evidentičar read (scope) |
| categories | `/backend/categories`, `/tree` | admin CRUD, evidentičar read |
| equipment | `/backend/equipment`, `/:id/qr` | scope po ulozi |
| transfers | `/backend/transfers`, `/:id/sign` | admin/evidenticar write |
| uploads | `/backend/uploads` | skenovi transfera |

Global prefix: `backend` (Traefik `PathPrefix(/backend)`).
