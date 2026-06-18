# Setup onboarding — matrica

## Cilj

Jednokratni setup wizard (`POST /backend/setup/initialize`) — **scroll prezentacija** + **9 instalacijskih koraka** kreira minimalne entitete da aplikacija odmah podrži puni tok: prijem lota → izdavanje → zaduženje, sa svih 5 uloga.

## Faze UI-a

| Faza | Sadržaj |
|------|---------|
| **Prezentacija** | Full-page scroll: hero → 8 modula (reveal na scroll) → pregled + CTA „Započni instalaciju” |
| **Instalacija** | Forma u kartici, progress bar, 9 koraka (preduzeće → … → pregled → submit) |

## Koraci instalacije (forma)

| # | Korak |
|---|--------|
| 1 | Preduzeće |
| 2 | Lokacije |
| 3 | Organizacija |
| 4 | Skladište |
| 5 | Kategorije + šifrarnik |
| 6 | Administrator |
| 7 | Tim (4 uloge) |
| 8 | Direktor / signer |
| 9 | Pregled + završetak |

## Gate

| Uslov | Implementacija |
|-------|----------------|
| Wizard prikazan | `GET /setup/status` → `needsSetup: user.count() === 0` |
| `app.initialized` | Postavlja se na `true`; informativno u settings |
| `SETUP_TOKEN` | Opcionalno u env; ako postoji, obavezan u payloadu |

## Redoslijed kreiranja (transakcija)

1. Settings (`company.*`, `app.name=Evidens`, `app.initialized`)
2. Canton + City(ies)
3. OrgUnit `direkcija` (= naziv preduzeća)
4. Opcionalna child org jedinica
5. Employees (direktor/signer + 4 uloge)
6. `direkcija.signerId` + `effectiveSignerId` map
7. Category parent + leaf (ASSET)
8. EquipmentCatalogItem
9. Warehouse
10. Users (admin, evidentičar, skladistar, popis_koordinator, user)
11. WarehouseKeeper
12. RegistrarAssignment (evidentičar → skladište + parent kategorija)
13. InventoryCoordinatorAssignment (koordinator → skladište)

## Šta wizard NE kreira

- Demo stock lot / opremu
- Word obrazac prenosnice (generisanje tiho preskače bez templatea)
- Dodatne kategorije, skladišta, org jedinice

## Nakon instalacije (ručno)

- Upload Word obrasca prenosnice po skladištu (ako treba PDF/DOCX)
- Dodatni korisnici i dodjele evidentičara/koordinatora
- Fine-tuning postavki u Admin → Postavke

## Validacije koje blokiraju tok bez setupa

| Akcija | Zahtjev |
|--------|---------|
| Prijem lota | Skladište + leaf ASSET kategorija + skladištar keeper |
| Izdavanje | Evidentičar + RegistrarAssignment + holder employee + signer |
| Koordinator popisa | `InventoryCoordinatorAssignment` |
| User uloga | Employee zapis |

## Edge caseovi

- Dupla korisnička imena → `400` prije transakcije
- Ponovni setup kad postoji user → `409 Conflict`
- `app.name` uvijek **Evidens** (produkt); `company.name` iz forme (institucija)
