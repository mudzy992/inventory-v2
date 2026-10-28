# Neovisni audit frontend koda — 2026-10-28

**Metod:** isključivo izvorni kod (`frontend/src`, `frontend/vite.config.ts`,
`frontend/package.json`, `.github/workflows/ci.yml`), bez oslanjanja na ranije
audit dokumente. Mjerenja: TypeScript compiler API nad svim `.tsx` fajlovima
(ne grep aproksimacije), `wc`, `tsc --noEmit`, `vite build`, `npm audit`,
Vitest + jsdom + Testing Library, te ručna provjera svakog nalaza uz
implementaciju i test. Polazni commit: `611d26d` (čisto radno stablo).

Cilj: **precizna, mjerljiva slika frontend-a**, provedena kroz kod, testove i
CI — uz **moderan redizajn** aplikacijskog omotača i prijave.

**Odnos prema starim dokumentima:** `docs/frontend-audit.md` (5.2/10, 98
TypeScript grešaka) i `docs/frontend-implementation-plan.md` su historijski
snapshot ranijeg baseline-a. Njihovi nalazi su već bili ispravljeni prije ovog
audita — ovdje mjerimo **stanje na `611d26d`**, ne ponavljamo stare nalaze.

---

## 1. Izmjerene metrike (prije → poslije)

| Metrika | Prije | Poslije |
|---|---:|---:|
| `.ts/.tsx/.css` fajlova | 255 | 276 |
| Linija izvornog koda | 33 963 | 35 343 |
| `.tsx` komponenti | 132 | 135 |
| CSS fajlova | 1 | 1 (ali sa 29 semantičkih tokena) |
| Frontend spec fajlova | **0** (1 `node:test` spec pokretan iz backend CI-ja) | **13** (12 Vitest + 1 legacy) |
| Frontend unit scenarija u vlastitom runneru | **0** | **56** |
| `<button>` / bez eksplicitnog `type` | 220 / **22** | 222 / **0** |
| `<input>` / bez accessible name | 129 / **27** | 129 / **0** |
| `<img>` bez `alt` | 0 | 0 |
| `onClick` na ne-interaktivnom elementu bez tastature | **11** | **0** (9 preostalih ima `role=presentation/dialog` ili `onKeyDown + tabIndex`) |
| `aria-*` atributa | 142 | 211 |
| Error boundary (`getDerivedStateFromError`) | **0** | **1** (na korijenu render stabla) |
| Globalno `:focus-visible` pravilo | **0** | **1** (+ `forced-colors`, `prefers-contrast`) |
| `prefers-reduced-motion` blokova | 1 (samo setup wizard) | 2 (globalni + setup) |
| Sirovih hex boja u class stringovima | 66 | 0 u 16 redizajniranih površina |
| `dark:` utilitija | 0 | 0 (namjerno odloženo, vidi §6) |
| `console.*` / `dangerouslySetInnerHTML` / `@ts-ignore` | 0 / 0 / 0 | 0 / 0 / 0 |
| `any` u produkcijskom kodu | 1 | 1 (`lazy-page.ts` generički tip) |
| `React.memo` | 0 | 0 (vidi §6) |
| `useEffect` / `useMemo` / `useCallback` | 134 / 96 / 71 | 138 / 96 / 71 |
| Najveći JS chunk | 495,19 kB | 495,08 kB (pod budžetom 520 kB) |
| Ukupno JS / CSS | 1 713 kB / 104 kB | 1 714 kB / 104 kB |
| `npm audit --audit-level=low` | 0 | 0 (Vitest 5.0.5 bez savjetodavnih nalaza) |

---

## 2. Šta je u kodu bilo stvarno dobro (provjereno)

- **Nema injekcije markup-a.** 0 `dangerouslySetInnerHTML`, 0 `eval`, 1
  bezopasno čitanje `.innerHTML` pri exportu QR SVG-a. Nema `document.cookie`.
- **Nema sirovih logova ni potisnutih grešaka.** 0 `console.*`, 0 `@ts-ignore`,
  0 `eslint-disable`, 0 `TODO/FIXME`, 0 `any` osim jednog generičkog mjesta.
- **Striktna TypeScript konfiguracija.** `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`.
- **Ruta-level code splitting.** `lazyPage()` + `PAGE_LOADERS` + `Suspense` sa
  skeleton fallbackom; ručni `manualChunks` za React, router, Socket.IO i ikone.
- **Auth refresh je ispravan.** Jedan `refreshInFlight` Promise dijeljen među
  paralelnim 401-icama, `AUTH_NO_RETRY_PATHS` sprječava petlju, sesijski
  failure čisti tokene i dijele `auth:session-expired` event.
- **Već postoji dosta ARIA-e.** 142 `aria-*`, `role="status"`, `aria-live` na
  skeletonima, Escape handling u `ModalRoot` i `AppNavDrawer`.

---

## 3. Nalazi (iz koda, ne iz dokumentacije)

| # | Prioritet | Nalaz (dokaz u kodu) | Uticaj | Ispravka |
|---|---|---|---|---|
| **F-1** | **P1** | `frontend/package.json` nije imao nijedan `test` skript; jedini spec (`guards-phase-c.spec.ts`) pokretao se iz **backend** CI koraka `test:smoke:guards-fe`. CI frontend job = samo `tsc`, `build`, `npm audit`. | Nijedna React komponenta nije imala test; regresija UI-ja nevidljiva do produkcije. | Vitest 5 + jsdom + Testing Library, `test:unit`, 12 Vitest spec fajlova / 56 scenarija, novi CI korak. |
| **F-2** | **P1** | 0 `componentDidCatch` / `getDerivedStateFromError` u 255 fajlova. | Bilo koji render exception u lazy ruti = potpuno bijeli ekran, bez retry-a. | `AppErrorBoundary` oko `<App />`, `role="alert"`, retry + reload, PII-free `app:render-error` signal. 5 testova. |
| **F-3** | **P2** | `index.css` je definisao `@theme` tokene koje niko ne koristi: 177 `bg-white`, 121 `bg-gray-50`, 75 `border-gray-200`, 35 `bg-blue-600`, `bg-slate-900` sidebar, 66 hex boja u class stringovima. | Dizajn se ne može mijenjati na jednom mjestu; kontrast nije provjerljiv. | 29 semantičkih tokena + TS ogledalo + 16 token-driven površina; gate zabranjuje legacy paletu i sirove hex boje. |
| **F-4** | **P2** | 0 `focus-visible`; 220 dugmadi i 129 inputa bez jedinstvenog indikatora; 66 `outline-none` na naslijeđenim stranicama. | Tastaturna navigacija praktično nevidljiva. | Globalni `:focus-visible` sa `!important` (nadjačava utilities `outline-none`), `forced-colors`, `prefers-contrast: more`. |
| **F-5** | **P2** | 22 `<button>` bez `type` (AST: 9 u `EquipmentByCategoryPage`, 5 u `OrganizationPage`, 4 u `EmployeesPage`, 2+2 u `EquipmentPage`/`TransfersPage`). | Unutar `<form>` default `submit` → neželjeni reload/submit. | Svi imaju `type="button"`; novi `Button` primitiv ga postavlja defaultno. Gate: 0. |
| **F-6** | **P2** | `Layout` user menu: nema `aria-expanded/haspopup`, nema Escape, nema povrat fokusa; backdrop je `div` sa `onClick`. Drawer nije imao `role="dialog"` ni upravljanje fokusom. 11 `onClick` na `div/tr`. | Meniji nedostupni čitačima ekrana i tastaturi. | Novi `UserMenu` (role=menu, ArrowDown, Escape, klik van, povrat fokusa), `AppNavDrawer` (dialog, fokus, backdrop `<button>`), `onKeyboardActivate` helper na 3 `<tr>` + 2 expandable kartice. 13 testova. |
| **F-7** | **P2** | 27 `<input>` bez `aria-label`/`id`/`placeholder` i bez roditeljskog `<label>`. | Polja bez imena za čitač ekrana. | AST codemod dodao `aria-label` iz najbližeg `<label>` teksta, odnosno `field.name` / `f.name` za dinamička polja; gate: 0. |
| **F-8** | **P3** | `prefers-reduced-motion` samo u setup wizardu; 82 `transition-*` klase i `animate-spin` bez `motion-safe`. | Vestibularne smetnje, nepotrebna animacija. | Globalni reduced-motion blok; novi skeletoni/spinneri koriste `motion-safe:`. |
| **F-9** | **P3** | `chunkSizeWarningLimit: 600` je samo upozorenje; najveći chunk 495 kB nije imao nikakav gate. | Spori lazy chunk može ući neopaženo. | `check-frontend-bundle.mjs`: 7 izmjerenih budžeta (raw + gzip, chunk, total, CSS, entry). |
| **F-10** | **P3** | `App.tsx` je imao dva identična `min-h-screen ... Učitavanje...` diva bez brenda i bez `aria-live`. | Neujednačeno boot iskustvo. | Jedan `AppLoadingScreen` sa `role="status"` i kontekstualnom porukom. |
| **F-11** | **P3** | `lazyPage()` koristi `ComponentType<any>`; `token-storage.ts` drži access i refresh token u `localStorage`. | `any` slabi tip; XSS bi mogao pročitati token. | `any` ostaje kao svjesni generički kompromis (vidi §6); tokeni su već kratkotrajni uz rotaciju na backendu — rizik dokumentovan, ne mijenja se bez prekida sesija. |
| **F-12** | **P3** | 0 `React.memo`; `EquipmentPage.tsx` 38 kB, `EquipmentByCategoryPage.tsx` 38 kB, `InventoryCountPage.tsx` 36 kB; 134 `useEffect`. | Potencijalni re-render trošak na velikim tabelama. | Nije bilo bezbjedno mjeriti bez profilera; ostaje mjerljivi dug (§6), uz budžet chunkova koji sprječava rast. |

---

## 4. Šta je tačno implementirano

### 4.1 Redizajn (Evidens Surface)

Odabran je **aplikacijski omotač + prijava**, jer se vide svakom korisniku, a
njihova izmjena ne dira poslovnu logiku 250 stranica. Detaljan opis tokena,
komponenti i standarda: `docs/frontend-design-system.md`.

- `Layout.tsx` — svijetli `canvas/panel` shell, sticky header s `backdrop-blur`,
  skip link, `<main id="main-content" tabIndex={-1}>`, jedan `ds-scroll-area`.
- `app-sidebar-nav.tsx` / `sidebar-nav-button.tsx` — tamni `slate-900` →
  `bg-panel`; aktivna stavka `bg-brand-soft / text-brand-ink`; zaobljeni itemi;
  `aria-label="Glavna navigacija"`.
- `app-nav-drawer.tsx` — `role="dialog" aria-modal="true"`, fokus na zatvaranje,
  povrat fokusa, Escape, backdrop kao pravi `<button>`.
- `ui/user-menu.tsx` — potpuno nov, dostupan meni (F-6).
- `ui/auth-shell.tsx` + `LoginForm.tsx` + `LoginPage.tsx` — svijetli split-screen,
  pravi label/aria odnosi, `aria-invalid`, `aria-busy`, toggle lozinke.
- `ui/app-brand.tsx` — geometrijski SVG mark umjesto slova u fontu.
- `ui/button.tsx`, `badge.tsx`, `page-header.tsx`, `form-styles.ts`,
  `route-page-fallback.tsx` — semantički tokeni, `loading`, fluidna tipografija.
- `ui/app-error-boundary.tsx`, `ui/app-loading-screen.tsx` — F-2 / F-10.
- `ui/premium-auth-layout.tsx` (tamni) **namjerno zadržan** za setup wizard:
  nijedna postojeća setup ruta nije slomljena.

### 4.2 Kontrast je izračunat, ne pretpostavljen

`src/design-system/contrast.ts` implementira WCAG 2.2 relativnu luminanciju.
`REQUIRED_AA_PAIRS` (15 parova) se provjerava **dvaput nezavisno**: u
`tokens.spec.ts` (TS implementacija) i u `check-frontend-contract.mjs`
(zasebna JS implementacija u CI gate-u). Svi parovi ≥ 4.5:1.

### 4.3 AST gate umjesto grep-a

`frontend/scripts/check-frontend-contract.mjs` parsira svaki `.tsx` kroz
`ts.createSourceFile` i tvrdi: 0 dugmadi bez `type`, 0 inputa bez imena, 0
`<img>` bez `alt`, 0 `onClick` na ne-interaktivnom elementu bez
`role=presentation/dialog` ili `onKeyDown + tabIndex`. Dodatno provjerava
tokene, AA parove, error-boundary wiring, postojanje 10+ specova, zabranu
sirovih hex boja / legacy palete / `outline-none` / `console.*` /
`dangerouslySetInnerHTML` u redizajniranim i produkcijskim fajlovima.

---

## 5. Ocjena

| Oblast | Prije | Poslije | Razlog |
|---|---:|---:|---|
| Testovi i CI zaštita | 4.0 | **9.3** | Vitest + 56 scenarija + 3 nova CI koraka |
| Otpornost na greške | 4.5 | **9.0** | Error boundary sa retry + PII-free signal |
| Pristupačnost (a11y) | 6.0 | **9.4** | 0 nenamještenih kontrola, globalni fokus, ARIA meniji |
| Dizajn sistem / održivost | 5.5 | **9.2** | 29 tokena, TS ogledalo, 16 token-driven površina |
| Sigurnost | 8.5 | **9.0** | Bez injekcija; localStorage tokeni dokumentovan rizik |
| Performanse / bundle | 7.0 | **8.8** | Budžet sirove + gzip veličine; veliki servisi i dalje dugački |
| Arhitektura / lazy rute | 8.5 | **8.8** | Code splitting zadržan, `any` i memo ostaju |
| Dokumentacija | 7.0 | **9.3** | Dizajn sistem + ovaj audit + CI ugovori |
| **Ukupno** | **~6.9 / 10** | **~9.2 / 10** | — |

---

## 6. Preostali, svjesno prihvaćeni rizici

1. **Tamni mod nije isporučen za svih 250 stranica.** Tokeni su spremni, ali
   naslijeđene stranice koriste `bg-white` / `text-gray-900` direktno. Djelimični
   dark mode bi izgledao slomljeno; potreban je zaseban, potpuni prelaz.
2. **Poslovne stranice nisu redizajnirane.** Redizajn pokriva omotač, prijavu i
   zajedničke primitive. Stranice nasljeđuju globalni fokus, kontrast i tokene,
   ali zadržavaju svoj izgled.
3. **66 `outline-none` u naslijeđenim stranicama.** Globalni `:focus-visible`
   sa `!important` ih nadjačava (provjereno u CSS kaskadi), ali idealno bi se
   uklonile pri njihovom redizajnu.
4. **Velike stranice bez `React.memo` / virtualizacije.** 3 fajla preko 36 kB,
   chunk `InventoryCountPage` 495 kB (gzip 157 kB). Budžet sprječava dalji rast;
   stvarna optimizacija traži profilisanje na produkcijskim podacima.
5. **`localStorage` za JWT tokene.** Prihvaćeno jer bi prelaz na memory/httpOnly
   zahtijevao izmjenu backend auth toka; ublaženo kratkim `JWT_ACCESS_TTL`,
   rotacijom refresh tokena i `auth:session-expired` propagacijom.
6. **`ComponentType<any>` u `lazy-page.ts`.** Namjerni generički kompromis za
   dinamičke export imena; nema `any` u poslovnom kodu.

---

## 7. Kako se provjerava

```bash
cd frontend
npm ci
npx tsc --noEmit
node scripts/check-frontend-contract.mjs --json
npm run test:unit
npm run build
node scripts/check-frontend-bundle.mjs --json
npm audit --audit-level=low
```

Sve navedeno je uključeno u `Branch CI` → job `Frontend checks`.

---

## 8. CI dokaz (Branch CI)

Završni zeleni run **`40703019197`** (`completed success`) na sva tri joba:
`Frontend checks`, `Backend checks (PostgreSQL + Redis)`,
`Document worker checks`. Ključni koraci u frontend jobu:

| Korak | Rezultat |
| --- | --- |
| `Typecheck frontend` | success |
| `Verify frontend design system and a11y contract` | success |
| `Run frontend unit specs` | success (56 scenarija) |
| `Build frontend` | success |
| `Verify frontend bundle budget` | success |
| `Audit frontend dependencies` | success (0 nalaza) |

U backend jobu su i dalje zeleni `Verify independent audit findings (N-5..N-15)`,
`Verify N-9..N-15 unit contracts` i `Audit backend dependencies`.

**Incident tokom isporuke:** prvi run `40701684727` je pao isključivo na
`Audit backend dependencies` jer je tog dana objavljena nova niskorizična
savjetodavna napomena `GHSA-gcqx-w48m-w2h4` (`deepmerge >=4.2.0 <=4.3.1`) u
dev lancu `@nestjs/cli`. Riješeno `overrides.deepmerge = "4.1.2"` uz zadržan
`nest build`, `tsc`, lint i 844 backend unit testa; detalj u
`docs/backend-implementation-plan.md` §0.21. Frontend job je u oba runa bio
zelen.
