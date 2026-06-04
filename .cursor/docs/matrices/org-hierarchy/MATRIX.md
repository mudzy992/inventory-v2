# Matrica — organizacijska hijerarhija

## Tipovi (`OrgUnitType`)

`direkcija`, `distribucija`, `podrucje`, `podruznica`, `poslovna_jedinica`, `sektor`, `sluzba`, `odjeljenje`

## Dozvoljene parent → child veze

| Parent tip | Dozvoljeni child tipovi |
|------------|-------------------------|
| `direkcija` | `podrucje`, `distribucija`, `sektor`, `sluzba` |
| `podrucje` | `podruznica`, `sektor`, `sluzba` |
| `distribucija` | `podruznica`, `sektor`, `sluzba` |
| `podruznica` | `poslovna_jedinica`, `sektor`, `sluzba` |
| `poslovna_jedinica` | `sektor`, `sluzba`, `odjeljenje` |
| `sektor` | `sluzba`, `odjeljenje` |
| `sluzba` | `odjeljenje` |
| `odjeljenje` | _(nema dozvoljenih child tipova)_ |

Enforce: `assertValidOrgUnitParentChild` u `org-units.service` na create/update.

**Napomena:** Nema dodatnih operativnih pravila (npr. služba može biti direktno pod direkcijom ako je u matrici).

## Pravila

| Pravilo | Detalj |
|---------|--------|
| `parentId` | `null` = korijen; inače mora postojati |
| Ciklus | Zabranjen pri PATCH parentId |
| Brisanje | Zabranjeno ako ima djecu ili zaposlenike |
| `signerId` | Opcionalno; mora biti postojeći Employee |
| `effectiveSignerId` | Denormalizovano; refresh `SignerResolutionService` nakon create/update **signer** ili **parent** (ne na promjenu samo naziva/tipa) |
| `locationCityId` | Opcionalno; `effectiveLocationCityId` refresh `LocationResolutionService` (isto: samo signer/parent promjene + create) |
| Refresh performanse | Samo „otvoreno” podstablo (preskače grane s vlastitim `signerId` / `locationCityId`); UPDATE samo gdje se vrijednost promijenila; batch transakcije |
| Promjena parent/tipa | Validacija child tipova postojeće djece protiv **tipa uređivanog čvora** (`nextType`), ne tipa njegovog parenta |
| Greške API | Poruke na bosanskom (`org-hierarchy-messages.util.ts`) |

## Edge-caseovi

| Scenario | Ponašanje |
|----------|-----------|
| Move subtree (promjena parentId) | Validacija tipa child↔novi parent; ciklus zabranjen |
| Promjena `type` čvora | Validacija prema parentu + direktna djeca protiv novog tipa čvora |
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

## Frontend — Organizacija (`OrganizationPage`)

| Pravilo | Detalj |
|---------|--------|
| Stablo (lista) | Po učitavanju expanded samo **krov** (`level === 0`); svi potomci collapsed; expand/zatvori ručno |
| Forma — create | Bez Direkcije u bazi → samo tip `direkcija`, `parentId: null` |
| Forma — tip/parent | Filtrirani dropdowni prema matrici; validacija na save (toast) |
| Potpisnik / grad | Default inherit (`null` na API); autocomplete s inherit opcijom + sublabelom |
| Save UX | Success toast, zatvaranje dijaloga, optimistički update stabla, `refresh()` u pozadini |
| Efektivno skladište (preview) | `resolveEffectiveWarehouseForOrgUnit` — walk-up bez grada; vidi `warehouses/MATRIX.md` |

## Povezane matrice

- Nasljeđivanje skladišta: `.cursor/docs/matrices/warehouses/MATRIX.md` (Effective warehouse inheritance)
