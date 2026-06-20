# Matrica — radnici (employees)

## Polja

| Polje | Tip | Default | Napomena |
|-------|-----|---------|----------|
| `staffNumber` | string?, unique | `null` | Kadrovski broj |
| `gender` | `male` \| `female` | `male` | |
| `isActive` | boolean | `true` | Zaposlenički status (≠ `User.isActive` dok se ne deaktivira) |

## CRUD i uloge

| Akcija | Admin | Evidentičar |
|--------|-------|-------------|
| POST/PATCH/DELETE | da | ne |
| GET lista/profil | da (svi) | da (read-only, registrar scope) |
| GET search (autocomplete) | da | da; default `activeOnly=true` |

## Deaktivacija (`isActive: false`)

1. Admin PATCH radnika ili PATCH korisnika (`User.isActive=false` s `employeeId`) pokreće istu provjeru.
2. Ako radnik drži opremu (`Equipment.status=zaduzeno`, `currentHolderId`):
   - **Update se odbija** (`400`, `EMPLOYEE_MESSAGES.deactivateHasHeldEquipment`).
   - Šalju se notifikacije `employee_deactivation_equipment_required` evidentičarima po `(efektivno skladište radnika × categoryId)`; fallback admin ako nema evidentičara.
3. Ako nema zaduženja i postoji `User` → u transakciji: `Employee.isActive=false` + `User.isActive=false`.
4. Frontend pri deaktivaciji s povezanim računom prikazuje upozorenje o ulozi (posebno `evidenticar`, `admin`, …).

## Transfer / izdavanje

- `zaduzenje` / `prenos` (toPerson): `Employee.isActive` mora biti `true`.
- `razduzenje` / `prenos` (fromPerson): dozvoljeno i za neaktivnog (razduženje opreme).

## Brisanje

Postojeća pravila (`deleteHasHeldEquipment`, user account, potpisnik, …) ostaju nepromijenjena.

## Postavke

- `features.employees` — enforcement na servisu.
