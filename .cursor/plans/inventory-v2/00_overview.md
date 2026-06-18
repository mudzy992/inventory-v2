# Inventory v2 — plan projekta (overview)

## Identitet

| Polje | Vrijednost |
|-------|------------|
| **Naziv (produkt)** | Evidens |
| **Sub-naslov** | Evidencija i zaduženje opreme |
| **Slug (repo)** | `inventory-v2` |
| **Subdomen** | `evidens.ba101.top` |
| **API** | `https://evidens.ba101.top/backend` |
| **GitHub** | `mudzy992/inventory-v2` |
| **Lokalni repo** | `C:\Users\m.ceric\Documents\GitHub\inventory-v2` |

## Odluke (2026-05-29)

- Color scheme: definisan u `.cursor/docs/design-tokens.md`
- MySQL: **eksterni server** (nema MySQL servisa u compose)
- Git user: **mudzy992**
- Desktop prototip prebačen u GitHub monorepo (`frontend/` + `backend/`)

## Faze

| Faza | Dokument |
|------|----------|
| 0 | [01_phase-foundation.md](./01_phase-foundation.md) |
| 1 | [02_phase-backend-foundation.md](./02_phase-backend-foundation.md) |
| 2 | [03_phase-domain-core.md](./03_phase-domain-core.md) |
| 3 | [04_phase-transfers-documents.md](./04_phase-transfers-documents.md) |
| 4 | [05_phase-frontend-integration.md](./05_phase-frontend-integration.md) |
| 5 | [06_phase-realtime-notifications.md](./06_phase-realtime-notifications.md) |
| 6 | [07_phase-docker-deploy.md](./07_phase-docker-deploy.md) |
| 7 | [08_phase-qa-matrices.md](./08_phase-qa-matrices.md) |

## Struktura

```
inventory-v2/
├── backend/
├── frontend/
├── docker/
├── docker-compose.yml
├── docker-compose.prod.yml
└── .cursor/
```

Vidi [CHECKLIST.md](./CHECKLIST.md) za status.
