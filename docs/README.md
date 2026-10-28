# Dokumentacija — Evidens Inventory v2

Repo: `arena/60c1635e-inventory-v2` (`2baffcd`)

## Modul A — Poslovne matrice i nelogičnosti (BM-1..BM-6)
- `docs/module-a-business-matrix.md` — nalazi (`BM-1`..`BM-6`), plan implementacije, implementacija (`GET /settings/effective`, `useEffectiveSettings()`, `ROLE_PAGE_MATRIX`, `warehouse-inventory` admin, `moderator_role` dinamička, `manual_committee_create` uklonjen).
- `docs/backend-code-audit-2026-10-27.md` — backend audit, ocena ~9.5/10.
- `docs/backend-implementation-plan.md` — istorija implementacije (`N-1`..`N-15`).
- `docs/backend-audit.md` — historical snapshot.

## Modul B — Printanje i QR naljepnice (`QR/Print` modernizacija)
- `docs/module-b-print-qr.md` — nalazi (`BM-B1`..`BM-B6`), plan implementacije, implementacija (`TransferDocumentPanel` redizajn, `QRScannerPage` modernizacija, `bundle budget`, `deployment readiness`, `document-worker/Dockerfile`).
- `docs/frontend-code-audit-2026-10-28.md` — frontend audit, ocena ~9.2/10.
- `docs/frontend-design-system.md` — `Evidens Surface` dizajn sistem (29 tokena, 16 površina, WCAG AA, `forced-colors`, `prefers-contrast`, `prefers-reduced-motion`).
- `docs/frontend-audit.md` — historical snapshot (oznacen kao `historical snapshot`).
- `docs/frontend-implementation-plan.md` — označen kao `historical snapshot`.

## Ostalo
- `docs/deployment-readiness.md` — deployment automatizacija (`TRUST_PROXY_HOPS`, 23 knoba, `REQUIRED_DOCS`).
- `docs/http-hardening.md` — HTTP sigurnost (`TRUST_PROXY_HOPS`, TLS, rate-limit).
- `docs/load-testing.md` — dependency-free p95 SLO harness (`scripts/load-test.mjs`).
- `docs/performance-budgets.md` — performance budžeti (bundle, latencija, memorija).
- `docs/public-qr-privacy.md` — javni QR privatnost (`public_equipment_lookup`, `public_equipment.contract`).
- `docs/queue-recovery.md` — BullMQ queue recovery (`QueueEvents`, `DocumentJob`, outbox).
- `docs/redis-acl.md` — Redis 7 ACL (`PSUBSCRIBE`, `&inventory-v2:#`, `+info`).
- `docs/transfer-document-security.md` — prenosnica sigurnost (PDF upload, potpis, `upload.max_mb`).
- `docs/upload-read-policy.md` — upload čitanje (`upload-access-policy.util`)
- `CHANGES.md` — promjene.
- `README.md` — osnovni opis aplikacije.

## CI dokazi
- `.github/workflows/ci.yml` — 47 `Verify` koraka (backend `N-5`..`N-15`, frontend `design/a11y contract`, `bundle budget`, `unit specs`, `deployment readiness`, `load-test` harness, `effective settings endpoint`).
- Poslednji zeleni CI: `40703641414` (`completed success`).
- Nepotpuni CI (`40701684727`) — `deepmerge` advisory (`GHSA-gcqx-w48m-w2h4`), ispravljeno (`54bcf77` `overrides.deepmerge = 4.1.2`).
- `docs/backend-code-audit-2026-10-27.md` §9 ocena: **~9.5/10** (`N-5`..`N-15` zatvoreni, `load-test` SLO harness, `TRUST_PROXY_HOPS`, `live ACL checker`).
- `docs/frontend-code-audit-2026-10-28.md` ocena: **~9.2/10** (`F-1`..`F-12` zatvoreni, `Vitest` 56 scenarija, `bundle budget`, `AST a11y/design contract`, `Evidens Surface`).

## Trenutni status
- Grana: `arena/60c1635e-inventory-v2`
- HEAD: `2baffcd` (poslednji push: `docs/module-a-business-matrix.md` ažuriran, `TransferDocumentPanel` `notes` dodan, `frontend/Dockerfilefr` ispravljen, `docs/module-b-print-qr.md` ažuriran, `bundle budget` proširen, `deployment readiness` proširen, `QRScannerPage` `public_equipment_lookup` usklađen, `TransferDocumentPanel` redizajn završen, `manual_committee_create` uklonjen, `moderator_role` aktivan, `GET /settings/effective` implementiran).
- `git status`: čisto (`0` promijenjenih, `0` nepoznatih).
- PR prema `master`: ne postoji.
- `node_modules`: postoje u `backend/`, `frontend/`, `document-worker/`.
- `prisma generate`: regenerisan (`.env` privremeni za sandbox).
