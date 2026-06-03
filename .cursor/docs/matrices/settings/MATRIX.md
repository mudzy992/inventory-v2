# Matrica — Settings contract

## Registry (source: `backend/src/modules/settings/settings.registry.ts`)

| Key | Tip | Scope | Opis |
|-----|-----|-------|------|
| `app.name` | string | public | Prikazano ime |
| `app.subtitle` | string | public | Sub-naslov |
| `app.initialized` | boolean | private | Setup wizard završen |
| `features.qr_scanner` | boolean | public | QR modul |
| `features.cross_service_transfer` | boolean | private | Admin cross-service prenosi |
| `transfer.allow_finalize_without_upload` | boolean | private | Finalizacija bez uploada |
| `upload.max_mb` | number | private | Limit uploada (MB) |
| `notifications.enabled` | boolean | public | In-app notifikacije |
| `company.name` | string | public | Naziv preduzeća (štampa) |
| `company.address` | string | public | Adresa |
| `company.city` | string | public | Grad |
| `company.postalCode` | string | public | Poštanski broj |
| `company.phone` | string | public | Telefon |
| `company.email` | string | public | Email |
| `company.taxId` | string | public | JIB/ID |

## API

| Endpoint | Auth | Opis |
|----------|------|------|
| `GET /backend/settings/public` | — | Javne postavke |
| `GET /backend/settings/private` | admin | Privatne postavke |
| `PATCH /backend/settings/:key` | admin | Ažuriranje vrijednosti |

Setup wizard postavlja `company.*` i `app.name` preko `SettingsService.upsertValues`.

## Pravila

- Nepoznat `key` → 404.
- Vrijednosti se čuvaju kao string u DB; parsiranje prema `valueType`.
- Na startu aplikacije `ensureDefaults()` kreira nedostajuće ključeve iz registry-ja.
