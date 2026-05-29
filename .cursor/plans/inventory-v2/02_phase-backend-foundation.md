# Faza 1 — Backend foundation

## Cilj

NestJS aplikacija sa Prisma 7, MySQL, autentifikacijom, settings registry-jem i health endpointom.

## Modul struktura (`backend/src/modules/`)

| Modul | Odgovornost |
|-------|-------------|
| `health` | `GET /backend/health` (ili bez prefiksa + global prefix) |
| `auth` | login, refresh, logout, `me` |
| `users` | CRUD korisnika, role, `managedOrgUnitIds` |
| `settings` | public/private settings, feature flags |
| `prisma` | global PrismaService |

## Prisma modeli (prva iteracija)

```
User          → id, employeeId?, username, passwordHash, role, isActive, managedOrgUnits (M2M)
Employee      → id, firstName, lastName, title, orgUnitId, email?, phone?
OrgUnit       → id, name, type (enum), parentId?, signerId?
Category      → id, name, description, parentId?, fields (JSON), optionalFields (JSON)
Equipment     → id, categoryId, inventoryNumber, specifications (JSON), status, ...
Transfer      → id, equipmentId, type, from/to meta, signerId, status, documentNumber, ...
Notification  → id, userId, type, title, message, read, relatedId?
SavedFilter   → id, userId, name, filters (JSON)
Setting       → key, scope (public|private), type, value, description
Upload        → id, path, mime, size, entityType, entityId
RefreshToken  → opcionalno za revoke
```

**Pravilo:** sve promjene DB kroz `prisma migrate dev` (skill: prisma-mysql-workflow).

## Auth dizajn

- Login: `POST /backend/auth/login` → `{ accessToken, refreshToken, user }`
- Global prefix: `backend` (Traefik strip prefix ili Nest `setGlobalPrefix('backend')` — **jedna strategija**, dokumentovati u deploy matrici)
- Guards: `JwtAuthGuard`, `RolesGuard` (`admin`, `evidenticar`, `user`)
- Evidentičar scope: decorator `@OrgScope()` filtrira po `managedOrgUnitIds` + potomcima u stablu

## Settings contract (obavezno od starta)

Registry u `backend/src/modules/settings/settings.registry.ts`:

| Key | Tip | Scope | Opis |
|-----|-----|-------|------|
| `app.name` | string | public | Prikazano ime |
| `app.subtitle` | string | public | Sub-naslov |
| `features.qr_scanner` | boolean | public | QR modul |
| `features.cross_service_transfer` | boolean | private | Admin cross-service prenosi |
| `upload.max_mb` | number | private | Limit uploada |
| `notifications.enabled` | boolean | public | In-app notifikacije |

UI pravilo (kasnije): boolean → switch, number → input, string → text + opis.

## API konvencije

- REST, JSON
- Paginacija: `?page=&limit=`
- Greške: Nest standard + `{ message, code }`
- Validacija: `class-validator` DTO

## Skripte (`backend/package.json`)

- `dev`, `build`, `start:prod`
- `db:migrate`, `db:seed`, `db:studio`
- `prisma:generate`

## Seed

- Demo org struktura + korisnici (kao u `frontend/src/store.ts`) — **bez plain text lozinki u produkciji**; seed samo dev.

## Kriterijumi završetka

- [ ] `npm run dev` u backend-u, health OK
- [ ] Migracija primijenjena lokalno
- [ ] Login radi za seed admin
- [ ] Settings GET public/private
