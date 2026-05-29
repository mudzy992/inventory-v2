# Faza 3 — Transferi i dokumenti

## Cilj

Kompletan lifecycle transfera i upload skeniranih dokumenata.

## Transfer modul

### Tipovi

`zaduzenje` | `razduzenje` | `rashodovanje` | `prenos`

### Statusi

`raw` → `potpisan` (sa `signerId`, `documentNumber`, `date`)

### Endpointi

- `POST /backend/transfers` — kreira transfer + ažurira equipment status/holder
- `PATCH /backend/transfers/:id/sign` — evidentičar/admin potpis
- `GET /backend/transfers` — filter po equipment, datumu, statusu, org scope
- `GET /backend/transfers/:id`

### Cross-service prenos

- `isCrossServiceTransfer: true` — **samo admin** (settings flag `features.cross_service_transfer`)
- Matrica: `.cursor/docs/matrices/transfers/MATRIX.md`

## Documents / uploads

- `POST /backend/uploads` — multipart, vezano za `TransferRecord`
- Storage: `uploads/transfers/{year}/{id}.pdf`
- DB: `scannedDocUrl` = relativna putanja
- Renditions: nije prioritet faza 3 (samo original PDF/slika)

## Generisanje `documentNumber`

Format dogovoriti u matrici (npr. `TR-{godina}-{seq}`) — transakcijski brojač u DB.

## Kriterijumi završetka

- [ ] Zaduženje/razduženje/rashodovanje mijenja equipment konzistentno
- [ ] Upload vezan za transfer
- [ ] Evidentičar ne može cross-service bez admin uloge
- [ ] Matrica transfera ažurirana + CHANGELOG
