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
| `accept` | Izvorni lot: `quantityReceived -= 1`; dest lot: `quantityReceived += 1`; `Equipment.stockLotId` → dest lot |
| `reject` | Linija `rejected`; notifikacija izvoru |

## Stock pravila

- Izvorni lot na **prihvatu na cilju**: `quantityReceived -= 1`; `quantityOnHand` **ne mijenja** se (komad već izdat).
- Dest pending lot: `quantityOnHand=0`, `incomingRelocation=true` do prihvata.
- Dest prihvat (**zaduzeno**): `quantityReceived += 1`, `quantityOnHand` ostaje 0 (oprema kod radnika).
- Dest prihvat (**skladiste**, edge): `quantityReceived += 1` i `quantityOnHand += 1`.

## Šifrarnik

- Obavezan za cross-warehouse transfer (`catalogItemId` na opremi ili izvornom lotu).
- Legacy bez mapiranja → admin mapira preko **Mapiraj tip** na stranici Org. promjena (`PATCH lines/:id/map-catalog`).
- **Prebaci** disabled dok nema effective catalog; **Razduži** radi bez šifrarnika.
- Preview pri promjeni org. jedinice vraća `unmappedEquipment`.

## Lot na cilju (auto-kreiranje)

- Transfer **ne zahtijeva** postojeći lot na ciljnom skladištu.
- Pri uspješnom **Prebaci** backend koristi **kanonski** lot resolver (`resolveCanonicalDestLotInTx`): otvoren lot → reuse; zatvoren lot → reopen; inače create (`incomingRelocation=true`, `quantityOnHand=0`).
- Više transfera istog tipa na isto skladište ide na **isti** kanonski lot (nema duplikata po `catalogItemId`).
- Admin **ne** kreira lot ručno — samo mapira šifrarnik ako legacy oprema nema `catalogItemId`.

## Spec nasljeđivanje

- Idempotentno na **Prebaci** i **Prihvati** — samo ako dest lot još nema lot-spec.
- Prioritet: izvorni lot opreme (`stockLotId`) → postojeći lot na ciljnom skladištu (isti `catalogItemId`, `spremno_za_izdavanje`).
- Nakon nasljeđivanja dest lot prelazi u `spremno_za_izdavanje` bez ručne definicije od evidentičara na cilju.
- Unique polja opreme (`Equipment.specifications`) se ne diraju — nasljeđuje se samo lot-spec (`WarehouseStockLot.specifications`).

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
