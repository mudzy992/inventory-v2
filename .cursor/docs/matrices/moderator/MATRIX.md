# Matrica — uloga moderator

## Uloga

| Uloga | Kod | Opis |
|-------|-----|------|
| Moderator | `moderator` | Org-scoped operativni administrator + warehouse moderator za popisne komisije i skladišne operacije |

## Dodjele

### `ModeratorOrgAssignment` (operativni scope)

| Polje | Pravilo |
|-------|---------|
| `orgUnitId` | Root moderacije; expand podstablo = operativni scope |
| Više rootova | Unija (OR) scope-a |
| Više moderatora na istom rootu | Dozvoljeno |
| Tip roota | Preporuka: `distribucija`, `podrucje`, `podruznica` |

### `ModeratorWarehouseAssignment` (skladište + popis)

| Polje | Pravilo |
|-------|---------|
| `warehouseId` | Jedan aktivni moderator po skladištu (`@@unique`) |
| Cross-validacija | `warehouse.orgUnitId` mora biti u org scope moderatora |
| Operacije | Prijem/issue lotova, održavanje, kontekst skladišta, transfer template, popisne komisije |

## Hard deny (uvijek admin)

- Settings private GET/PATCH
- Lokacije CRUD
- Kategorije CRUD
- Equipment catalog CRUD
- Popis: create/activate/close/delete/reconcile sesije
- Disposal list (evidenticar workflow) i withdraw
- Kreiranje skladišta (`POST /warehouses`)
- Kreiranje uloga `admin` / `moderator`
- Dodjela moderator org/warehouse assignments (samo admin UI)
- Transfer template na skladištima izvan `moderatorWarehouseIds`

## Delegacija uloga (moderator → scoped)

Dozvoljeno: `evidenticar`, `skladistar`, `popis_koordinator`, `user`

## Scope opreme (read i write)

OR unija:

- `currentHolder.orgUnitId ∈ expandedOrgRoots` (bilo koji status)
- `equipment.warehouseId ∈ moderatorWarehouseIds`
- `equipment.warehouse.orgUnitId ∈ expandedOrgRoots`

**Lotovi:** samo na `moderatorWarehouseIds`.

## Korisnik u scope (OR)

- `employee.orgUnitId ∈ expandedOrgRoots`
- bilo koji `registrarAssignment.warehouseId` → warehouse.orgUnitId ∈ scope
- bilo koji `coordinatorAssignment.warehouseId` u scope
- `WarehouseKeeper` na skladištu u scope

## Pristup po modulu

| Modul | moderator |
|-------|-----------|
| Org jedinice | CRUD u scope (bez root bez parentId) |
| Zaposlenici | CRUD u scope |
| Skladišta | PATCH u org scope; **bez create**; stock/maintenance/context/template samo na `moderatorWarehouseIds` |
| Korisnici | CRUD operativnih uloga u scope |
| Oprema | FULL CRUD u equipment scope |
| Transferi / prenosnice | FULL CRUD u equipment scope |
| Org promjena | FULL u org scope |
| Popis komisije | parity `popis_koordinator` na dodijeljenim skladištima |
| Lokacije/kategorije/katalog | read |
| Dashboard | read scoped |
| Settings private | — |

## Edge-caseovi

| Scenario | Ponašanje |
|----------|-----------|
| Parent org van scope | 403 |
| Drugi moderator na istom skladištu | 409 |
| Warehouse bez orgUnitId | ne može warehouse dodjela |
| `features.moderator_role=false` | moderator write API → 403 |
| Moderator + evidenticar isti user | zabranjeno (v1) |
| Radnik u scope, efektivno skladište drugdje | vidi opremu u listama; lotovi samo na assigned WH |

## Implementacija

- [`moderator-scope.service.ts`](../../../../backend/src/common/services/moderator-scope.service.ts)
- [`users-validation.util.ts`](../../../../backend/src/modules/users/users-validation.util.ts)
