# Matrica: Naljepnice (A4 batch)

## Štampa

- Komponenta `LabelPrintSheet` — **A4 studio za naljepnice** (layout endžin: `frontend/src/components/labels/label-print-layout.ts`)
- Format: A4 uspravno/vodoravno, `@page size: A4`, margine lista (mm), kolone/redovi, razmaci ↔/↕ — veličina naljepnice se izračunava
- Standardni formati, grupisani u izboru: **Fornax F (ILK)** — F-01 (65), F-10 (64), F-20 (56 · 52,5×21,2), F-21 (40), F-30 (24), F-40 (33), F-41 (30), F-42/F-43/F-44 (24), F-46 (15), F-50 (12), F-51 (8), F-60 (16), F-65 (12), F-67/F-70 (8), F-71 (4), F-83 registratori (4); **Avery/Zweckform** — L7651 (65), L7159 (24), L7160 (21, zadano), L7161 (18), L7162 (16), L7163 (14), L7165 (8), L7167 (1); generičke mreže 2×5 i 4×10. Ručna izmjena geometrije ⇒ „Prilagođeno". Okrugli Fornax formati (F-02/F-03/F-04) namjerno nisu ponuđeni (nisu za QR).
- Početna pozicija: preskakanje polja na prvom listu (unos ili klik na pregled) za djelimično iskorištene listove; kopije po artiklu (1–50)
- Sadržaj (audit 2026-10-28): redoslijed na naljepnici je **QR kod → naziv opreme → kategorija → serijski broj → inventurni broj**; naziv opreme = `stockLot.productName` (fallback: naziv iz specifikacija), vidljiv na svim gustinama osim micro (< 16 mm, tada samo QR + inventurni); kategorija i serijski se gase/uključuju toggle-ima; serijski samo ako postoji vrijednost (fallback: unikatno polje kategorije); **inventurni broj je obavezan — nema toggle (zaključan)**, evidencijska oprema dobija praznu podcrtanu liniju za ručni upis; QR pozicija (lijevo/gore) i veličina (40–100 %); tekst „Skeniraj za detalje" opciono (samo full gustina)
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
