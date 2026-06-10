# Changelog — roles-access

## 2026-06-10

- **Validacija dodjela**: ekskluzivnost Režim A vs B po `(skladište, kategorija)`; org mora imati efektivno skladište = dodjela; kategorije filtrirane po podacima skladišta; backend `assertRegistrarScopesValid` + admin UI filteri/autocomplete.
- **Režim B scope**: samo oprema `zaduzeno` (ne rashodovano / skladište).
- **Transferi po opremi**: `canCreateTransferForEquipment` — Režim B dozvoljava samo `razduzenje`; razduženje koristi matching dodjelu (ne samo kategoriju).

## 2026-06-09

- **Moj profil / Moja oprema**: svaki korisnik s `employeeId` može čitati vlastiti zapis radnika i svu opremu koju osobno drži (`currentHolderId`), bez obzira na registrar scope (npr. evidentičar u skladištu A, org jedinica u skladištu B).

## 2026-06-05

- **Efektivno skladište u scope-u**: evidentičar vidi zaduženu opremu/radnike prema `resolveEffectiveWarehouseId`, ne širokom org podstablu skladišta (ED Zenica pobjeđuje Centralno na Direkciji).
- **`collectOrgUnitIdsForEffectiveWarehouse`**: util za list/WHERE filtere u `RegistrarScopeService`.
- **Transferi**: `buildTransferWhere` uključuje `fromPerson`/`toPerson` u scope radnika.
- **Skladišna roba**: registrar lista lotova bez filtera `quantityOnHand > 0` (prikaz `0/N`, „Nema više na stanju“).
- **Frontend**: scoped kategorije na Dashboard / Po kategorijama / filter opreme; mirror effective-warehouse u `registrar-scope.ts`.
- **Matrica**: zamijenjen zastarjeli grad+kategorija model s warehouse+kategorija+orgUnitId?.

## 2026-06-01

- Evidentičar: `managedOrgUnitIds` zamijenjen s `UserRegistrarScope` (cityId + categoryId).
- Opseg opreme: grad (naslijeđena lokacija) + kategorija s podkategorijama.

## 2026-06-03 (full-effect faze 14–18)

- **RegistrarAssignment** (faza 14): evidentičar scope preko `warehouseId` + `categoryId` + opcionalno `orgUnitId`; režim A (skladište) / B (org podstablo).
- **Skladištar** (faza 16): read opreme po `warehouseId` i statusima (`skladiste`, `spremno_za_unistenje`); destroy workflow.
- **Popis** (faza 17–18): član komisije = `user` s `employeeId`; admin ne unosi linije; predsjednik komisije rashoda odobrava inbox.
- **Transferi** (faza 15–18): evidentičar u scope-u; freeze tokom aktivnog popisa; `fromWarehouseId`/`toWarehouseId` na create.
- **Notifikacije** (faza 18c): inventory/disposal tipovi za članove komisija i stakeholder-e sesije.
- Matrica `MATRIX.md`: ažurirati ručno kad se mijenjaju module tabele (vidi `registrar-scope.service.ts`, `equipment-access.util.ts`).
