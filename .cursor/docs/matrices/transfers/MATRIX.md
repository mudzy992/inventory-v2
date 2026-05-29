# Matrica — transferi

## Tipovi transfera

| Tip | From | To | Equipment efekat |
|-----|------|-----|------------------|
| zaduzenje | skladiste | osoba | status=zaduzeno, holder=toPerson |
| razduzenje | osoba | skladiste | status=skladiste, holder=null |
| rashodovanje | skladiste/osoba | rashod | status=rashodovano |
| prenos | osoba | osoba | holder=toPerson |

## Status dokumenta

| Status | Značenje |
|--------|----------|
| raw | Kreiran, čeka potpis |
| potpisan | Potpisao `signerId`, broj dokumenta dodijeljen |

## Pravila

- `documentNumber` — jedinstven po godini (format TBD u implementaciji).
- Cross-service: `isCrossServiceTransfer=true` → samo admin.
- Evidentičar: transferi samo za opremu/zaposlenike u scope org jedinica.

## CHANGELOG

Vidi `CHANGELOG.md`.
