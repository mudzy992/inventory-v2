# Matrica — organizacijska hijerarhija

## Tipovi (`OrgUnitType`)

`direkcija`, `distribucija`, `podrucje`, `podruznica`, `sektor`, `sluzba`, `odjeljenje`

## Dozvoljene parent → child veze

| Parent tip | Dozvoljeni child tipovi |
|------------|-------------------------|
| `direkcija` | `podrucje`, `distribucija`, `sektor` |
| `podrucje` | `sektor`, `sluzba`, `odjeljenje`, `distribucija` |
| `distribucija` | `sektor`, `sluzba`, `odjeljenje`, `podruznica` |
| `podruznica` | `sluzba`, `odjeljenje` |
| `sektor` | `sluzba`, `odjeljenje` |
| `sluzba` | `odjeljenje` |
| `odjeljenje` | _(nema dozvoljenih child tipova)_ |

Enforce: `assertValidOrgUnitParentChild` u `org-units.service` na create/update.

## Pravila

| Pravilo | Detalj |
|---------|--------|
| `parentId` | `null` = korijen; inače mora postojati |
| Ciklus | Zabranjen pri PATCH parentId |
| Brisanje | Zabranjeno ako ima djecu ili zaposlenike |
| `signerId` | Opcionalno; mora biti postojeći Employee |
| `effectiveSignerId` | Denormalizovano; refresh `SignerResolutionService` nakon create/update signer/parent |
| `locationCityId` | Opcionalno; `effectiveLocationCityId` refresh `LocationResolutionService` |
| Promjena parent/tipa | Validacija child tipova postojeće djece protiv novog parent tipa |

## Edge-caseovi

| Scenario | Ponašanje |
|----------|-----------|
| Move subtree (promjena parentId) | Validacija tipa child↔novi parent; ciklus zabranjen |
| Promjena `type` čvora | Validacija prema parentu + sva direktna djeca moraju ostati dozvoljena |
| Brisanje čvora s djecom | Odbijeno |
| Nema potpisnika u stablu | `effectiveSignerId` null; procesi koji traže potpisnika: `No signer configured in org hierarchy` |

## API

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/org-units` | admin |
| GET | `/backend/org-units/tree` | admin |
| POST/PATCH/DELETE | `/backend/org-units` | admin |

## Scope (evidentičar)

`managedOrgUnitIds` + svi potomci u stablu (vidi `OrgScopeService`).
