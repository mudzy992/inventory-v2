# Matrice — indeks

Centralni katalog poslovnih matrica aplikacije Inventory v2. Svaka matrica definira pravila, validacije i edge-caseove za modul.

Detaljni guard audit (preconditions, BE/FE status, poruke): [GUARDS_REGISTRY.md](./GUARDS_REGISTRY.md).

## Moduli

| Slug | Dokument | Opis |
|------|----------|------|
| `auth-session` | [auth-session/MATRIX.md](./auth-session/MATRIX.md) | Login, refresh token, logout, istek sesije |
| `roles-access` | [roles-access/MATRIX.md](./roles-access/MATRIX.md) | Uloge, registrar scope, coordinator scope |
| `settings` | [settings/MATRIX.md](./settings/MATRIX.md) | Registry postavki, feature flagovi, enforcement |
| `org-hierarchy` | [org-hierarchy/MATRIX.md](./org-hierarchy/MATRIX.md) | Org. hijerarhija, parent-child tipovi, brisanje |
| `locations` | [locations/MATRIX.md](./locations/MATRIX.md) | Kantoni, gradovi, veza na org. jedinice |
| `warehouses` | [warehouses/MATRIX.md](./warehouses/MATRIX.md) | Skladišta, keepers, effective warehouse |
| `categories-fields` | [categories-fields/MATRIX.md](./categories-fields/MATRIX.md) | Kategorije, dinamička polja, brisanje |
| `equipment-status` | [equipment-status/MATRIX.md](./equipment-status/MATRIX.md) | Statusi opreme, prelazi, pristup |
| `transfers` | [transfers/MATRIX.md](./transfers/MATRIX.md) | Prenosnice, potpis, PDF, generation flags |
| `warehouse-stock` | [warehouse-stock/MATRIX.md](./warehouse-stock/MATRIX.md) | Prijem, izdavanje, lotovi |
| `maintenance-parts` | [maintenance-parts/MATRIX.md](./maintenance-parts/MATRIX.md) | Instalirani dijelovi, potrošnja |
| `employee-relocation` | [employee-relocation/MATRIX.md](./employee-relocation/MATRIX.md) | Premještaj radnika + oprema |
| `employees` | [employees/MATRIX.md](./employees/MATRIX.md) | Radnici, status, deaktivacija |
| `inventory-count` | [inventory-count/MATRIX.md](./inventory-count/MATRIX.md) | Godišnji popis, komisije, zatvaranje |
| `disposal-commission` | [disposal-commission/MATRIX.md](./disposal-commission/MATRIX.md) | Komisija rashoda, glasanje |
| `notifications` | [notifications/MATRIX.md](./notifications/MATRIX.md) | In-app notifikacije, realtime |
| `labels` | [labels/MATRIX.md](./labels/MATRIX.md) | QR / label generisanje |
| `list-performance` | [list-performance/MATRIX.md](./list-performance/MATRIX.md) | Paginacija, prefetch |
| `install-setup` | [install-setup/MATRIX.md](./install-setup/MATRIX.md) | First-run setup |
| `setup-onboarding` | [setup-onboarding/MATRIX.md](./setup-onboarding/MATRIX.md) | Onboarding / početno podešavanje |
| `moderator` | [moderator/MATRIX.md](./moderator/MATRIX.md) | Moderator (scoped admin) |
| `deploy-traefik` | [deploy-traefik/MATRIX.md](./deploy-traefik/MATRIX.md) | Produkcijski deploy, Docker, Traefik |

> Status svih matrica: implementirane u kodu; registar u [docs/STATUS.md](../../../docs/STATUS.md).
> (Redovi `setup-onboarding` i `moderator` dodati 2026-10-28 — folderi su postojali, u indeksu ih nije bilo.)

## Guard slojevi

```
UI (disable/hide) → FE validacija (toast) → API → feature flag → uloga/scope → biznis pravila → DB
```

- **Backend** je obavezan za svaku write akciju.
- **Frontend** guardovi koriste `frontend/src/helpers/guards/` — iste poruke kao backend gdje je moguće.
- **Poruke** na bosanskom; centralizovane u `*-messages.util.ts` (BE) i `*-guards.ts` / `*-messages.ts` (FE).

## Ažuriranje

Promjena poslovne logike ⇒ update odgovarajući `MATRIX.md` + `CHANGELOG.md` + red u `GUARDS_REGISTRY.md`.
