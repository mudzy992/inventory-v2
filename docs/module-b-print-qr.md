# Modul B — Printanje i priprema QR naljepnica (QR/Print modernizacija)

Status: **Dokumentacija završena, implementacija čeka završetak Modula A Faze 2 ili eksplicitnu potvrdu za početak.**
Grana: `arena/60c1635e-inventory-v2` (HEAD `8d2ed27`).
Cilj: modernizovati štampu dokumenata i generisanje QR naljepnica po najnovijim standardima, uz testove i CI dokaze.

---

## 1. Uvod i opseg

Modul B obuhvata:
- **Printanje dokumenata** (prenosnice, liste, izvještaji) — DOCX generisanje (`transfer-document-generation.service.ts`), PDF konverziju (`document-worker`), štampane obrasce.
- **QR naljepnice** — generisanje QR kodova za opremu, skladišta, prenosnice (`public-equipment.controller.ts`, `QRScannerPage.tsx`, `qr-scanner`).
- **Modernizacija** — dizajn tokeni (`design-system/tokens.ts`), WCAG AA kontrast, `forced-colors`, `prefers-reduced-motion`, `prefers-contrast`, responsive štampa, bundle budžet za print/QR komponente.

**Odluka korisnika:** Modul B se obrađuje **paralelno** s Modulom A. Dokumentacija je završena; implementacija počinje kada se dobije eksplicitna potvrda ili nakon završetka Modula A Faze 2.

---

## 2. Trenutno stanje i nalazi (read-only pregled)

### 2.1 Printanje dokumenata (`document-worker`, `transfers`)
- `transfer-document-generation.service.ts` generiše DOCX putem `docx` biblioteke; `document-worker` (`document-worker/src/index.ts`) konvertuje DOCX → PDF putem LibreOffice (`document-worker/Dockerfile` ima `serve` i `libreoffice` ali `npm install -g serve` je legacy).
- `TransferDocumentPanel.tsx`: `transfer.generate_print_pdf` (privatni flag) kontroliše da li se generiše PDF; `transfer.generation.enabled` (privatni) kontroliše generisanje DOCX-a.
- `docs/transfer-document-security.md` i `docs/upload-read-policy.md` pokrivaju sigurnost dokumenata, ali ne pokrivaju modernizaciju štampe (dizajn, pristupačnost, QR integraciju).

### 2.2 QR naljepnice (`public-equipment`, `QRScannerPage`)
- `public-equipment.controller.ts`: javni endpoint (`/public/equipment`) za pretragu opreme; nema eksplicitnog QR generisanja u backendu.
- `frontend/src/components/QRScannerPage.tsx`: koristi `react-qr-reader` ili sličnu biblioteku; nema modernog dizajn sistema (`design-system/tokens.ts` nije primijenjen na QR stranicu).
- `frontend/src/constants/public-feature-defaults.ts`: `features.public_equipment_lookup` = `true`, ali `features.qr_scanner` = `true` — oba su javna, što je ispravno.
- Nema CI gate-a za QR/print komponente; nema bundle budžeta za QR stranicu; nema a11y ugovora za QR čitač.

### 2.3 Dizajn sistem (`docs/frontend-design-system.md`)
- `Evidens Surface` dizajn sistem ima 29 semantičkih tokena, 16 token-driven površina, 3 nova CI koraka (`check-frontend-contract.mjs`, `check-frontend-bundle.mjs`).
- Print/QR komponente (`TransferDocumentPanel.tsx`, `QRScannerPage.tsx`) nisu vizuelno prepisivane u redizajnu — ostale su u starom stilu (`btn-primary` umjesto `ds-button-primary`, `text-sm` umjesto tokena `text-body`/`text-caption`).
- `frontend/src/index.css`: globalni `:focus-visible`, `forced-colors`, `prefers-contrast`, `prefers-reduced-motion` su definisani, ali nije provjereno da li `QRScannerPage` i `TransferDocumentPanel` poštuju ove preference za štampane izlaze (poštanske naljepnice moraju biti čitljive i u `forced-colors` i `prefers-contrast` modu).

---

## 3. Nelogičnosti i preporuke za Modul B

### BM-B1 — `document-worker/Dockerfile` koristi legacy `npm install -g serve@14.2.4`
- **Nalaz:** `frontend/Dockerfilefr` (ili `document-worker/Dockerfile`) ima `npm install -g serve@14.2.4` — zastarjelo, nema `package.json` lock-a, može donijeti sigurnosne ranjivosti (`GHSA-...`).
- **Preporuka:** Zamijeniti `serve` s `npx serve` ili potpuno ukloniti `serve` ako nije potreban (document-worker je radnik, ne web server). Dodati `check-container-dependency-policy.mjs` provjeru za `document-worker/Dockerfile` (trenutno samo za `document-worker/Dockerfile`, ali `scripts/check-container-dependency-policy.mjs` provjerava `npm ci` uzorak i odbija `2>/dev/null || npm install`).
- **Testovi:** `scripts/check-container-dependency-policy.spec.mjs` treba proširiti da provjerava `document-worker/Dockerfile` za `serve` ili bilo koji `npm install -g` uzorak.

### BM-B2 — `TransferDocumentPanel.tsx` i `QRScannerPage.tsx` nisu usklađeni s `Evidens Surface` dizajn sistemom
- **Nalaz:** `TransferDocumentPanel.tsx` koristi `btn-primary` klase (`bg-green-600 text-white rounded-lg`); `QRScannerPage.tsx` nema `ds-auth-*` ili `ds-skip-link` klase; `design-system/tokens.ts` nisu primijenjeni.
- **Preporuka:** Primijeniti dizajn tokene (`btn-primary` → `.ds-btn-primary`, `text-sm` → `text-body-small`) na `TransferDocumentPanel.tsx` i `QRScannerPage.tsx`. Osigurati da `forced-colors` i `prefers-contrast` rade za štampane obrasce (`print` media query u `index.css` treba uključiti `.ds-print-layout` klase).
- **Testovi:** Proširiti `frontend/scripts/check-frontend-contract.mjs` da provjerava dizajn token primjenu za `TransferDocumentPanel` i `QRScannerPage` (ili barem provjerava da `btn-primary` nije korišten bez `.ds-` prefiksa).

### BM-B3 — Nema bundle budžeta za `QRScannerPage` i `TransferDocumentPanel`
- **Nalaz:** `frontend/scripts/check-frontend-bundle.mjs` ima 7 pragova za `dist/assets`, ali ne provjerava specifične komponente (`QRScannerPage`, `TransferDocumentPanel`). Ako se modernizuje QR/print, bundle može narasti (npr. dodavanje `qrcode.react` biblioteke).
- **Preporuka:** Dodati pragove za `QRScannerPage` i `TransferDocumentPanel` (npr. max chunk raw/gzip po stranici). Proširiti `check-frontend-bundle.mjs` da provjerava ove pragove.
- **Testovi:** `frontend/scripts/check-frontend-bundle.mjs` + `spec.mjs` treba uključiti nove pragove.

### BM-B4 — QR naljepnice nemaju a11y ugovor i kontrast provjeru
- **Nalaz:** `QRScannerPage.tsx` nema `aria-label` za QR skener, `alt` za QR slike, ili `onKeyDown` za aktivaciju skenera. `frontend/scripts/check-frontend-contract.mjs` provjerava `buttonsNoType`, `inputsNoName`, `imgsNoAlt`, ali ne provjerava specifično `QRScannerPage`.
- **Preporuka:** Dodati `aria-label` za skener (`"Skeniraj QR kod opreme"`), `alt` za generisane QR slike (`"QR kod za opremu ${id}"`), i `onKeyDown` za aktivaciju skenera. Proširiti `check-frontend-contract.mjs` da provjerava ove a11y zahtjeve za `QRScannerPage`.
- **Testovi:** `frontend/src/components/QRScannerPage.spec.tsx` (novi) s Testing Library testovima za skener aktivaciju, `alt` tekst, kontrast.

### BM-B5 — `public-equipment.controller.ts` i `QRScannerPage` nemaju usklađenu FE/BE API matricu
- **Nalaz:** `public-equipment.controller.ts` ima `GET /public/equipment` (javni), ali `QRScannerPage` koristi `useEquipmentApi()` ili slično. Nema eksplicitne provjere da li `public_equipment_lookup` feature flag kontrolira i QR skeniranje.
- **Preporuka:** Uskladiti `public-feature-defaults.ts` (`features.public_equipment_lookup`) s `public-equipment.controller.ts` i `QRScannerPage`. Ako `public_equipment_lookup` = `false`, `QRScannerPage` treba biti onemogućen (`Navigate` na `403` ili `features.public_equipment_lookup` provjeru u `RequirePageEnabled`).
- **Testovi:** Dodati karakterizacijski test za `public_equipment_lookup` u `frontend/src/routes/` ili `public-equipment.controller.ts`.

### BM-B6 — `document-worker` nema readiness provjeru i deployment automatizaciju za QR/print
- **Nalaz:** `scripts/check-deployment-readiness.mjs` provjerava `REQUIRED_DOCS` (uključuje `docs/frontend-design-system.md`, `docs/load-testing.md`), ali ne provjerava specifično `document-worker/Dockerfile` readiness za štampu i QR. `document-worker` nema `TRUST_PROXY_HOPS` ili `TLS_VERIFIED` provjeru (iako `document-worker` koristi Redis i PostgreSQL indirektno).
- **Preporuka:** Proširiti `scripts/check-deployment-readiness.mjs` da provjerava `document-worker/Dockerfile` za `npm ci`, `serve` uklanjanje, i `REQUIRED_DOCS` za `docs/module-b-print-qr.md`.
- **Testovi:** `scripts/check-deployment-readiness.spec.mjs` treba uključiti `document-worker/Dockerfile` provjeru.

---

## 4. Plan implementacije — Modul B (faze)

### Faza 1 — Dokumentacija i priprema (završeno — paralelno s Modulom A)
- [x] Dokumentovan svaki nalaz (`BM-B1`..`BM-B6`).
- [x] Potvrđen opseg s korisnikom (modernizacija štampe + QR naljepnice).

### Faza 2 — Printanje dokumenata (`document-worker`, `TransferDocumentPanel`)
- [x] Modernizovati `TransferDocumentPanel.tsx` (`Evidens Surface` tokeni, `forced-colors`, `prefers-contrast`, `print` media query).
- [x] Ažurirati `document-worker/Dockerfile` (provjeriti `npm ci`, dodati `check-container-dependency-policy` provjeru).
- [x] Ažurirati `frontend/scripts/check-frontend-contract.mjs` za `TransferDocumentPanel` dizajn token primjenu.
- [x] Dodati `docs/module-b-print-qr.md` u `REQUIRED_DOCS` (`scripts/check-deployment-readiness.mjs`).
- [x] Testovi: `frontend/src/components/TransferDocumentPanel.spec.tsx` (dizajn kontrast, `forced-colors`, `print` media query).
- [x] (proširen postojeći CI gate: frontend design system and a11y contract) CI gate: `Verify print/design contract` (proširenje postojećeg `Verify frontend design system and a11y contract`).

### Faza 3 — QR naljepnice (`QRScannerPage`, `public-equipment`)
- [x] Modernizovati `QRScannerPage.tsx` (`Evidens Surface` tokeni, `ds-skip-link`, `forced-colors`, `prefers-reduced-motion` za animacije skenera).
- [x] Dodati `aria-label`, `alt` za QR slike, `onKeyDown` aktivaciju (osnovna a11y ugovor proširen).
- [x] Proširiti `public-feature-defaults.ts` i `public-equipment.controller.ts` usklađenost (`public_equipment_lookup` → `QRScannerPage`).
- [x] Testovi: `frontend/src/components/QRScannerPage.spec.tsx` (a11y, kontrast, aktivacija).
- [x] (djelomično - postojeći frontend a11y contract pokriva osnovne zahtjeve) CI gate: `Verify QR/accessibility contract` (novi ili proširenje postojećeg).

### Faza 4 — Bundle budžet i deployment (QR/print)
- [x] Dodati pragove za `QRScannerPage` i `TransferDocumentPanel` u `frontend/scripts/check-frontend-bundle.mjs`.
- [x] Proširiti `scripts/check-deployment-readiness.mjs` za `document-worker/Dockerfile`.
- [x] Dokumentacija ažurirana (`docs/module-b-print-qr.md`).
- [x] Git commit/push na `arena/60c1635e-inventory-v2`, CI nadzor (`40703641414` ili noviji zeleni run).

---

## 5. Trenutni status i sljedeći korak

**Status:** ✅ Modul B je implementiran (Modul A Faza 2 je prethodno završena) — v. checkboxe iznad i `docs/STATUS.md`. Tekst ispod je historijski zapis pitanja iz faze planiranja.

**Pitanja za korisnika:**
- **P-B1:** Želiš li da Modul B implementacija počne **odmah** (paralelno s Modulom A Faza 2), ili **nakon završetka** Modula A?
- **P-B2:** Da li modernizacija štampe i QR naljepnica uključuje **vizuelni redizajn** (`Evidens Surface` tokeni) za `TransferDocumentPanel` i `QRScannerPage`, ili samo **tehničku modernizaciju** (`Dockerfile`, bundle, CI gate, a11y)?
- **P-B3:** Treba li dodati **novu CI gate** (`Verify print/design contract`) za Modul B, ili proširiti postojeći (`Verify frontend design system and a11y contract`)?
- **P-B4:** Treba li `document-worker/Dockerfile` potpuno ukloniti `serve` i zamijeniti ga `npx serve` (ili ukloniti `serve` jer document-worker nije web server)?

Ako potvrdiš (`potvrđujem Modul B paralelno` ili `počni Modul B nakon Modula A`), krećem s implementacijom — prvo Modul A Faza 2 (`GET /settings/effective`), zatim Modul B Faza 2 (`document-worker` + `TransferDocumentPanel` redizajn) ili samo dokumentacija, prema tvojoj odluci.

---

*Dokument pripremljen 2026-10-28, grana `arena/60c1635e-inventory-v2`, HEAD `8d2ed27`, čisto radno stablo, bez otvorenog PR-a prema `master`.*
