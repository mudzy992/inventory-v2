# Evidens Surface — frontend dizajn sistem (2026-10-28)

## Zašto

Neovisni code-only audit (`docs/frontend-code-audit-2026-10-28.md`) je pokazao da
je frontend imao **jedan CSS fajl** sa `@theme` tokenima koje gotovo niko nije
koristio: 177 `bg-white`, 121 `bg-gray-50`, 35 `bg-blue-600`, tamni `bg-slate-900`
sidebar, 0 `focus-visible` pravila, 0 error boundary-a i 0 frontend spec fajlova.
"Evidens Surface" je zato **redizajn aplikacijskog omotača i prijave**, a ne
prepisivanje 250 poslovnih komponenti — one ostaju netaknute i rade kao prije.

## Šta je redizajnirano

| Površina | Fajl | Promjena |
| --- | --- | --- |
| Aplikacijski omotač | `components/Layout.tsx` | Svijetla `canvas/panel` površina, sticky header s `backdrop-blur`, skip-link, jedan scroll kontejner s `id="main-content"`. |
| Sidebar | `app-sidebar-nav.tsx`, `sidebar-nav-button.tsx` | Tamni `slate-900` → svijetli `bg-panel`; aktivna stavka `bg-brand-soft` + `text-brand-ink` umjesto punog `bg-blue-600`; zaobljeni, razmaknuti itemi; `aria-label` na `<nav>`. |
| Mobilni drawer | `app-nav-drawer.tsx` | Pravi `role="dialog" aria-modal="true"`, fokus na dugme za zatvaranje, povrat fokusa, Escape, backdrop kao `<button>` (ne klikabilni `div`). |
| Korisnički meni | `ui/user-menu.tsx` | `aria-haspopup/expanded/controls`, `role="menu"/"menuitem"`, ArrowDown, Escape, klik van, povrat fokusa, `Badge` za ulogu. |
| Prijava | `ui/auth-shell.tsx`, `LoginForm.tsx`, `LoginPage.tsx` | Svijetli split-screen, stvarni `<label>` + `htmlFor`, `aria-invalid`/`aria-describedby`, `role="alert"` za grešku, toggle vidljivosti lozinke, `aria-busy` pri slanju. |
| Zajednički primitivi | `ui/button.tsx`, `badge.tsx`, `page-header.tsx`, `form-styles.ts`, `route-page-fallback.tsx`, `app-brand.tsx` | Semantički tokeni, `type="button"` default, `loading` stanje, geometrijski SVG brand mark, fluidna tipografija. |
| Otpornost | `ui/app-error-boundary.tsx`, `ui/app-loading-screen.tsx` | `getDerivedStateFromError` + `componentDidCatch`, `role="alert"` fallback s retry, PII-free `app:render-error` signal; jedan brendirani loading ekran. |

`ui/premium-auth-layout.tsx` (tamni) je **namjerno zadržan** za setup wizard i
prezentacijske stranice koje na njemu zavise. Redizajn prijave koristi novi
`AuthShell`, pa nijedna postojeća setup ruta nije slomljena.

## Tokeni

Svi tokeni su u `@theme` bloku `src/index.css` i njihov testabilni ogledalni
prikaz u `src/design-system/tokens.ts`. `tokens.spec.ts` tvrdi da su CSS i TS
vrijednosti identične, a `contrast.ts` računa WCAG 2.2 omjer kontrasta.

| Token | Vrijednost | Namjena |
| --- | --- | --- |
| `canvas` | `#f7f9fc` | Pozadina aplikacije |
| `panel` | `#ffffff` | Površine, header, sidebar, kartice |
| `subtle` | `#f1f5f9` | Hover, skeletoni, sekundarne površine |
| `ink` | `#111827` | Primarni tekst |
| `ink-muted` | `#5b6779` | Sekundarni tekst (≥ 4.5:1 na panelu) |
| `ink-subtle` | `#7c8798` | Samo oznake/veliki tekst |
| `line` / `line-strong` | `#e5eaf1` / `#d4dce7` | Granice, scrollbar |
| `brand` / `brand-hover` | `#4f46e5` / `#4338ca` | Primarna akcija, fokus |
| `brand-soft` / `brand-ink` | `#eef2ff` / `#3730a3` | Aktivna navigacija, badge |
| `success/warning/danger-ink` | `#15803d` / `#b45309` / `#b91c1c` | Statusni tekst |

**Pravilo:** redizajnirane komponente koriste isključivo semantičke Tailwind
utilitije generisane iz tokena (`bg-panel`, `text-ink`, `border-line`,
`bg-brand`, `rounded-[var(--radius-control)]`). Sirove hex boje pripadaju samo
`index.css` i `tokens.ts`. CI gate `check-frontend-contract.mjs` to provjerava.

## Standardi koje sistem ispunjava

- **WCAG 2.2 AA:** 11 obaveznih parova tekst/pozadina ≥ 4.5:1, provjereno u
  unit testovima i u CI gate-u nezavisnom implementacijom istog algoritma.
- **`:focus-visible` globalno**, sa `!important` jer starije stranice koriste
  `outline-none` u utilities layeru; `forced-colors` i `prefers-contrast: more`
  imaju zasebna pravila.
- **`prefers-reduced-motion: reduce`** globalno (prije je postojao samo u setup
  wizardu); skeletoni koriste `motion-safe:animate-pulse`.
- **Skip link** kao prvi tab stop (`#main-content`), logička CSS svojstva
  (`inset-inline-start`, `padding-block`) i `color-scheme: light` + `accent-color`.
- **Semantički HTML / ARIA:** `role="dialog"`, `role="menu"`, `aria-expanded`,
  `aria-modal`, `aria-live`, `aria-busy`, `aria-invalid`, `aria-describedby`.
- **Fluidna tipografija** `clamp()` za naslove, 8px ritam, radii 10/14px, dva
  nivoa sjene (`shadow-surface`, `shadow-raised`).

## Testovi i CI

- `npm run test:unit` → **Vitest 5 + jsdom + Testing Library**, 12 spec fajlova /
  56 scenarija (tokeni, kontrast, button, badge, error boundary, user menu,
  auth shell, login forma, drawer, loading, role display).
- `node scripts/check-frontend-contract.mjs` → TypeScript **AST** provjera:
  0 dugmadi bez `type`, 0 inputa bez accessible name, 0 `<img>` bez `alt`,
  0 ne-interaktivnih `onClick` bez `role=presentation/dialog` ili
  `onKeyDown + tabIndex`; plus tokeni, AA parovi, error-boundary wiring,
  zabrana sirovih hex boja / `outline-none` / `console.*` / `dangerouslySetInnerHTML`.
- `node scripts/check-frontend-bundle.mjs` → budžet veličine JS/CSS chunkova
  nakon `npm run build`.

## Namjerno odloženo (dokumentovan rizik)

- **Tamni mod za svih 250 stranica.** Tokeni su spremni za temiranje, ali
  naslijeđene stranice koriste `bg-white`/`text-gray-900` direktno. Djelimični
  dark mode bi izgledao slomljeno, pa ga ne isporučujemo bez potpunog prelaza.
- **Potpuni dizajn svih poslovnih stranica.** Redizajn pokriva omotač, prijavu
  i zajedničke primitive; stranice zadržavaju postojeći izgled, ali nasljeđuju
  globalni fokus, kontrast, tokene i dijeljene kontrole.
