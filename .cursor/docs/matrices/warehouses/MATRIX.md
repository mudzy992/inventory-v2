# Matrica: Skladišta i skladištar

## Model

- `Warehouse`: name, cityId, address, orgUnitId (obavezan na **create**), isActive
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

## Obrazac prenosnice (.docx)

- Upload (admin): `POST /warehouses/:id/transfer-template` — validacija placeholdera; upload **automatski aktivira** verziju.
- Ručna aktivacija arhive: `PATCH .../activate` (ponovna validacija fajla).
- **Obavezno** `orgUnitId` na skladištu prije uploada/generisanja.
- UI: tab **Kontekst** — `WarehouseContextPanel` (podaci + skladištari) + `WarehouseTransferTemplatePanel` (obrazac, arhiva verzija).
- Arhiva: `GET /warehouses/:id/transfer-template/:templateId/download` (admin).
- Placeholderi: vidi matricu `transfers` (Word find/replace).

## Coverage (`Warehouse.orgUnitId`)

- `orgUnitId = null` → **legacy** centralno skladište (postojeći zapisi); novi create zahtijeva org + min 1 skladištar
- Legacy centralno: razduženje dozvoljeno iz bilo kojeg holder org-a u istom gradu (bez subtree provjere)
- `orgUnitId` set → holder `Employee.orgUnitId` mora biti u podstablu tog čvora da bi `razduzenje` ciljalo to skladište
- Enforce: `assertRazduzenjeWarehouseCoverage` pri `POST /transfers` tip `razduzenje`

## Effective warehouse inheritance

- Skladište se veže na org čvor preko `Warehouse.orgUnitId` (nije polje na `OrgUnit`).
- **Resolucija** (`WarehouseResolutionService`): walk od `orgUnitId` prema korijenu; prvi aktivni warehouse na tom čvoru ili pretku (**bez** filtra po gradu — kao potpisnik/lokacija). Ako lanac nema skladišta: opcioni fallback bilo koje aktivno skladište u `cityId` (npr. centralno).
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
| Equipment `PATCH` (uređivanje) | ✓ | ✓ | — |
| `POST /equipment` (direktno) | — | — | — |

## Scope

- Skladištar: filter opreme po `warehouseId ∈ keepers` + status/condition (vidi gore)
- Evidentičar: oprema na skladištu po `RegistrarAssignment` (režim A/B)

## UI (faza 18b)

| Element | Pravilo |
|---------|---------|
| Warehouse detail | tabovi: Na skladištu, Zaduženja/Razduženja, Rashod/Uništenje, Kontekst (pun edit: naziv, grad, adresa, org, skladištari, napomena) |
| Kreiranje skladišta | obavezno: name, cityId, address, orgUnitId, min 1 `keeperUserIds` (bez opcije „centralno”) |
| Org čvor | lista skladišta `orgUnitId`, brzo kreiranje, broj opreme u podstablu |
| Registry skladišta | badge **Centralno** (`orgUnitId=null`) vs **Org** |
| Oprema | pogled **Po skladištima** (warehouse-first) |
| Freeze | hint + disabled uređivanje na Oprema/Transferi/Skladišta dok aktivan popis |
| Oprema — nova stavka | nema dugmeta na Oprema; prijem preko stock lot; izdavanje evidentičar |
| Transfer create | obavezno `fromWarehouseId` (zaduženje), `toWarehouseId` (razduženje) |
