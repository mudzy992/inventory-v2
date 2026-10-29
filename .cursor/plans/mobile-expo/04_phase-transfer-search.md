# Faza 4 — Prenos + pretrage

- Bottom sheet Zaduži / Prenesi / Razduži (admin + evidentičar, `features.transfers`)
- Payload: port `buildTransferCreatePayload` + warehouse resolver
- Bootstrap: `GET /org-units`, `GET /warehouses`
- Pretraga opreme: `GET /equipment?search=`
- Pretraga radnika: `GET /employees?search=` (sve uloge) / `GET /employees/search`
- Profil: `GET /employees/:id/profile` → held equipment → detalj
