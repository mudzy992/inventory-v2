# Matrica — uloge i pristup

## Uloge

| Uloga | Kod | Opis |
|-------|-----|------|
| Administrator | `admin` | Puna konfiguracija sistema |
| Evidentičar | `evidenticar` | Evidencija u dodijeljenim org. jedinicama |
| Korisnik | `user` | Pregled vlastitog zaduženja, QR |

## Pristup po modulu (draft)

| Modul | admin | evidenticar | user |
|-------|:-----:|:-----------:|:----:|
| Organizacija | CRUD | — | — |
| Kategorije | CRUD | R | — |
| Korisnici | CRUD | — | — |
| Zaposlenici | CRUD | R (scope) | — |
| Oprema | CRUD | CRUD (scope) | R (own) |
| Transferi | CRUD | CRUD (scope) | — |
| Dokumenti | CRUD | CRUD (scope) | R (own transfers) |
| Moja oprema | ✓ | ✓ | ✓ |
| QR skener | ✓ | ✓ | ✓ |
| Notifikacije | ✓ | ✓ | ✓ |
| Settings | CRUD private | R public | R public |

## Cross-service prenos

- Samo `admin` kada je `features.cross_service_transfer = true`.

## CHANGELOG

Vidi `CHANGELOG.md` u ovom folderu.
