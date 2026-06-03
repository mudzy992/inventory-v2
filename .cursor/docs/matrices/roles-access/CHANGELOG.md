# Changelog — roles-access

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
