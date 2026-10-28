# Matrica: Naljepnice (A4 batch)

## Štampa

- Komponenta `LabelPrintSheet` — **A4 studio za naljepnice** (layout endžin: `frontend/src/components/labels/label-print-layout.ts`)
- Format: A4 uspravno/vodoravno, `@page size: A4`, margine lista (mm), kolone/redovi, razmaci ↔/↕ — veličina naljepnice se izračunava
- Standardni formati (Avery-kompatibilni): L7651 (65), L7159 (24), L7160 (21, zadano), L7161 (18), L7162 (16), L7163 (14), L7165 (8), L7167 (1) + generičke mreže 2×5 i 4×10; ručna izmjena geometrije ⇒ „Prilagođeno"
- Početna pozicija: preskakanje polja na prvom listu (unos ili klik na pregled) za djelimično iskorištene listove; kopije po artiklu (1–50)
- Sadržaj: naziv opreme, naziv lota, kategorija, serijski, inventurni broj/linija za upis, tekst „Skeniraj za detalje"; QR pozicija (lijevo/gore) i veličina (40–100 %); gustina teksta se prilagođava visini naljepnice (micro < 16 mm, compact < 26 mm)
- Vodilje: isprekidani okvir u pregledu uvijek; u štampi samo ako je uključeno „Štampaj vodilje"
- Validacija: premala naljepnica blokira štampu; upozorenja za QR < 18 mm i margine < 3 mm (borderless)
- Postavke se pamte u `localStorage` (`evidens.labelPrintSettings.v1`); pregled: zum Prilagodi/50/75/100 %
- QR payload: puni URL `{APP_URL|origin}/equipment/{equipmentId}`
- Prikaz: naziv lota (`stockLot.productName`), kategorija, serijski broj (ako postoji u specifikaciji), inventurni broj (bold) ili **prazna podcrtana linija** za ručni upis kad je oprema evidencijska (`!isAccountingTracked`), QR
- `window.print()` + `@media print` CSS

## Javni QR pregled

- Sken otvara `/equipment/:id` (SPA, bez auth)
- API: `GET /backend/public/equipment/:id` — read-only detalji, `productName` iz stock lota, zaduženje/skaldište, historija kretanja (bez internih ID-jeva)
- Stranica: summary kartica (kategorija, productName, inv, status, unikatna polja) + tabovi (Zaduženje / Specifikacije / Historija)

## Gdje

| Mjesto | Ko može |
|--------|---------|
| Sva oprema (`EquipmentPage`) | admin, evidenticar, skladistar (selekcija) |
| Po kategorijama | admin, evidenticar |
| Moja oprema | user (samo zaduženo) |
| `EquipmentCard` | QR print/download — isti URL format |

## Selekcija

- Checkbox po redu + „Odaberi sve“ na filtriranom setu
- Štampaj samo odabrane ID-eve

## Kompatibilnost

- QR skener i dalje prihvata legacy format `INVENTAR:{inv}|{id}` i URL putanje.
