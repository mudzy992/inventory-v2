# Matrica — uloga moderator

## Uloga

| Uloga | Kod | Opis |
|-------|-----|------|
| Moderator | `moderator` | Org-scoped operativni administrator + warehouse moderator za popisne komisije |

## Dodjele

### `ModeratorOrgAssignment` (operativni scope)

| Polje | Pravilo |
|-------|---------|
| `orgUnitId` | Root moderacije; expand podstablo = operativni scope |
| Više rootova | Unija (OR) scope-a |
| Više moderatora na istom rootu | Dozvoljeno |
| Tip roota | Preporuka: `distribucija`, `podrucje`, `podruznica` |

### `ModeratorWarehouseAssignment` (popisne komisije)

| Polje | Pravilo |
|-------|---------|
| `warehouseId` | Jedan aktivni moderator po skladištu (`@@unique`) |
| Cross-validacija | `warehouse.orgUnitId` mora biti u org scope moderatora |

## Hard deny (uvijek admin)

- Settings private GET/PATCH
- Lokacije CRUD
- Kategorije CRUD
- Equipment catalog CRUD
- Popis: create/activate/close/delete/reconcile sesije
- Disposal list withdraw
- Equipment reactivate/delete
- Transfer write, cross-service
- Warehouse transfer templates
- Employee relocation map-catalog, admin-alerts, preview
- Kreiranje uloga `admin` / `moderator`
- Dodjela moderator org/warehouse assignments

## Delegacija uloga (moderator → scoped)

Dozvoljeno: `evidenticar`, `skladistar`, `popis_koordinator`, `user`

## Korisnik u scope (OR)

- `employee.orgUnitId ∈ expandedOrgRoots`
- bilo koji `registrarAssignment.warehouseId` → warehouse.orgUnitId ∈ scope
- bilo koji `coordinatorAssignment.warehouseId` u scope
- `WarehouseKeeper` na skladištu u scope

## Pristup po modulu (MVP + read faza)

| Modul | moderator |
|-------|-----------|
| Org jedinice | CRUD u scope |
| Zaposlenici | CRUD u scope |
| Skladišta | CRUD u scope (bez destroy/template) |
| Korisnici | CRUD operativnih uloga u scope |
| Popis komisije | CRUD za dodijeljena skladišta (draft) |
| Lokacije/kategorije/katalog | read |
| Oprema/transferi/dashboard | read scoped (faza 6) |
| Settings private | — |

## Edge-caseovi

| Scenario | Ponašanje |
|----------|-----------|
| Parent org van scope | 403 |
| Drugi moderator na istom skladištu | 409 |
| Warehouse bez orgUnitId | ne može warehouse dodjela |
| `features.moderator_role=false` | moderator write API → 403 |
| Moderator + evidenticar isti user | zabranjeno (v1) |

## Implementacija

- [`moderator-scope.service.ts`](../../../../backend/src/common/services/moderator-scope.service.ts)
- [`users-validation.util.ts`](../../../../backend/src/modules/users/users-validation.util.ts)
