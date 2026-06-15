## 2026-06-15

- FE guard `canDeleteOrgUnit` + pre-check pri brisanju; success toast; `refreshAfterMutation`.
- Centralni katalog guardova: `GUARDS_REGISTRY.md`, `INDEX.md`.

## 2026-06-04 (5) — zatvaranje faze

- **UI stabla:** samo krovni čvor (`level === 0`) otvoren pri učitavanju; djeca zatvorena, ručno expand chevronom.
- **Autocomplete (forma):** inherit placeholder (`— Nasljeđuje… —`) ne filtrira opcije na fokus (`searchable-autocomplete.tsx`).
- **Skladište (nasljeđivanje):** walk-up bez filtra po gradu — vidi `warehouses/CHANGELOG.md` 2026-06-04.
- **Faza org hijerarhija + OrganizationPage:** smatra se završenom (matrica, forma, performanse refresh-a, UX).

## 2026-06-04 (4)

- Optimizovan refresh `effectiveSignerId` / `effectiveLocationCityId`: otvoreno podstablo (bez grana s vlastitim potpisnikom/lokacijom), skip nepromijenjenih redova, chunked `$transaction`, paralelno signer+lokacija; refresh samo kad se mijenja signer/lokacija/parent (ne naziv).

## 2026-06-04 (3)

- **Fix:** pri PATCH org jedinice direktna djeca se validiraju protiv `nextType` uređivanog čvora (npr. PJ → `poslovna_jedinica` + dijete `odjeljenje`), ne protiv tipa parenta (ED `podruznica`).

## 2026-06-04 (2)

- `poslovna_jedinica` → dozvoljeno dijete `odjeljenje` (uz `sektor`, `sluzba`).
- OrganizationPage: nakon uspješnog save zatvara dijalog, success toast, trenutni update stabla; puni `refresh()` u pozadini.

## 2026-06-04

- Tip `poslovna_jedinica` (samo pod `podruznica`).
- Revidirana matrica parent→child: služba dozvoljena direktno pod direkcijom, distribucijom, područjem, podružnicom, PJ; bez dodatnih operativnih zabrana.
- BS poruke grešaka hijerarhije (`org-hierarchy-messages.util.ts`).
- Frontend: filtrirani tipovi u formi, nasljeđeno skladište u org UI, autocomplete org. jedinice na radnicima.

## 2026-06-03 (bugfix batch)

- Effective warehouse inheritance: walk-up od org čvora prema korijenu (paralelno s effective location/signer patternom).
- Child org s vlastitim skladištem override-uje parent; dokumentirano u `warehouses/MATRIX.md`.

## 2026-06-03

- `effectiveSignerId` denormalizacija + `SignerResolutionService`.
- Matrica parent→child tipova + validacija u `org-units.service`.
- Edge-case: promjena parent/tipa provjerava postojeću djecu.
- Automatski unit testovi matrice parent→child — `org-hierarchy-validation.util.spec.ts` (`npm run test:unit` u backendu).

## 2026-05-29

- Org units REST API + tree builder (faza 2).
