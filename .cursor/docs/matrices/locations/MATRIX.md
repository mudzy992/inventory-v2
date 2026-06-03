# Matrica: Registar lokacija

## Model

- `Canton` → `City` (1:N)
- `OrgUnit.locationCityId` — eksplicitna lokacija (nullable)
- `OrgUnit.effectiveLocationCityId` — denormalizovano pri PATCH org jedinice

## Nasljeđivanje

1. Ako `orgUnit.locationCityId` postoji → efektivni grad = taj.
2. Inače penji se `parentId` dok se ne nađe `locationCityId` ili korijen.
3. Radnik: efektivna lokacija = efektivna lokacija org jedinice radnika.

## API

| Endpoint | Uloge |
|----------|-------|
| `GET/POST /locations/cantons` | admin write; evidenticar/skladistar read |
| `PATCH/DELETE /locations/cantons/:id` | admin; delete samo ako nema gradova |
| `GET/POST /locations/cities` | admin write; evidenticar/skladistar read |
| `PATCH/DELETE /locations/cities/:id` | admin; delete odbijen ako grad referencira org/skladište/komisiju |
| `PATCH /org-units/:id` + `locationCityId` | admin |

## UI

- Admin: stranica **Lokacije** — tab Registar (hijerarhija kanton → gradovi, edit/delete), tabovi Kantoni/Gradovi za brzo dodavanje
- **Organizacija**: picker grada za `direkcija`, `distribucija`, `podrucje`, `podruznica`; djeca prikazuju naslijeđeni grad (read-only)

## Evidentičar

- Dodjela pristupa po **gradu** (`cityId`), ne po org. jedinici.
- Efektivni grad radnika = lokacija za rashod, popis i filter opreme.
