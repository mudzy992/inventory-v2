# Faza 2 — Domain core API

## Cilj

CRUD i query API za organizaciju, zaposlenike, kategorije i opremu — usklađeno sa postojećim `types.ts` na frontendu.

## Endpoints (pregled)

### Org units (`/backend/org-units`)

- `GET` tree (nested) i flat lista
- `POST`, `PATCH`, `DELETE` — **samo admin**
- Validacija: `parentId` mora postojati; ciklus zabranjen; `type` enum kao u frontendu

### Employees (`/backend/employees`)

- CRUD — admin; evidentičar read u svom scope-u
- Filter: `orgUnitId`, search po imenu

### Categories (`/backend/categories`)

- Parent/child hijerarhija
- `fields` / `optionalFields` kao JSON schema
- Validacija: equipment mora referencirati **sub-kategoriju** (leaf)

### Equipment (`/backend/equipment`)

- CRUD + filter (status, categoryId, org scope preko holdera)
- `inventoryNumber` unique per policy (matrica)
- `specifications` validirati prema category fields
- QR payload: `GET /backend/equipment/:id/qr` → URL ili token

## Poslovna pravila (iz prototipa)

| Pravilo | Implementacija |
|---------|----------------|
| Statusi | `skladiste`, `zaduzeno`, `rashodovano` |
| Zaduženje | postavlja `currentHolderId` |
| Evidentičar | vidi/upravlja opremom u `managedOrgUnitIds` + podstablo zaposlenika |
| User | samo vlastito zaduženje + read QR |

## Matrice koje se popunjavaju u ovoj fazi

- `.cursor/docs/matrices/org-hierarchy/MATRIX.md`
- `.cursor/docs/matrices/categories-fields/MATRIX.md`
- `.cursor/docs/matrices/equipment-status/MATRIX.md`
- `.cursor/docs/matrices/roles-access/MATRIX.md` (dio endpoint mapiranja)

## Kriterijumi završetka

- [ ] Admin može kreirati punu org strukturu preko API-ja
- [ ] Kategorije sa dinamičkim poljima rade
- [ ] Oprema se kreira sa validiranim specifications
- [ ] Postman/Thunder kolekcija ili OpenAPI export
