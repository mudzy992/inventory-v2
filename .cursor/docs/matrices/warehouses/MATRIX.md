# Matrica: Skladišta i skladištar

## Model

- `Warehouse`: name, cityId, address, orgUnitId?, isActive
- `WarehouseKeeper`: warehouseId + userId (M:N)
- `WarehouseStockLot`: količinski prijem neizdane robe (vidi matricu `warehouse-stock`)
- `Equipment.warehouseId` kada `status ∈ { skladiste, rashodovano }` (pojedinačni komadi)
- `Equipment.warehouseCondition`: `na_skladistu` | `spremno_za_unistenje` | `unisteno`
- `EquipmentEvent`: audit uništenja (action `unisteno`)

## Uloga `skladistar`

- Vidi samo dodijeljena skladišta (`WarehouseKeeper`)
- **Čitanje opreme:**
  - `status=skladiste` i `warehouseId ∈ keeper warehouses`
  - `status=rashodovano` i `warehouseCondition ∈ { spremno_za_unistenje, unisteno }` u svom skladištu
- **Prijem robe:** `POST /warehouses/:id/stock-lots` (kategorija, naziv, količina) — bez inventurnog broja/spec
- **Pisanje opreme:** nema direktnog create; samo rashod/uništenje pojedinačne opreme
- **Uništenje:** `POST /warehouses/:id/destroy-equipment/:equipmentId` — samo keeper (ili admin); preduvjet `warehouseCondition=spremno_za_unistenje`
- Ne potpisuje prenosnice (evidentičar/admin)

## Coverage (`Warehouse.orgUnitId`)

- `orgUnitId = null` → centralno skladište; razduženje dozvoljeno iz bilo kojeg holder org-a u istom gradu (bez subtree provjere)
- `orgUnitId` set → holder `Employee.orgUnitId` mora biti u podstablu tog čvora da bi `razduzenje` ciljalo to skladište
- Enforce: `assertRazduzenjeWarehouseCoverage` pri `POST /transfers` tip `razduzenje`

## Effective warehouse inheritance

- Skladište se veže na org čvor preko `Warehouse.orgUnitId` (nije polje na `OrgUnit`).
- **Resolucija** (`WarehouseResolutionService`): walk od `orgUnitId` prema korijenu; prvi aktivni warehouse na tom čvoru ili pretku; fallback bilo koje skladište u `cityId`.
- **Primjena**: auto `toWarehouseId` pri `razduzenje`, popisni relocation, frontend `resolveTransferWarehousePayload`.
- **Override**: child org s vlastitim skladištem dobija svoje.
- **API preview**: `GET /warehouses/resolve/effective?orgUnitId=&cityId=`

## Faze rashoda / uništenja

| Faza | Marker | Ko postavlja |
|------|--------|--------------|
| Na skladištu (rashod primljen) | `status=rashodovano`, `warehouseCondition=na_skladistu` | Finalizacija transfera rashod |
| Spremno za uništenje | `warehouseCondition=spremno_za_unistenje` | Komisija rashoda (faza 17) / admin |
| Uništeno (final) | `warehouseCondition=unisteno` | Skladištar `destroy-equipment` |

## API

| Endpoint | admin | evidenticar | skladistar |
|----------|:-----:|:-----------:|:----------:|
| CRUD skladišta | ✓ | R | R svoja |
| Dodjela skladištara | ✓ | — | — |
| `GET .../ready-for-destruction` | ✓ | — | ✓ svoja |
| `POST .../destroy-equipment/:equipmentId` | ✓ | — | ✓ svoja |
| Stock lot prijem | ✓ | — | ✓ keeper |
| Equipment create/update na skladištu | ✓ | ✓ | — |

## Scope

- Skladištar: filter opreme po `warehouseId ∈ keepers` + status/condition (vidi gore)
- Evidentičar: oprema na skladištu po `RegistrarAssignment` (režim A/B)

## UI (faza 18b)

| Element | Pravilo |
|---------|---------|
| Warehouse detail | tabovi: Na skladištu, Zaduženja/Razduženja, Rashod/Uništenje, Kontekst |
| Org čvor | lista skladišta `orgUnitId`, brzo kreiranje, broj opreme u podstablu |
| Registry skladišta | badge **Centralno** (`orgUnitId=null`) vs **Org** |
| Oprema | pogled **Po skladištima** (warehouse-first) |
| Freeze | hint + disabled create na Oprema/Transferi/Skladišta dok aktivan popis |
| Transfer create | obavezno `fromWarehouseId` (zaduženje), `toWarehouseId` (razduženje) |
