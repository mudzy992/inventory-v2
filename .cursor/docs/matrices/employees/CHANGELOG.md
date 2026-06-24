# CHANGELOG — employees

## 2026-06-24 (pretraga ime + prezime)

- `EmployeesService.search` i lista: `buildEmployeeSearchWhere` — split na whitespace (`Ime Prezime` matcha `firstName` + `lastName`).
- Shared util: `employee-name-search.util.ts` (koristi i holder search).

## 2026-06-23 (evidentičar write)

- Evidentičar: `POST`/`PATCH` radnika u registrar scope-u kad je `features.evidenticar_employee_ops` uključen.
- Org. promjena: ciljni org ne mora biti u registrar scope-u (cross-warehouse); postojeći radnik mora biti u scope-u.
- Brisanje ostaje admin/moderator.

## 2026-06-20 (status polja + deaktivacija)

- Polja: `staffNumber`, `gender` (default male), `isActive` (default true).
- Deaktivacija blokirana dok postoji zadužena oprema; notifikacija `employee_deactivation_equipment_required` evidentičarima po kategoriji.
- Uspješna deaktivacija radnika sinkronizira `User.isActive=false`; anti-bypass na `UsersService.update`.
- Transfer/issue guard: neaktivan radnik ne može primiti novo zaduženje.
- Frontend: forma, status kolona/filter, potvrda deaktivacije s upozorenjem o ulozi korisnika.
