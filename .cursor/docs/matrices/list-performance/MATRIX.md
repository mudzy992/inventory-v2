# Matrica — list performance (server-side paginacija)

## Baseline (prije migracije)

| Izvor | Problem |
|-------|---------|
| `fetchAppState` | Učitava org-units, employees, categories, equipment, transfers, warehouses, locations u jednom burst-u |
| List API | Nema `page`/`pageSize`; filter/search često u JS nakon `findMany` |
| Equipment/Transfers | Post-filter petlja po scope-u (`canReadEquipment`, `canAccessTransfer`) |
| Inventory sessions | Duboki nested include (committees → lines → equipment) |

## Settings

| Key | Tip | Scope | Default | Opis |
|-----|-----|-------|---------|------|
| `lists.default_page_size` | number | private | 25 | Podrazumijevena veličina stranice za paginirane liste |
| `lists.max_page_size` | number | private | 100 | Gornja granica `pageSize` na API-ju |

## Zajednički API ugovor

### Query (base)

| Param | Tip | Default | Opis |
|-------|-----|---------|------|
| `page` | number | 1 | 1-based indeks stranice |
| `pageSize` | number | iz settings | Broj stavki po stranici |
| `sortBy` | string | resurs-specific | Whitelist po endpointu |
| `sortDir` | `asc` \| `desc` | `asc` | Smjer sortiranja |
| `search` | string | — | Pretraga po whitelisted poljima |

### Response

```json
{ "items": [], "meta": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 0 } }
```

## Endpointi (ciljno stanje)

| Endpoint | Paginacija | Search | Sort | Scope u SQL |
|----------|------------|--------|------|-------------|
| `GET /equipment` | da | da | da | da |
| `GET /equipment/summary` | — | — | — | da |
| `GET /transfers` | da | da | da | da (`warehouseId` filter) |
| `GET /transfers/recent` | limit | — | da | da |
| `GET /employees` | da | da | da | da |
| `GET /employees/search` | limit 20 | da | — | da |
| `GET /users` | da | da | da | admin |
| `GET /warehouses` | da | da | da | da (skladistar keeper; evidentičar registrar scope) |
| `GET /warehouse-stock/...` | da | da | da | da |
| `GET /employee-relocation` | da | — | da | da |
| `GET /disposal-commissions` | da | — | da | da |
| `GET /notifications` | da | — | da | user |
| `GET /inventory-count/sessions` | da | — | da | lazy |
| `GET /org-units/search` | limit 20 | da | — | — |
| `GET /org-units/:id/equipment-subtree-count` | — | — | — | — |
| `GET /categories/search` | limit 20 | da | — | — |
| `GET /locations/*/search` | limit 20 | da | — | — |
| `GET /equipment-catalog` | da | da | da | — |

## Frontend

- `usePaginatedList` — page-level fetch umjesto `state.*.filter`
- `PaginationControls` — UI kontrole
- `fetchBootstrap` — zamjena za puni `fetchAppState` (notifikacije + minimalni kontekst)
- Settings UI tab **Liste** — admin uređuje `lists.default_page_size` / `lists.max_page_size`
- `useCurrentEmployee` — profil u headeru/sidebaru bez bootstrap employees niza
- Unit testovi: `RegistrarScopeService` scope po roli; `pagination.util` + settings

## Testovi

| Komanda | Opis |
|---------|------|
| `cd backend && npm run test:unit` | 121 unit testova (uključujući scope + paginaciju) |
| Ručni QA | `.cursor/plans/list-performance/QA_CHECKLIST.md` |

## Implementacijske faze

Vidi plan `.cursor/plans/backend_list_performance_1d30db39.plan.md`.
