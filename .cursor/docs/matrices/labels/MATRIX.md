# Matrica: Naljepnice (A4 batch)

## Štampa

- Komponenta `LabelPrintSheet`: horizontalna kartica — QR lijevo, tekst desno
- QR payload: puni URL `{APP_URL|origin}/equipment/{equipmentId}`
- Prikaz: display name (kategorija + spec), unikatno polje (ako postoji), inventurni broj, kategorija
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
