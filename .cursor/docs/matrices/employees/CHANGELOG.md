# CHANGELOG — employees

## 2026-06-20 (status polja + deaktivacija)

- Polja: `staffNumber`, `gender` (default male), `isActive` (default true).
- Deaktivacija blokirana dok postoji zadužena oprema; notifikacija `employee_deactivation_equipment_required` evidentičarima po kategoriji.
- Uspješna deaktivacija radnika sinkronizira `User.isActive=false`; anti-bypass na `UsersService.update`.
- Transfer/issue guard: neaktivan radnik ne može primiti novo zaduženje.
- Frontend: forma, status kolona/filter, potvrda deaktivacije s upozorenjem o ulozi korisnika.
