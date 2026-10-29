# Faza 3 — Sken + detalj opreme

- `expo-camera` barcode scanning (ne deprecated barcode-scanner)
- Parser: URL `/equipment/{uuid}` ili `INVENTAR:broj|id` (kao web QRScannerPage)
- Fallback: ručni unos inventarnog broja
- Detalj: `GET /equipment/:id` + `GET /transfers?equipmentId=`
- UI kao javna stranica: status hero, tabovi Zaduženje / Specifikacije / Historija
- Gate: `features.qr_scanner` i `features.equipment`
