# Matrica — uloge i pristup

## Uloge

| Uloga | Kod | Opis |
|-------|-----|------|
| Administrator | `admin` | Puna konfiguracija sistema |
| Evidentičar | `evidenticar` | Evidencija u dodijeljenim parovima **grad + kategorija** |
| Skladištar | `skladistar` | Evidencija na dodijeljenim skladištima |
| Korisnik | `user` | Pregled vlastitog zaduženja, QR |

## Opseg evidentičara (`UserRegistrarScope`)

| Polje | Pravilo |
|-------|---------|
| `cityId` | Grad efektivne lokacije opreme/radnika |
| `categoryId` | Kategorija (uključuje sve podkategorije) |
| Pristup opremi | `resolveEquipmentCityId` ∈ dodjele **i** `categoryId` ∈ proširene dodjele |
| Zaduženo | `effectiveLocationCityId` org jedinice radnika |
| Skladište | `warehouse.cityId` |
| Radnici | Vidljivi ako im je efektivni grad u bilo kojoj dodjeli evidentičara |

## Pristup po modulu

| Modul | admin | evidenticar | skladistar | user |
|-------|:-----:|:-----------:|:----------:|:----:|
| Organizacija | CRUD | — | — | — |
| Lokacije | CRUD | R | — | — |
| Skladišta | CRUD | R | CRUD svoja | — |
| Kategorije | CRUD | R | — | — |
| Korisnici | CRUD | — | — | — |
| Komisija rashod | CRUD | approve + resolve | — | — |
| Popis | CRUD sesija | evidencija (grad scope) | — | — |
| Zaposlenici | CRUD | R (grad scope) | — | — |
| Oprema | CRUD | CRUD (grad+kategorija) | CRUD (svoja skladišta) | R (own) |
| Naljepnice | ✓ | ✓ | ✓ svoja | own |
| Transferi | CRUD | CRUD (scope) | — | — |
| Dokumenti | CRUD | CRUD (scope) | — | — |
| Moja oprema | ✓ | ✓ | ✓ | ✓ |
| QR skener | ✓ | ✓ | ✓ | ✓ |
| Notifikacije | ✓ | ✓ | ✓ | ✓ |
| Settings | CRUD private | R public | R public | R public |

## Cross-service prenos

- Samo `admin` kada je `features.cross_service_transfer = true`.
- Evidentičar: prenos izvan istog para (grad + kategorija) tretira se kao cross-service (blokada ili flag).

## Upravljanje korisnicima (admin)

| Pravilo | Opis |
|---------|------|
| Pristup | Samo `admin` (`/users` CRUD) |
| Novi korisnik | `username`, `password` (min 6), `role`, `employeeId` |
| Radnik | Jedan korisnički račun po `employeeId` |
| Evidentičar | Obavezan `registrarScopes` (≥1 par grad+kategorija) |
| Korisnik (`user`) | Obavezan `employeeId`; bez registrar scope |
| Administrator | `employeeId` opcionalan |
| Uredi | Uloga, status, registrar scopes; lozinka opcionalna (min 6) |

## CHANGELOG

Vidi `CHANGELOG.md` u ovom folderu.
