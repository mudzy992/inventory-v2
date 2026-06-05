# Matrica — promjena org. jedinice radnika i oprema

## Trigger

Admin mijenja `Employee.orgUnitId`. Ako efektivno skladište (`resolveEffectiveWarehouseId`) ostaje isto → **nema akcije**.

## Modeli

| Entitet | Svrha |
|---------|--------|
| `EquipmentCatalogItem` | Globalni šifrarnik tipa opreme (`code`, `name`, `categoryId` leaf) |
| `EmployeeRelocationCase` | Jedan case po promjeni org jedinice (open → resolved/cancelled) |
| `EmployeeRelocationLine` | Jedna stavka po zaduženom `equipmentId` |
| `EmployeeRelocationEvent` | Audit bez prenosnice |

## Statusi case-a

| Status | Značenje |
|--------|----------|
| `open` | Barem jedna linija nije finalna |
| `resolved` | Sve linije finalne |
| `cancelled` | Superseded novom promjenom org jedinice |

## Statusi linije

| Status | Značenje |
|--------|----------|
| `pending_source` | Čeka odluku izvornog evidentičara |
| `pending_dest` | Transfer poslan; čeka prihvat na cilju |
| `accepted` | Cilj prihvatio; oprema pod jurisdikcijom ciljnog skladišta |
| `rejected` | Cilj odbio; vraća se izvoru |
| `discharged` | Radnik administrativno razdužen |

## Izvorne akcije (evidentičar)

| Akcija | Efekat |
|--------|--------|
| `transfer` | Kreira pending lot na cilju; `pending_dest`; notifikacija ciljnom evidentičaru |
| `discharge` | `status=skladiste`, `holder=null`, `warehouseId=fromWarehouse`; bez prenosnice |

## Ciljne akcije

| Akcija | Efekat |
|--------|--------|
| `accept` | `quantityOnHand += 1` na dest lotu; `Equipment.stockLotId` → dest lot |
| `reject` | Linija `rejected`; notifikacija izvoru |

## Stock pravila

- Izvorni lot `quantityOnHand` **ne mijenja** se (komad već izdan).
- Dest pending lot: `quantityOnHand=0`, `incomingRelocation=true` do prihvata.
- Na prihvat: `quantityOnHand=1`, lot `spremno_za_izdavanje` ili `ceka_specifikaciju`.

## Šifrarnik

- Obavezan za cross-warehouse transfer (`catalogItemId` na lotu/opremi).
- Legacy bez mapiranja → admin mora mapirati prije transfera.

## Notifikacije

| Tip | Primatelj |
|-----|-----------|
| `employee_relocation_action_required` | Izvorni evidentičar po kategoriji |
| `employee_relocation_incoming` | Ciljni evidentičar |
| `employee_relocation_admin_alert` | Admin (nema evidentičara, legacy catalog) |
| `employee_relocation_resolved` | Admin, radnik (info) |

## Freeze

Tokom aktivnog popisa u gradu: blok `resolveSource` / `resolveDest` (osim admin).

## Scope

- Izvor: `RegistrarAssignment` za `(fromWarehouseId, categoryId)`.
- Cilj: `RegistrarAssignment` za `(toWarehouseId, categoryId)`.

## Admin dashboard

- Glavne kategorije bez evidentičara po aktivnom skladištu (dodjela na parent pokriva podkategorije i održavanje).
- Otvoreni relocation case-ovi.

## Postavke

| Ključ | Default |
|-------|---------|
| `features.employee_relocation` | true |
| `features.equipment_catalog` | true |
