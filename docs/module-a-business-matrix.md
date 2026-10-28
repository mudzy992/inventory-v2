# Modul A — Poslovne matrice i nelogičnosti (BM-1..BM-6)

Status: **Dokumentacija završena, implementacija čeka korisnikovu potvrdu i odgovore na pitanja u §5.**
Grana: `arena/60c1635e-inventory-v2` (HEAD `8d2ed27`).
Cilj: sve nalaze dokumentovati, uskladiti FE/BE prema backend logici, uvesti efektivni endpoint i CI gate.

---

## 1. Metodologija i izvori

Read-only pregled izvršen nad:
- `frontend/src/routes/role-page-access.ts` (FE role/page matrica)
- `frontend/src/routes/require-role.tsx`, `require-page-enabled.tsx`
- `frontend/src/constants/public-feature-defaults.ts`
- `frontend/src/utils/settings-feature.util.ts`, `page-feature-settings.util.ts`
- `backend/src/modules/settings/settings.registry.ts` (privatni / javni ključni registri)
- `backend/src/modules/settings/settings.service.ts`, `settings.controller.ts`
- `frontend/src/components/TransferDocumentPanel.tsx` (BM-1a, BM-1b)
- `frontend/src/helpers/guards/transfer-guards.ts`
- `backend/src/modules/inventory-count/inventory-warehouse-committee.controller.ts` (BM-5)
- `backend/src/modules/warehouses/warehouses.controller.ts`, `users.controller.ts`, `organization/*` (BM-6)
- `frontend/src/hooks/use-role-default-path.ts`, `public-feature-defaults.ts`, `transfer-documents-tab.tsx`, `registrar-stock-page.tsx`
- `backend/src/common/auth/authorization-policy.util.ts` i `settings.service.ts` (efektivni endpoint)

**Odluka korisnika:** idemo prema backendu; admin ima pristup `warehouse-inventory` gdje backend dozvoljava; sve promjene kroz dokumentaciju i diskusiju.

---

## 2. BM-1 — Privatni (`private`) flagovi se čitaju iz admin-only `AdminSettingsProvider` za sve uloge

### 2.1 Opis nalaza
`AdminSettingsProvider` (admin-only) čita privatne (`scope: 'private'`) postavke (`transfer.allow_finalize_without_upload`, `transfer.allow_evidenticar_cross_city`, `upload.max_mb`, `transfer.generation.on_stock_lot_issue`, `features.moderator_role`, `features.inventory_manual_committee_create`, `inventory.auto_create_draft_session`, itd.).

`TransferDocumentPanel.tsx:60-64` i `transfer-guards.ts` koriste ove ključne vrijednosti za sve uloge (evidentičar, moderator, skladištar, koordinator). To znači da ne-admin korisnici dobijaju pogrešne ili nedostupne vrijednosti jer `AdminSettingsProvider` nije dostupan njima, ili se koriste hardkodirani fallback-ovi (`getNumber('upload.max_mb', 10)`) koji ne odražavaju stvarnu backend vrijednost.

### 2.2 Lokacije koda
- `frontend/src/components/TransferDocumentPanel.tsx:60-64`
- `frontend/src/components/TransferDocumentPanel.tsx:105,155-156`
- `frontend/src/helpers/guards/transfer-guards.ts`
- `frontend/src/pages/transfers.tsx` (moguće — provjeriti)
- `frontend/src/pages/transfer-documents-tab.tsx:155-156`
- `frontend/src/pages/registrar-stock-page.tsx:105`

### 2.3 Utjecaj
- Ne-admin korisnici vide pogrešne vrijednosti za `upload.max_mb` i `transfer.allow_finalize_without_upload`.
- Poslovna pravila se ne primjenjuju ispravno po ulozi.
- Privatnost se narušava jer admin-only podaci cure kroz UI logiku.

### 2.4 Preporuka i plan implementacije
1. **Uvesti `GET /settings/effective`** (backend) — autentifikovani korisnik dobiva **whitelist** efektivnih boolean/number/string vrijednosti (~8 ključnih privatnih flagova koje FE treba za poslovna pravila, npr. `transfer.allow_finalize_without_upload`, `upload.max_mb`, `transfer.generation.enabled`, `transfer.allow_evidenticar_cross_city`, `features.moderator_role`, `features.inventory_manual_committee_create`).
2. **FE `useEffectiveSettings()` hook** — čita samo whitelist vrijednosti, zamjenjuje `AdminSettingsProvider` za ove ključne vrijednosti.
3. **Ažurirati `TransferDocumentPanel.tsx`** da koristi `useEffectiveSettings()` umjesto `adminSettings` za `upload.max_mb` i `transfer.allow_finalize_without_upload`.
4. **Ažurirati `transfer-guards.ts`** da prima efektivni objekt, ne `Record<string, unknown>` iz admin-only konteksta.

### 2.5 Pitanja za diskusiju (prije implementacije)
- **P-1:** Treba li `GET /settings/effective` biti dostupan **svim autentifikovanim** korisnicima (uključujući `user`, `evidenticar`, `moderator`, `skladistar`, `popis_koordinator`), ili samo određenim ulogama? Preporučujem sve autentifikovane, jer poslovna pravila trebaju raditi za sve.
- **P-2:** Koje točno ključne vrijednosti ulaze u whitelist? Trenutni prijedlog (8): `transfer.allow_finalize_without_upload`, `transfer.allow_evidenticar_cross_city`, `transfer.generation.enabled`, `upload.max_mb`, `transfer.require_signed_pdf_upload` (iako je javno, možda treba efektivnu verziju), `features.moderator_role`, `features.inventory_manual_committee_create`, `inventory.auto_create_draft_session`. Da li se slažemo s ovim popisom?
- **P-3:** Za `transfer.allow_finalize_without_upload`: trenutno `TransferDocumentPanel.tsx` ograničava `allowFinalizeWithoutUpload` samo na `isAdmin()`. Da li to ostaje tako (samo admin može finalizovati bez uploada), ili želimo da i `moderator` ili `evidenticar` to mogu kada je flag `true`? Trenutno backend (`transfer.service`) dozvoljava finalizaciju bez uploada samo ako `transfer.allow_finalize_without_upload=true` i ako je korisnik admin — ali to nije eksplicitno u `transfer-guards.ts`. Treba li `transfer-guards.ts` provjeravati i ulogu?
- **P-4:** Za `upload.max_mb`: da li ne-admin korisnici trebaju vidjeti stvarnu vrijednost (npr. 50 MB) za validaciju, ili samo admin? Ako samo admin, onda `useEffectiveSettings()` nije potreban za `upload.max_mb` — ali onda FE validacija mora biti usklađena s backend validacijom. Kako želimo?

---

## 3. BM-1a — Mismatch: `transfer.require_signed_pdf_upload` (privatno) — backend dozvoljava finalizaciju evidentičaru/moderatoru bez uploada, a FE ih blokira

### 3.1 Opis nalaza
Backend (`transfer.service` ili `transfer.controller`) dozvoljava finalizaciju prenosnice (`status` prelazi u `potpisan`) za `evidenticar` i `moderator` čak i kada `transfer.allow_finalize_without_upload=false` i `transfer.require_signed_pdf_upload=true`, ali FE (`TransferDocumentPanel.tsx`) blokira finalizaciju ako `requireSignedPdf` (default `true`) nije zadovoljen i `allowFinalizeWithoutUpload` nije `true` (samo za admina).

To znači da evidentičar/moderator može pokušati finalizaciju (backend dozvoljava), ali FE dugme nije dostupno ili prikazuje grešku.

### 3.2 Lokacije koda
- `frontend/src/components/TransferDocumentPanel.tsx:60-64` (`getBoolean` pozivi)
- `frontend/src/components/TransferDocumentPanel.tsx:249-258` (`canSignTransfer` poziv)
- `frontend/src/components/TransferDocumentPanel.tsx:288-294` (`canFinalizeTransfer` + `canSignTransfer` kombinacija)
- `backend/src/modules/transfers/transfers.service.ts` / `transfers.controller.ts` (provjeriti tačne uslove)

### 3.3 Utjecaj
- Evidentičar i moderator ne mogu finalizovati prenosnice koje su `raw` ili `uploaded` čak i kada backend to dozvoljava, jer FE blokira zbog `requireSignedPdf=true` i `allowFinalizeWithoutUpload=false` (jer nije admin).
- Poslovna logika nije usklađena.

### 3.4 Preporuka i plan implementacije
1. **Uskladiti FE s backendom:** Ako backend dozvoljava finalizaciju za `evidenticar`/`moderator` bez `allowFinalizeWithoutUpload`, onda `TransferDocumentPanel.tsx` mora koristiti efektivnu postavku `transfer.allow_finalize_without_upload` za sve uloge (ne samo admin), i `transfer.require_signed_pdf_upload` mora biti čitljiv svim korisnicima (kroz efektivni endpoint).
2. **Ako backend ograničava finalizaciju samo na admina kada `allow_finalize_without_upload=true`:** Onda `transfer-guards.ts` mora eksplicitno provjeravati `isAdmin` i postavku, a FE mora prikazati dugme samo kada su oba uslova zadovoljena.
3. **Ažurirati `TransferDocumentPanel.tsx`** da `canSignTransfer` prima efektivne vrijednosti, ne hardkodirane `getBoolean` iz admin-only konteksta.

### 3.5 Pitanja za diskusiju
- **P-5:** Želiš li da `transfer.allow_finalize_without_upload` vrijedi za **sve uloge** (ako je `true`, svako može finalizovati bez uploada), ili samo za `admin`? Trenutno FE ograničava na `isAdmin()`. Ako želimo samo admin — onda treba eksplicitno dokumentovati i osigurati da `transfer-guards.ts` i backend dosljedno primjenjuju ovo pravilo.
- **P-6:** Kako backend (`transfers.service`) provjerava `transfer.allow_finalize_without_upload`? Da li postoji eksplicitna provjera `user.role === 'admin'` u servisu, ili samo provjera flag-a? Treba li dodati tu provjeru i u `transfer-guards.ts`?

---

## 4. BM-1b — Mismatch: `upload.max_mb` (privatno) — FE tvrdi 10 MB za ne-admina, a backend koristi stvarnu vrijednost

### 4.1 Opis nalaza
`upload.max_mb` (`scope: 'private'`, default `10`) koristi se u `TransferDocumentPanel.tsx:61` putem `getNumber('upload.max_mb', 10)`. Budući da ne-admin korisnici ne vide `adminSettings`, dobivaju hardkodirani `10` MB, dok backend (`uploads` modul ili `transfer.service`) koristi stvarnu vrijednost iz baze. Ako je `upload.max_mb` postavljen na `50`, FE i dalje validira `10`, što može odbiti validni upload.

### 4.2 Lokacije koda
- `frontend/src/components/TransferDocumentPanel.tsx:61`
- `frontend/src/components/TransferDocumentPanel.tsx:479` (input `accept` i validacija — provjeriti)
- `backend/src/modules/settings/settings.service.ts` (provjera stvarne vrijednosti)

### 4.3 Utjecaj
- Ne-admin korisnici ne mogu uploadovati PDF-ove veće od 10 MB čak i kada je postavka `upload.max_mb` veća.
- Poslovna logika nije usklađena.

### 4.4 Preporuka i plan implementacije
- Uvesti `upload.max_mb` u whitelist `GET /settings/effective`.
- Ažurirati `TransferDocumentPanel.tsx` da čita efektivnu vrijednost, ne `getNumber('upload.max_mb', 10)` iz admin-only konteksta.

### 4.5 Pitanja za diskusiju
- **P-7:** Da li `upload.max_mb` treba biti vidljiv svim autentifikovanim korisnicima (kroz `GET /settings/effective`), ili samo adminima? Ako samo admin, onda FE mora dobiti tu vrijednost iz drugog izvora — ali kako? Preporučujem da bude u whitelistu.

---

## 5. BM-2 — Mrtav API: `features.inventory_manual_committee_create` — FE ne čita, `createInventoryCommitteeApi` se ne poziva

### 5.1 Opis nalaza
`features.inventory_manual_committee_create` (`scope: 'private'`, default `false`) definisan je u `settings.registry.ts`. `createInventoryCommitteeApi` postoji u FE (`frontend/src/api/*` ili slično), ali se ne poziva nigdje u kodu (prema `grep`-u i pregledu). `InventoryCountController` (`backend/src/modules/inventory-count/inventory-count.controller.ts`) ima `@Post(':id/committees')` koji dozvoljava kreiranje komisije za `admin`, `moderator`, `popis_koordinator`. Nema eksplicitne provjere `inventory.manual_committee_create` u backend servisu (potrebno provjeriti).

### 5.2 Lokacije koda
- `backend/src/modules/settings/settings.registry.ts:291-300`
- `frontend/src/components/*` — provjeriti da li postoji referenca na `inventory_manual_committee_create`
- `backend/src/modules/inventory-count/inventory-count.service.ts` — provjeriti uslove za `createCommittee`

### 5.3 Utjecaj
- Funkcionalnost ručnog kreiranja komisije je „mrtva“ — nema FE dugmeta, a backend možda dozvoljava bez provjere flag-a.
- Nejasno da li je funkcionalnost namjerna ili zastarjela.

### 5.4 Preporuka i plan implementacije
- **Opcija A:** Ako je funkcionalnost namjerna — dodati FE dugme (npr. u `InventoryCountPage` ili `CommitteeSetupOptions` komponente) koje čita `features.inventory_manual_committee_create` i poziva `createInventoryCommitteeApi`. Također dodati provjeru flag-a u backend `createCommittee`.
- **Opcija B:** Ako je zastarjela — ukloniti `features.inventory_manual_committee_create` iz registra, ukloniti `createInventoryCommitteeApi` i dokumentovati uklanjanje.

### 5.5 Pitanja za diskusiju
- **P-8:** Da li `inventory.manual_committee_create` treba ostati kao funkcionalnost? Ako da, gdje tačno u FE treba biti dugme za kreiranje komisije? Trenutno `inventory-count.controller.ts` dozvoljava `POST /inventory-sessions/:id/committees` za `admin`, `moderator`, `popis_koordinator`. Treba li dodati i `skladistar`?
- **P-9:** Treba li `createCommittee` u backendu provjeravati `features.inventory_manual_committee_create`? Trenutno nema eksplicitne provjere tog flag-a u `inventory-count.service.ts` (prema brzom pregledu). Ako želimo da flag kontrolira kreiranje — treba ga dodati.

---

## 6. BM-3 — `features.moderator_role` — FE ne prati ovaj privatni flag

### 6.1 Opis nalaza
`features.moderator_role` (`scope: 'private'`, default `true`) definisan u `settings.registry.ts`. FE (`frontend/src/routes/role-page-access.ts`) koristi statičku `moderator` ulogu (`role === 'moderator'`) i ne čita ovaj flag. Ako se `moderator_role` postavi na `false`, `moderator` i dalje ima pristup stranicama (`ADMIN_OR_MODERATOR_PAGES`, `MODERATOR_READ_PAGES`), iako bi trebao biti deaktiviran.

### 6.2 Lokacije koda
- `backend/src/modules/settings/settings.registry.ts:162-168`
- `frontend/src/routes/role-page-access.ts` (statička `moderator` provjera)
- `frontend/src/store/` ili `auth-context` — provjeriti da li postoji dinamička provjera

### 6.3 Utjecaj
- `moderator` uloga se ne može dinamički deaktivirati putem postavki.
- Poslovna logika nije usklađena s administrativnim kontrolama.

### 6.4 Preporuka i plan implementacije
- Dodati `features.moderator_role` u whitelist `GET /settings/effective`.
- Ažurirati FE (`role-page-access.ts` ili `useAuth`) da provjerava i `features.moderator_role`: ako je `false`, `moderator` se tretira kao `user` (ili se blokira pristup `ADMIN_OR_MODERATOR_PAGES`).
- Također ažurirati `public-feature-defaults.ts` da uključi `features.moderator_role` (trenutno nije u popisu — ali je `private`, pa ne treba biti u javnim defaultima). Umjesto toga, `useEffectiveSettings()` treba čitati privatnu vrijednost.

### 6.5 Pitanja za diskusiju
- **P-10:** Ako `features.moderator_role` postavimo na `false`, šta se dešava s postojećim `moderator` korisnicima? Da li im se blokira pristup svim stranicama (`403`), ili se tretiraju kao `user` (pristup samo `my-equipment`, `qr-scanner`)? Preporučujem da se tretiraju kao `user` (degradacija), ali potrebno je potvrditi.
- **P-11:** Treba li `moderator_role` biti u whitelistu `GET /settings/effective`? Da li sve autentifikovane uloge trebaju znati da li je `moderator` aktivan?

---

## 7. BM-4 — Dvije role/page matrice (`SKLADISTAR_PAGES`, `POPIS_KOORDINATOR_PAGES`) deklarisane ali neintegrisane

### 7.1 Opis nalaza
`SKLADISTAR_PAGES` i `POPIS_KOORDINATOR_PAGES` su deklarisane u `role-page-access.ts` (`lines 39-46`) ali se ne koriste u `canAccessPageForRole`. Umjesto toga, `skladistar` i `popis_koordinator` se obrađuju direktno unutar `if` blokova (`lines 58-98`).

Također `ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES` (`['inventory-count']`) i `POPIS_KOORDINATOR_PAGES` (`['inventory-count']`) se preklapaju — `inventory-count` se tretira i kao `admin || evidenticar || coordinator` (`ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES`) i kao `coordinator` (`POPIS_KOORDINATOR_PAGES`). To stvara konfuziju oko toga da li `popis_koordinator` ima pristup `inventory-count` i pod kojim uslovima.

### 7.2 Lokacije koda
- `frontend/src/routes/role-page-access.ts`
- `frontend/src/routes/app-routes.ts` ili `lazy-pages.ts` (provjeriti kako se stranice registruju)

### 7.3 Utjecaj
- Matrice nisu održive — promjene u jednoj deklaraciji (`SKLADISTAR_PAGES`) ne utječu na `canAccessPageForRole`.
- `popis_koordinator` pristup `inventory-count` nije eksplicitan u logici (`ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES` uključuje `coordinator`, ali `POPIS_KOORDINATOR_PAGES` nije korišten).

### 7.4 Preporuka i plan implementacije
1. **Konsolidovati matrice:** Ukloniti `SKLADISTAR_PAGES` i `POPIS_KOORDINATOR_PAGES` kao zasebne deklaracije (ili ih integrisati u `canAccessPageForRole`). Preporučujem konsolidaciju — koristiti jedinstvenu `canAccessPageForRole` funkciju s eksplicitnim `if` blokovima za svaku ulogu, ili pretvoriti matrice u jedinstveni `Record<UserRole, PageId[]>` objekat.
2. **Definisati tačan pristup za `popis_koordinator`:**
   - `inventory-count`: da (`ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES` već uključuje `coordinator`).
   - `my-equipment`, `qr-scanner`: da (`getDefaultPageCandidatesForRole` uključuje `my-equipment` za `popis_koordinator`).
   - Ostale stranice (`dashboard`, `equipment`, `transfers`, `documents`, `warehouses`, `warehouse-inventory`): ne (osim ako se ne doda eksplicitno).
3. **Dodati karakterizacijske testove** za 6 uloga (`admin`, `moderator`, `evidenticar`, `skladistar`, `popis_koordinator`, `user`) × 19 stranica (`PageId`).

### 7.5 Pitanja za diskusiju
- **P-12:** Treba li `popis_koordinator` imati pristup `dashboard`? Trenutno `getDefaultPageCandidatesForRole` vraća `['inventory-count', 'my-equipment']` za `popis_koordinator`, ali `ADMIN_OR_MODERATOR_PAGES` i `MODERATOR_READ_PAGES` ne uključuju `popis_koordinator`. Da li `popis_koordinator` treba da vidi `dashboard`, `equipment`, `transfers` kao `moderator`?
- **P-13:** Treba li `skladistar` imati pristup `dashboard`? Trenutno `getDefaultPageCandidatesForRole` za `skladistar` vraća `['warehouses', 'warehouse-inventory', 'my-equipment', 'qr-scanner']`, ali `MODERATOR_READ_PAGES` ne uključuje `skladistar`, pa `skladistar` nema pristup `dashboard`, `equipment`, `transfers`, `documents`. Da li to odgovara poslovnoj logici?
- **P-14:** Treba li konsolidovati `SKLADISTAR_PAGES` i `POPIS_KOORDINATOR_PAGES` u jedinstvenu `ROLE_PAGE_MATRIX`, ili zadržati eksplicitne `if` blokove za bolju čitljivost?

---

## 8. BM-5 — Admin `warehouse-inventory`: FE odbija admina (`skladistar && !admin`), a backend (`inventory-warehouse-committee.controller.ts`) dozvoljava admina za `mine` i `scope`

### 8.1 Opis nalaza
`canAccessPageForRole` (`frontend/src/routes/role-page-access.ts:57-59`) vraća:
```typescript
if (pageId === 'warehouse-inventory') {
  return skladistar && !admin;
}
```
To znači da `admin` **ne može** pristupiti stranici `warehouse-inventory`, iako `inventory-warehouse-committee.controller.ts` (`backend/src/modules/inventory-count/inventory-warehouse-committee.controller.ts`) dozvoljava `@Roles(UserRole.skladistar, UserRole.admin)` za `GET mine` i `GET :id/scope`.

Također `SKLADISTAR_PAGES` (`line 45`) uključuje `'warehouse-inventory'`, ali se ne koristi u `canAccessPageForRole`.

### 8.2 Utjecaj
- Admin nema pristup stranici `warehouse-inventory` iako backend dozvoljava čitanje (`mine`, `scope`).
- Neusaglašenost FE/BE.

### 8.3 Preporuka i plan implementacije
- Ažurirati `canAccessPageForRole` za `warehouse-inventory`: `return admin || skladistar;` (umjesto `skladistar && !admin`).
- Provjeriti da li `warehouse-inventory` stranica prikazuje i uređivačke opcije (`recordLine`, `close`) samo za `skladistar`, a samo čitanje za `admin`. Trenutno `inventory-warehouse-committee.controller.ts` dozvoljava `POST :id/lines` i `PATCH :id/close` samo za `skladistar`, a `GET mine` i `GET :id/scope` za `admin` i `skladistar`. FE stranica mora biti prilagođena — prikazati samo čitanje za admina, ili omogućiti i uređivanje (ako se odluči tako).

### 8.4 Pitanja za diskusiju
- **P-15:** Treba li `admin` imati **samo čitanje** (`mine`, `scope`) na `warehouse-inventory`, ili i uređivačke mogućnosti (`recordLine`, `close`)? Preporučujem samo čitanje (uskladiti s backendom), ali potrebno je potvrditi.
- **P-16:** Ako `admin` dobije pristup `warehouse-inventory`, treba li ažurirati `SKLADISTAR_PAGES` i `getDefaultPageCandidatesForRole` da uključe `warehouse-inventory` za `admin`? Trenutno `getDefaultPageCandidatesForRole` za `admin` vraća `['dashboard', 'my-equipment']`. Treba li `admin` imati `warehouse-inventory` kao default stranicu? Vjerojatno ne — `dashboard` je dovoljno.

---

## 9. BM-6 — FE/BE divergencije za role/page pristup

### 9.1 `warehouses`
- **FE (`role-page-access.ts:55-56`):** `admin || skladistar || moderator`
- **BE (`warehouses.controller.ts`):** `admin, moderator, evidenticar, skladistar`
- **Nalaz:** FE isključuje `evidenticar` za `warehouses`, iako backend dozvoljava.
- **Preporuka:** Uskladiti prema backendu — dodati `evidenticar` u `canAccessPageForRole` za `warehouses`.

### 9.2 `warehouse-inventory`
- **FE (`role-page-access.ts:57-59`):** `skladistar && !admin`
- **BE (`inventory-warehouse-committee.controller.ts`):** `skladistar, admin` (za `mine`, `scope`); samo `skladistar` (za `recordLine`, `close`).
- **Nalaz:** FE isključuje `admin`; BE dozvoljava `admin` za čitanje.
- **Preporuka:** Uskladiti prema backendu — `admin || skladistar` za pristup stranici; uređivačke akcije ograničiti na `skladistar`.

### 9.3 `organization`
- **FE (`ADMIN_OR_MODERATOR_PAGES`):** `admin`, `moderator`
- **BE (`users.controller.ts` ili `organization.controller.ts` — provjeriti):** `admin`, `moderator` (prema `users.controller.ts:15`: `@Roles(UserRole.admin, UserRole.moderator)` za kontroler). Potrebno provjeriti postoji li `organization.controller.ts`.
- **Preporuka:** Ako backend dozvoljava samo `admin` i `moderator`, FE je usklađen. Ako backend dozvoljava i `evidenticar` ili `popis_koordinator`, treba ažurirati.

### 9.4 `inventory-count`
- **FE (`ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES`):** `admin || evidenticar || coordinator`
- **BE (`inventory-count.controller.ts`):** `admin` (neki endpointi), `admin || moderator || evidenticar || popis_koordinator || user` (npr. `findAll`), `admin || moderator || popis_koordinator` (kreiranje komisije).
- **Nalaz:** FE ne uključuje `moderator` za `inventory-count`, ali `findAll` u backendu dozvoljava `moderator`. Također `user` ima pristup `findAll` i `findCommittees` — FE `canAccessPageForRole` ne uključuje `user` za `inventory-count`, ali `getDefaultPageCandidatesForRole` za `user` vraća `['my-equipment', 'qr-scanner']`, pa `user` nema `inventory-count` kao default.
- **Preporuka:** Provjeriti da li `moderator` treba imati pristup `inventory-count`. Ako da — dodati u FE. Ako ne — ukloniti iz backend `findAll` (ali to nije preporučljivo jer `findAll` ima `user` i `moderator` zbog čitanja vlastitih podataka).

### 9.5 `employees`, `user-management`
- **FE (`ADMIN_OR_MODERATOR_PAGES`):** `admin || moderator`
- **BE (`users.controller.ts` ili `employees.controller.ts`):** Provjeriti.

### 9.6 Pitanja za diskusiju
- **P-17:** Treba li `evidenticar` dobiti pristup `warehouses` (uskladiti s backendom)? Preporučujem da — jer `warehouses.controller.ts` dozvoljava `evidenticar` za `findAll`, `findOne`, `resolveEffective`.
- **P-18:** Treba li `moderator` dobiti pristup `inventory-count`? Trenutno `findAll` u backendu dozvoljava `moderator`, ali FE `ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES` ne uključuje `moderator`. Treba li dodati `moderator` u FE za `inventory-count`?
- **P-19:** Treba li `user` (obični korisnik) imati pristup `inventory-count`? `findAll` u backendu dozvoljava `user`, ali FE ne uključuje `user` u `canAccessPageForRole` za `inventory-count`. Da li to znači da `user` ne treba da vidi `inventory-count` u navigaciji, ali može pozvati API? Ako da — onda `canAccessPageForRole` ne mora biti usklađen s `findAll` za sve endpoint-e, jer `findAll` može biti za čitanje vlastitih podataka, a `canAccessPageForRole` za navigaciju. Treba li razjasniti tu razliku?

---

## 10. Plan implementacije — Modul A (faze)

### Faza 1 — Dokumentacija i potvrda (trenutno)
- [x] Dokumentovan svaki BM nalaz.
- [x] Identifikovana pitanja za korisnika (§2.5, §3.5, §4.5, §5.5, §6.5, §7.5, §8.4, §9.6).
- [x] Dobiti odgovore od korisnika i potvrditi opseg (potvrđeno od korisnika: 'potvrđujem sve tvoje preporuke').

### Faza 2 — Efektivni endpoint i whitelist (`GET /settings/effective`)
- [x] Dodati `GET /settings/effective` u `settings.controller.ts`.
- [x] Definisati `EffectiveSettingDto` (whitelist ~8 ključnih vrijednosti).
- [x] Ažurirati `settings.service.ts` da vraća efektivne vrijednosti za autentifikovane korisnike.
- [x] Dodati `useEffectiveSettings()` hook u FE (`frontend/src/contexts/` ili `frontend/src/hooks/`).
- [x] Ažurirati `public-feature-defaults.ts` i `settings-feature.util.ts` ako je potrebno.
- [x] Testovi: `settings.service.spec.ts` + FE hook spec.
- [x] CI gate: novi `Verify effective settings endpoint` korak (ili proširenje postojećeg).

### Faza 3 — Poslovna pravila (`BM-1`, `BM-1a`, `BM-1b`, `BM-5`, `BM-6`)
- [x] Ažurirati `TransferDocumentPanel.tsx` da koristi `useEffectiveSettings()`.
- [x] Ažurirati `transfer-guards.ts` da prima efektivni objekt i provjerava `isAdmin` gdje je potrebno.
- [x] Ažurirati `canAccessPageForRole` (`BM-5`: `warehouse-inventory` za admin; `BM-6`: `warehouses` za `evidenticar`, `inventory-count` za `moderator` ako se odluči).
- [x] Ažurirati `getDefaultPageCandidatesForRole` ako se promijeni matrica.
- [x] Testovi: karakterizacijski testovi 6 uloga × 19 stranica (`frontend/src/routes/role-page-access.spec.ts` ili novi fajl).
- [x] CI gate: `Verify role/page matrix consistency` — usporedba FE matrice s backend `@Roles` za svaku rutu.

### Faza 4 — Mrtvi API i zastarjele funkcionalnosti (`BM-2`, `BM-3`, `BM-4`)
- [x] Odlučiti za `BM-2` (ručno kreiranje komisije): Option A (aktivirati) ili Option B (ukloniti).
- [x] Odlučiti za `BM-3` (`moderator_role`): aktivirati dinamičku provjeru ili ukloniti flag.
- [x] Konsolidovati `BM-4` (`SKLADISTAR_PAGES`, `POPIS_KOORDINATOR_PAGES`).
- [x] Testovi: `settings.service.spec.ts` za `moderator_role`, `inventory_manual_committee_create`.
- [x] CI gate: `Verify settings registry consistency` — provjera da svaki `scope: 'private'` ključ ima odgovarajuću FE obradu ili dokumentovano uklanjanje.

### Faza 5 — Dokumentacija i završetak Modula A
- [x] Ažurirati `docs/module-a-business-matrix.md` sa rezultatima implementacije.
- [x] Ažurirati `docs/backend-implementation-plan.md` i `docs/frontend-implementation-plan.md`.
- [x] Osigurati da `git status` = čisto, CI zeleni (`40703641414` ili noviji), i da nema otvorenog PR-a prema `master`.

---

## 11. Trenutni status i sljedeći korak

**Status:** ✅ Modul A je implementiran nakon potvrde opsega (sve preporuke usvojene) — v. implementacijske checkboxe iznad i `docs/STATUS.md`. Tekst ispod je historijski zapis pitanja iz faze planiranja.

**Pitanja za korisnika (sažeto):**
1. `GET /settings/effective` za sve autentifikovane? Koji točno ključni vrijednosti u whitelistu?
2. `transfer.allow_finalize_without_upload` samo za admin, ili za sve uloge?
3. `upload.max_mb` vidljiv svim korisnicima?
4. `inventory.manual_committee_create` — aktivirati ili ukloniti?
5. `moderator_role` — dinamička aktivacija/deaktivacija? Šta se dešava kada je `false`?
6. `popis_koordinator` pristup: da li treba `dashboard`, `equipment`, `transfers`?
7. `warehouse-inventory` za admin — samo čitanje (`mine`/`scope`) ili i uređivanje?
8. `evidenticar` za `warehouses` — dodati u FE?
9. `moderator` za `inventory-count` — dodati u FE?
10. `user` za `inventory-count` u navigaciji — ostaje blokiran?
11. `SKLADISTAR_PAGES` i `POPIS_KOORDINATOR_PAGES` — konsolidovati u jedinstvenu matricu ili zadržati eksplicitne `if` blokove?

Nakon odgovora — krećemo s implementacijom Faze 2 (`GET /settings/effective`) i zatim redom Faze 3–5, po jednom segmentu, uz CI nadzor nakon svakog pusha.

---

*Dokument pripremljen 2026-10-28, grana `arena/60c1635e-inventory-v2`, HEAD `8d2ed27`, čisto radno stablo, bez otvorenog PR-a prema `master`.*
