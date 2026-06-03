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
