# Faza 7 — QA, matrice i handoff

## Cilj

Sve matrice popunjene, gap analiza zatvorena, sistem spreman za produkcijski rad.

## Test plan (minimum)

| Oblast | Test |
|--------|------|
| Auth | login, refresh, role guard, 401/403 |
| Org | tree CRUD, ciklus odbijen |
| Equipment | unique inventory, spec validacija |
| Transfer | zaduženje → potpis → status equipment |
| Scope | evidentičar ne vidi tuđu org jedinicu |
| Upload | max size, tip fajla |
| WS | notifikacija stiže u UI |
| Deploy | HTTPS, `/backend/health`, SPA refresh |

## Dokumentacija

- `HANDOFF.md` — šta je urađeno, odluke, next steps
- `.cursor/docs/03_gap_analysis.md` — ako docs ≠ kod
- `README.md` — deploy uputstva

## Matrice — finalni review

Svaka matrica mora imati:
- Stanja / uloge / prelaze (tabela)
- Edge cases
- `CHANGELOG.md` entry za svaku logičku promjenu

## Kriterijumi završetka

- [ ] CHECKLIST.md 100% za faze 0–6
- [ ] Produkcija `opremnica.ba101.top` dostupna
- [ ] Seed/demo isključen u prod settings
