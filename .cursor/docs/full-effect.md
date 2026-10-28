# Full effect — organizacija + lokacije + potpisnici + skladišta + popis + rashod (requirements)

> **Status (2026-10-28): ✅ IMPLEMENTIRANO 49/50** po
> [`.cursor/plans/full-effect/CHECKLIST.md`](../plans/full-effect/CHECKLIST.md)
> (faze 13–18c + skladišni lot). Ovaj fajl je **izvorna specifikacija** — sekcije
> „Trenutno stanje“ i `[ ]` checkboxi u §11 opisuju stanje *prije* implementacije
> i namjerno se ne prepisuju. Jedina otvorena stavka: server-PDF zapisnika
> (v. `docs/BACKLOG.md`). Registar: `docs/STATUS.md`.

Dokument definiše šta još treba implementirati da bi sistem u potpunosti podržao ciljano ponašanje:

- krovna organizacija (direkcija) + segmenti (Distribucija / Snabdjevanje)
- regionalne distribucije (npr. ED Sarajevo) + podružnice
- proizvoljan override lokacije i potpisnika na bilo kojem čvoru
- konzistentno **nasljeđivanje** (radnici i dokumenti “vide” efektivnu lokaciju i efektivnog potpisnika)
- skladišta (centralno + org-jedinice), prijem robe, rashod i uništenje kroz skladište
- **godišnji popis** po distribuciji (sesija, komisije, zamrzavanje stanja, pending akcije, zapisnik)
- **rashod** isključivo kroz popis + komisija rashoda + skladištarsko uništenje

> Evidentičar (§5), transferi (§6), skladišta (§7) i popis/rashod (§11) su međusobno povezani — implementacija treba ići usklađeno.

---

## Trenutno stanje (sažeto)

- **Hijerarhija**: `OrgUnit` stablo preko `parentId` (ciklus zabranjen).
- **Lokacija**: `OrgUnit.locationCityId` + denormalizovani `OrgUnit.effectiveLocationCityId` (nasljeđivanje radi i na backendu).
- **Potpisnik**: `OrgUnit.signerId` postoji, ali nema “effective signer” na backendu (nasljeđivanje je trenutno praktično samo UI-konvencija).
- **Geografija**: samo `City` (nema općine/mjesta).
- **Skladišta**: `Warehouse` + `WarehouseKeeper` postoje; `Equipment.warehouseId` kada je `status=skladiste`; postoji `WarehouseCondition.unisteno`, ali nema finalnog workflow-a “uništenje” i access pravila nisu u potpunosti usklađena s matricom.
- **Popis**: `InventorySession` + komisije + pending + close job postoje; freeze nije potpun; rashod kroz popis (`disposal` apply) nije implementiran; potpis prenosnice tokom sesije mijenja opremu prije zatvaranja (vidi §11).

---

## Ciljani efekat (konkretna pravila)

### Lokacija (nasljeđivanje + override)

- Svaki `OrgUnit` može imati eksplicitnu lokaciju (grad / općina / mjesto) ili naslijediti od pretka.
- Radnik nasljeđuje efektivnu lokaciju od `Employee.orgUnitId`.
- Promjena lokacije na čvoru mora automatski osvježiti efektivnu lokaciju potomaka.

### Potpisnik (nasljeđivanje + override)

- Svaki `OrgUnit` može imati eksplicitnog potpisnika (`Employee`) ili naslijediti od pretka.
- Radnik nasljeđuje **efektivnog potpisnika** svog čvora (ili najbližeg pretka).
- Svi procesi koji generišu dokumente/transfer-e moraju koristiti efektivnog potpisnika (osim ako je eksplicitno override-ano u tom procesu).

### Hijerarhijska pravila tipova

- Definisati i enforce-ati dozvoljene parent→child veze po `OrgUnitType`.
- Primjer (prilagoditi poslovnim pravilima):
  - `direkcija` → (`podrucje`, `distribucija`, `sektor`)
  - `podrucje` → (`sektor`, `sluzba`, `odjeljenje`, `distribucija`)
  - `distribucija` → (`sektor`, `sluzba`, `odjeljenje`, `podruznica`)
  - `podruznica` → (`sluzba`, `odjeljenje`)
  - `sektor` → (`sluzba`, `odjeljenje`)
  - `sluzba` → (`odjeljenje`)

> Napomena: ako želite razlikovati “segment Distribucija” od “ED Sarajevo” treba ili (a) novi tipovi, ili (b) dodatno polje (npr. `OrgUnitKind`) ili (c) striktna pravila po parent tipu + naming konvencije.

### Skladišta (centralno + org-jedinice) + uništenje

- Skladište je fizički entitet vezan za lokaciju (minimalno grad).
- Skladište može biti:
  - **centralno** (na nivou preduzeća / direkcije)
  - **org-jedinice** (npr. ED Zenica) i “pokriva” opremu u toj org-jedinici i njenom podstablu (ako se odluči enforce-ati).
- Prijem robe u skladište:
  - obavezan `categoryId` (leaf)
  - oprema dobija “lokaciju” skladišta (rezolucija preko `warehouse.cityId`)
  - `status=skladiste` + `warehouseId` obavezno
- Uništenje rashodovane opreme:
  - uništenje se finalizira **samo kroz skladište**
  - komisija odobrava “ide na uništenje”/“uništeno” (ili se komisija koristi za rashod, a skladište finalizira uništenje)
  - uništenu opremu može vidjeti samo skladištar tog skladišta (ili admin).

---

## Potrebne promjene (da bude “potpuni efekat”)

## 1) Backend — efektivni potpisnik (source-of-truth)

### 1.1. Model / DB

- Dodati `OrgUnit.effectiveSignerId` (nullable) kao denormalizovano polje.
- Strategija: kao `effectiveLocationCityId` — izračunati “najbliži signerId prema gore”.
- Indeks: `@@index([effectiveSignerId])` (ako se često filtrira/traži).

### 1.2. Resolution servis (analogno lokaciji)

- Implementirati `SignerResolutionService` (ili proširiti postojeći service) koji:
  - gradi mapu efektivnih potpisnika za sve čvorove
  - osvježava potomke kad se promijeni `signerId` ili `parentId`
  - nudi metode:
    - `refreshOrgUnitEffectiveSigners(orgUnitId?: string)`
    - `getEffectiveSignerForOrgUnit(orgUnitId: string): string | null`
    - `getEffectiveSignerForEmployee(employeeId: string): string | null`

### 1.3. Enforce kroz domenu (transferi / dokumenti)

- U servisima gdje se “bira potpisnik”:
  - default = `getEffectiveSignerForEmployee(...)` ili `getEffectiveSignerForOrgUnit(...)`
  - omogućiti eksplicitni override gdje treba, ali uz validaciju da je potpisnik stvarni `Employee`.
- Ako potpisnik ne postoji u stablu: jasna greška (npr. “No signer configured in org hierarchy”).

---

## 2) Backend — lokacija na kreiranju org jedinice

- `POST /org-units` treba podržati `locationCityId` (i eventualno odmah osvježiti efektivnu lokaciju).
- Nakon create/update:
  - refresh effective location
  - refresh effective signer (kad se implementira)

---

## 3) Geografija “općina / mjesto” (ako je stvarni zahtjev)

Ako podružnice moraju biti na nivou općine/mjesta (ne samo grada):

- Uvesti novi nivo lokacije:
  - opcija A: `Municipality` vezan za `Canton` i/ili `City`
  - opcija B: `Place` (naselje) vezan za `Municipality`
- U `OrgUnit` zamijeniti/ proširiti lokaciju:
  - umjesto samo `locationCityId`, uvesti generički “location target”:
    - `locationType` (`city|municipality|place`) + `locationId`
    - i denormalizovani `effectiveLocationType` + `effectiveLocationId`
- U svim scope/filter logikama jasno definisati šta znači “grad”: da li scope ostaje po gradu ili se širi.

> Ako općina/mjesto nije obavezna odmah, može se ostati na `City` i “podružnicu” razlikovati imenom.

---

## 4) Hijerarhijska pravila (matrica + validacija)

- Ažurirati matricu: `.cursor/docs/matrices/org-hierarchy/MATRIX.md`
  - dodati tabelu parent→child dozvola
  - dodati edge-caseove (move subtree, promjena tipa čvora, brisanje)
- Implementirati validaciju u backendu:
  - pri `create` i `update` (promjena `parentId` i promjena `type`)
  - obavezno: spriječiti nedozvoljene kombinacije tipova

---

## 5) Evidentičar — puni model opsega + pravila

### 5.1. Cilj

Administrator definiše evidentičara (kroz `User`), a zatim mu dodjeljuje **opseg evidencije** koji određuje:

- koju opremu vidi (i kojim radnicima može raditi prenose)
- iz kojeg skladišta može vršiti zaduženje (ako je dozvoljeno)
- koja kategorija/podkategorije su u opsegu
- da li je opseg “globalan za skladište” ili sužen na org-jedinicu/podstablo

### 5.2. Trenutno (gap)

Trenutno scope evidentičara je samo `UserRegistrarScope = (cityId + categoryId)`.

To ne omogućava:

- vezanje evidentičara za **konkretno skladište** (`warehouseId`)
- sužavanje scope-a na **org-jedinicu/podstablo** (sektor/služba/odjeljenje)
- pravilo “samo evidentičar bez org suženja vidi skladište i može zadužiti sa skladišta”

### 5.3. Predloženi model dodjele (“assignment”)

Uvesti entitet dodjele za evidentičara (npr. `RegistrarAssignment`) sa poljima:

- `userId` (evidentičar)
- `warehouseId` (obavezno) — skladište za zaduženje/razduženje/rashod (po vašem pravilu)
- `categoryId` (obavezno) — root kategorija; scope uključuje sve podkategorije
- `orgUnitId` (opciono) — ako je setovan, opseg se sužava na podstablo te org jedinice

> Napomena: `cityId` postaje izveden iz `warehouse.cityId` ili iz opreme (holder/warehouse), a ne primarni input za dodjelu. Ako i dalje trebate multi-grad bez skladišta, to je drugi tip dodjele.

### 5.4. Dva režima (ključna pravila)

**Režim A — “warehouse + category” (bez org suženja)**

- `orgUnitId = null`
- vidi opremu u:
  - skladištu `warehouseId` (status `skladiste`) za tu kategoriju
  - zaduženu opremu u “coverage” org-jedinice skladišta (ako se enforce-a `Warehouse.orgUnitId`) ili u definisanom pravilu
- može napraviti `zaduzenje` (skladište → osoba) samo iz tog skladišta

**Režim B — “warehouse + category + org subtree” (suženje na sektor/službu/odjeljenje)**

- `orgUnitId != null` (podstablo)
- vidi samo opremu koja je “u podstablu” (zadužena radnicima podstabla + eventualno na skladištu ako je eksplicitno dozvoljeno)
- može raditi:
  - `prenos` (osoba → osoba) unutar scope-a
  - `razduzenje` (osoba → skladište) u dodijeljeno skladište
  - `rashodovanje` prema pravilima komisije + scope-a
- **ne vidi** skladišnu opremu (status `skladiste`) i **ne može** `zaduzenje` sa skladišta

### 5.5. Pravila pristupa (backend source-of-truth)

Dodati provjere u `RegistrarScopeService` (ili novu `EvidenticarScopeService`) da odlučuje:

- `canAccessEquipment(user, equipment)`:
  - kategorija (expanded) mora match
  - `warehouseId`/`orgUnitId` mora match prema režimu:
    - `equipment.status=skladiste`: dozvoljeno samo u režimu A i samo ako `equipment.warehouseId === assignment.warehouseId`
    - `equipment.status=zaduzeno`: holder mora biti u scope org podstabla (režim B) ili u coverage skladišta (režim A, ako se definiše)
    - `equipment.status=rashodovano`: vidljivost po posebnom rashod/uništenje pravilu (vidi skladišta dio)
- `canAccessEmployee(user, employee)`:
  - employee mora biti u org podstablu (`orgUnitId`) kad je režim B
  - kad je režim A: po coverage pravilu skladišta (npr. `warehouse.orgUnitId` subtree) ili “globalno skladište”

### 5.6. Pravila transfera (zaduženje/razduženje/rashod)

Transferi moraju imati dodatne provjere:

- `zaduzenje`: samo režim A + `fromType=skladiste` + `equipment.warehouseId === assignment.warehouseId`
- `razduzenje`: režim A ili B, ali `toType=skladiste` mora ciljati **assignment.warehouseId** (ili jasno definisana mapa allowed skladišta)
- `rashodovanje`: režim A ili B, uz komisiju (postojeće), ali finalizacija “uništeno” mora ići kroz skladište (vidi sekciju skladišta)

### 5.7. Admin UI / konfiguracija evidentičara

U “User management” treba zamijeniti/ proširiti konfiguraciju evidentičara:

- umjesto “grad + kategorija”:
  - `warehouseId` picker
  - `categoryId` picker (root)
  - opcionalno `orgUnitId` picker (sektor/služba/odjeljenje)
  - prikaz režima A/B kao objašnjenje (ili automatski iz `orgUnitId`)

### 5.8. Matrice koje treba ažurirati

- `roles-access` — definisati evidentičar opseg kroz `warehouseId + categoryId + orgUnitId?`
- `transfers` — dodati pravilo za `zaduzenje` (samo režim A) i `razduzenje` (A/B)
- `warehouses` — pojasniti “coverage” skladišta (centralno vs org-jedinice)
- `equipment-status` — precizirati read/write za evidentičara po režimu i statusima

---

## 6) Transferi / Zaduženja — “RAW → potpis → upload → finalize” (source-of-truth)

### 6.1. Cilj (šta mora vrijediti)

Transfer (zaduženje/prenos/razduženje/rashod) je **dokumentovani workflow** gdje:

- transfer se kreira kao **RAW/draft** i odmah je dostupan za print/download
- fizički dokument se potpisuje od relevantnih strana
- potpisani sken/PDF se uploaduje i postaje dio istorije opreme
- tek nakon uspješnog uploada (i eventualnih odobrenja) transfer se finalizira kao “potpisan”
- **tek tada** se equipment state zvanično mijenja (holder/status/warehouse)

### 6.2. Trenutno stanje (gap)

Trenutno backend na `sign()` radi:

- `transfer.status = potpisan` + dodjela finalnog broja
- i **odmah** update opreme (u istoj transakciji)

Upload dokumenta (`/uploads`) samo postavlja `scannedDocUrl`, bez uticaja na status/finalizaciju.

To znači da “oprema prelazi na novog korisnika tek nakon uploada” trenutno **nije ispoštovano**.

### 6.3. Model / DB promjene (da workflow bude moguć i auditabilan)

#### 6.3.1. Identitet skladišta u transferu

Da bi transferi “skladište ↔ osoba” bili precizni i enforce-abilni, uvesti:

- `fromWarehouseId` (nullable) — obavezno kada `fromType=skladiste`
- `toWarehouseId` (nullable) — obavezno kada `toType=skladiste`

Bez ovoga, “zaduženje sa skladišta ED Zenica” se ne može vezati na konkretno skladište i ne može se pravilno primijeniti evidentičar/keeper scope.

#### 6.3.2. Ko je operativni akter (evidentičar) vs. ko je formalni potpisnik

Uvesti eksplicitno:

- `createdByUserId` (ili `createdByEmployeeId`) — ko je pokrenuo transfer (tipično evidentičar)
- opcionalno `finalizedByUserId` — ko je finalizirao nakon uploada

Ovo je potrebno da dokument zna razliku:

- “predao” (operativni akter / evidentičar ili osoba)
- “ovjerio” (formalni potpisnik iz hijerarhije)
- “preuzeo” (osoba)

#### 6.3.3. Stanja transfera (state machine)

Proširiti `TransferStatus` iz `raw|potpisan` na jasnu mašinu stanja. Minimalno:

- `raw` — draft kreiran, oprema se ne mijenja
- `uploaded` (ili `signed_pending_finalize`) — potpisani dokument uploadovan, čeka finalizaciju
- `potpisan` (final) — finalan broj + equipment update odrađen

Opcionalno (ako želite strožiji audit):

- `printed` — evidentičar eksplicitno označio da je odštampano (UX)
- `cancelled` — poništen draft prije finalizacije

> Pravilo: equipment state se smije mijenjati **samo** pri prelazu u finalno stanje.

#### 6.3.4. Dokumenti uz transfer

Definisati “dva artefakta”:

- **RAW** dokument (generisan iz transfera i trenutnih podataka) — uvijek dostupan
- **potpisani sken/PDF** — uploadovani fajl (source-of-truth za potpis)

Opcije implementacije RAW-a:

- A) server-side generisan PDF (preporučeno za konzistentnost)
- B) client-side print template (kao danas) + “download RAW” generacija na klijentu (manje pouzdano)

Potpisani dokument mora biti vezan na transfer kao upload record (već postoji `Upload` + `scannedDocUrl`).

### 6.4. API promjene (najmanje što treba)

#### 6.4.1. Kreiranje transfera

- `POST /transfers` kreira `raw` i ne mijenja opremu (kao danas)
- `signerId` se ne unosi ručno već se **rezolvuje** (vidi 6.5), osim ako admin eksplicitno override-a
- za `zaduzenje` i `razduzenje` obavezno upisati `fromWarehouseId/toWarehouseId`

#### 6.4.2. Upload potpisanog dokumenta

- `/uploads` treba:
  - validirati da korisnik ima pravo da uploaduje za taj transfer
  - nakon uspješnog uploada, transfer prelazi u `uploaded` (ili sličan status)

#### 6.4.3. Finalizacija (potpis)

Uvesti eksplicitnu finalizaciju transfera (naziv kako želite):

- `POST/PATCH /transfers/:id/finalize` ili proširiti postojeći `sign` ali sa pravilom:
  - nema finalizacije bez uploada (osim admin override)
  - finalizacija:
    - dodjeljuje finalni `documentNumber`
    - setuje finalni status
    - radi equipment update u transakciji

> Ovim se postiže tačno pravilo: “tek nakon uploadovanog PDF-a oprema zvanično prelazi”.

### 6.5. Potpisnik iz hijerarhije (organizacija kao source-of-truth)

Potpisnik za transfer mora doći iz organizacijske hijerarhije:

- implementirati backend “effective signer” (već definisano ranije)
- pravilo rezolucije:
  - `zaduzenje (skladište→osoba)` → potpisnik se određuje po **org jedinici radnika koji preuzima** (toPerson)
  - `prenos (osoba→osoba)` → potpisnik se određuje po org jedinici osobe koja preuzima (ili po “cilju” transfera; definisati)
  - `razduzenje (osoba→skladište)` → potpisnik se određuje po org jedinici osobe koja predaje (fromPerson)

> Ovo treba dokumentovati u matrici `transfers` kao strogo pravilo.

### 6.6. Access pravila za evidentičara (A/B režim)

Transferi moraju enforce-ati evidentičar assignment model:

- `zaduzenje`:
  - dozvoljeno samo u režimu A
  - `fromWarehouseId` mora biti u dodijeljenim skladištima evidentičara
  - oprema mora biti `status=skladiste` i pripadati tom `fromWarehouseId`
  - `toPersonId` mora biti u coverage opsegu (A) ili definisano pravilom
- `razduzenje`:
  - režim A ili B
  - `toWarehouseId` mora biti assignment skladište
  - osoba koja predaje mora biti u org podstablu (B) ili coverage (A)
- `prenos`:
  - režim A ili B (uz postojeća ograničenja cross-service)
  - oba radnika moraju biti u opsegu (org subtree ili coverage)
- `rashodovanje`:
  - režim A ili B, ali uz dodatna pravila iz 6.7

### 6.7. Rashod “isključivo kroz popis” + komisija

Detaljan poslovni model i gap lista: **§11 (Popis i rashod)**.

Ukratko, transferi rashoda moraju biti usklađeni s popisom:

- `rashodovanje` transferi **nisu dozvoljeni** mimo aktivnog popisa u istom gradu distribucije (osim admin override)
- rashod se modelira kao **pending akcija** u popisu; transfer se kreira/generiše u close job-u ili tek nakon odobrenja komisije rashoda
- potpis/upload prenosnice **ne smije** mijenjati opremu dok je sesija `active` — vidi §11.2 i §6.3.3
- finalizacija rashoda tek kad komisija rashoda odobri (§11.6), zatim skladištar uništi (§7.3)

### 6.8. UI promjene (da prati workflow)

- `DocumentsPage` i `TransfersPage` moraju odvojiti:
  - **Upload potpisanog dokumenta**
  - **Finalizaciju** (potpis / finalize) koja mijenja opremu
- “RAW prenosnica”:
  - jasno dugme “Print/Download RAW”
  - badge/koraci: RAW → (upload) → Finalizovano
- U potpisima dokumenta definisati standardne role:
  - predao: evidentičar ili osoba (zavisno od tipa)
  - ovjerio: potpisnik (effective signer)
  - preuzeo: osoba ili evidentičar (razduženje na skladište) — precizirati za svaki tip

### 6.9. Matrice koje treba ažurirati

- `.cursor/docs/matrices/transfers/MATRIX.md`:
  - state machine (raw/uploaded/potpisan)
  - potpisnik rezolucija po tipu transfera
  - obavezna `fromWarehouseId/toWarehouseId`
  - evidentičar A/B pravila
- `.cursor/docs/matrices/roles-access/MATRIX.md`:
  - evidentičar prava po režimu (zaduženje vs. bez zaduženja)
- `.cursor/docs/matrices/warehouses/MATRIX.md`:
  - kako se skladište koristi kao “source” i “target” transfera
- `.cursor/docs/matrices/disposal-commission/MATRIX.md`:
  - rashod isključivo kroz popis (ako se odluči)

---

## 7) Skladišta — gap lista za puni workflow

### 7.1. Scope i pristup opremi za `skladistar`

Za “uništenu opremu vidi samo skladištar tog skladišta” treba:

- Enforce read filter za `skladistar` po `warehouseId ∈ WarehouseKeeper` (ne samo `status=skladiste`).
- Uvesti pravila čitanja po stanjima:
  - `status=skladiste`: skladištar vidi samo svoju opremu u skladištu
  - `status=rashodovano` + “uništeno”: skladištar vidi samo svoju (ili admin vidi sve)

> Trenutno: `skladistar` read je samo `equipment.status === 'skladiste'`, bez provjere skladišta.

### 7.2. “Pokrivanje” skladišta (centralno vs ED)

Ako želite da se enforce-a “Skladište ED Zenica pokriva sve unutar Distribucije Zenica”:

- Definisati pravilo veze `Warehouse.orgUnitId`:
  - oprema čiji je `currentHolder.orgUnitId` u podstablu `warehouse.orgUnitId` može se razdužiti samo u ta skladišta
  - centralno skladište je “globalno” (orgUnitId = null ili posebno polje flag)
- Alternativno (jednostavnije): bez enforce-a, samo UX/operativno pravilo.

### 7.3. Uništenje rashodovane opreme (finalni status)

Trenutno postoji:

- `Transfer` tip `rashodovanje` + komisija (`DisposalApproval`) koja mora odobriti prije potpisa
- potpisom transfera oprema ide u `status=rashodovano`

Poslije popisa i odobrenja komisije rashoda: vidi **§11.8–11.9** (spisak → odobrenje predsjednika → skladištar uništi).

Da se dobije vaš efekat:

- Definisati “faze” rashod/uništenje:
  - opcija A: novi `EquipmentStatus` (npr. `rashod_u_skladistu`, `unisteno`) ili
  - opcija B: zadržati `status=rashodovano` i koristiti `warehouseCondition=unisteno` kao finalni marker, ali uz striktna pravila.
- Enforce: “uništenje ide isključivo kroz skladište”
  - prije finalizacije, `warehouseId` mora biti postavljen (rashodovana roba fizički u skladištu)
  - samo keeper tog skladišta može pokrenuti/finalizovati korak uništenja
- Komisija:
  - ili (1) komisija odobrava rashod (postojeće) a skladište samo finalizira uništenje
  - ili (2) uvesti dodatno odobrenje za “uništenje” (druga vrsta approval-a)

### 7.4. Audit trail

- Evidentirati ko i kada je:
  - preuzeo rashodovanu opremu u skladište
  - označio uništenje / finalizirao
- Minimalno: event tabela ili reuse postojeće `InventoryLineEvent` pattern (ako je smisleno).

---

## 8) UI — preporučena rekonfiguracija (org-centric + warehouse-centric)

### 7.1. Principi (šta optimizujemo)

- Konfiguracija ide “odozgo-nadole”: **Organizacija** je primarni kontekst; lokacija i skladišta su atributi/child resursi.
- Evidencija ide “odozdo-nagore”: za evidentičara i skladištara primarni kontekst je **skladište** (assignment-driven).
- “Registry” stranice (Lokacije/Kategorije) ostaju za admina kao master-data, ali nisu primarni ulaz u konfiguraciju.

### 7.2. Admin UI (minimalne promjene, veliki efekat)

- **Organizacija (detalj čvora)**:
  - prikaz i uređivanje: eksplicitna lokacija + efektivna lokacija
  - prikaz i uređivanje: eksplicitni potpisnik + efektivni potpisnik (kad se uvede)
  - nova sekcija: **Skladišta za ovu org-jedinicu** (`warehouse.orgUnitId = orgUnit.id`)
    - list + quick-create (name, city, address, keepers)
    - link “Otvori opremu u ovom skladištu” (warehouse detail view)
  - link “Oprema u podstablu ove org-jedinice” (org subtree view; zavisi od implementacije org-scopa)

- **Lokacije** ostaju kao master registry (kanton/grad).

- **Skladišta** ostaju kao registry, ali moraju podržati:
  - `orgUnitId` picker (vezanje skladišta na ED/distribuciju/podružnicu)
  - link “Oprema” i “Transferi” u kontekstu skladišta

### 7.3. Evidentičar UI (assignment-driven)

- Dashboard:
  - prikaz “Moje dodjele” kao **(warehouse + category + orgUnit?)** umjesto (grad + kategorija)
  - quick linkovi: “Oprema u mom skladištu”, “Zaduženja”, “Rashod”

- Oprema:
  - zadržati postojeća dva pogleda (global / po kategoriji) za search i analitiku
  - dodati treći pogled: **Po skladištima** (warehouse-first)
    - evidentičar vidi samo skladišta iz svojih dodjela
    - unutar skladišta, filteri i default list su u skladu s režimom A/B

- Transferi:
  - `zaduzenje`:
    - oprema kandidat mora dolaziti iz assignment skladišta (režim A)
    - korisnik (radnik) kandidat mora biti u coverage opsegu (A) ili subtree (B)
  - `razduzenje`/`rashodovanje`:
    - UI mora jasno prikazati target skladište (assignment) i/ili zabrane

### 7.4. Skladištar UI (warehouse-first)

- “Moja skladišta” → ulaz u **warehouse detail**:
  - tab “Na skladištu” (prijem, stanje, label print)
  - tab “Rashod / uništenje” (kad se uvede workflow)
  - tab “Aktivnosti” (audit trail)

### 7.5. Warehouse detail view (zajednički obrazac)

Jedna stranica/komponenta “Skladište: detalj” (admin/evidentičar/skladištar), sa tabovima:

- **Oprema na skladištu** (`status=skladiste`, warehouseId)
- **Zaduženja / Razduženja** (transferi vezani za opremu skladišta)
- **Rashod / Uništenje** (workflow)
- **Kontekst** (lokacija, org-jedinica, keepers; edit samo admin)

### 8.7. Popis i rashod (UI)

Detaljne preporuke: **§11.12** (command center sesije, mobile unos linija, freeze banner, stepper prenosnice, tab Rashod, skladištar “Za uništenje”).

---

## 9) Frontend — prikaz efektivnog potpisnika/lokacije i skladišnih tokova

- Na “Organizacija” stranici:
  - prikazati i **eksplicitnog** i **efektivnog** potpisnika
  - prikazati eksplicitnu lokaciju i efektivnu lokaciju
- Skladišta UI:
  - jasna podjela: centralno vs vezano za org-jedinicu (ako se koristi)
  - tok: prijem → skladište → rashod → “u skladištu za uništenje” → uništeno
  - filtri/vidljivost: “uništeno” samo keeperima (i adminu)

---

## 11) Popis i rashod — puni model (sesija, komisije, freeze, zapisnici)

### 11.1. Cilj (poslovni efekat)

Administrator vodi **godišnji popis** po **distribuciji** (npr. ED Zenica). Dok je sesija aktivna:

- skladišta **ne primaju** novu robu i **ne izdaju** (zaduženje) robu
- evidentičar **ne mijenja** status/stanje opreme — oprema ostaje kao na početku sesije
- **popisne komisije** (po kategoriji u toj distribuciji) evidentiraju prisutnost, predlažu prenose i rashod
- sve promjene su **pending** i primjenjuju se tek pri **zaključivanju sesije**
- paralelno postoji **komisija rashoda** (auto uz popisnu komisiju) koja kasnije odobrava rashod po stavci
- na kraju: **zapisnik popisa** + **zapisnik rashodovanja**; skladištar vidi opremu spremnu za uništenje

Za dev: administrator može sesiju aktivirati **ručno bilo kada** (ne čeka 01.12.). U produkciji: podrazumijevani period **01.12–31.12** pri aktivaciji.

### 11.2. Trenutno stanje (gap vs. cilj)

| Oblast | Implementirano | Gap |
|--------|----------------|-----|
| Sesija po distribuciji | `InventorySession` (`orgUnitId` = distribucija, `year`, statusi) | Nema auto-start po kalendaru (samo ručna aktivacija) |
| Period 01.12–31.12 | Postavlja se pri `activate` ako datumi prazni | Nema scheduled activate/close |
| Komisija po kategoriji | `InventoryCommittee` + opseg (grad + kategorija + podkategorije, skladište + zaduženo) | OK |
| Auto komisija rashoda | `DisposalCommission` 1:1 uz popisnu komisiju | OK |
| Pending + close job | `InventoryPendingAction`, `InventorySessionCloseJob` | OK koncept |
| Freeze transfera | `assertTransfersAllowedForEquipment` po gradu | Transferi s `inventoryLineId` **preskaču** blokadu; `sign()` odmah mijenja opremu |
| Freeze skladišta | — | Nema blokade prijema/izdavanja u skladištu |
| Freeze evidentičara | — | `equipment.update` nije blokiran |
| Članovi komisije | Svi članovi moraju imati aktivan `User` | Cilj: samo **predsjednik** mora biti user; članovi mogu biti samo `Employee` |
| Unos linija | `recordLine` za člana s `user.employeeId` | Radnik bez user računa ne može unositi u app |
| Prenos u popisu | `promjena_lokacije` → pending; na close RAW transfer | Potpis tokom sesije mijenja opremu odmah (suprotno cilju) |
| Rashod u popisu | UI: “Rashod preko Prenosa”; `disposal` pending **nije implementiran** | Nema linije/statusa rashoda; rashod van popisa još moguć |
| Zapisnik | `getCommitteeReport` po komisiji | Nema session-level zapisnika sa svim akcijama + rashod |
| Komisija rashoda — lista | `DisposalApproval` na transferu | Nema spiska opreme po stavci nakon popisa; predsjednik ne odobrava po opremi |
| Uništenje skladištara | — | Nije implementirano (vidi §7.3) |
| UI/UX popisa | Admin sesija + član “Moje komisije”; tabela linija | Nema jedinstvenog toka; rashod odvojen; mobile/table UX slab; vidi §11.12 |

Referenca u kodu: `inventory-count.service.ts`, `inventory-session-close-worker.service.ts`, `InventoryCountPage.tsx`, `session-lines-panel.tsx`, `DisposalCommissionsPage.tsx`, matrica `.cursor/docs/matrices/inventory-count/MATRIX.md`.

### 11.3. Inventory session — životni ciklus

**Entitet:** `InventorySession`

- `orgUnitId` — mora biti `OrgUnit.type = distribucija`
- `year` — jedinstveno po `(orgUnitId, year)`
- `status`: `draft` → `active` → `closing` → `closed`
- `startDate` / `endDate` — default 01.12–31.12. te godine pri aktivaciji

**Pravila:**

- Kreiranje i komisije: samo u `draft`
- Aktivacija: `draft` → `active` (admin; ručno bilo kada za dev)
- Zatvaranje: `active` → `closing` → async job → `closed`
- U `closing`/`closed`: read-only; nema novih linija

**Opcionalno (produkcija):**

- scheduled job: auto-activate 01.12, auto-close 31.12 (feature flag)

### 11.4. Inventory freeze (obavezno tokom `active`)

Dok postoji `InventorySession.status = active` za grad distribucije sesije (`sessionCityId` = `orgUnit.effectiveLocationCityId`):

**Zabraniti:**

- `POST` oprema sa `status=skladiste` (prijem u skladište)
- transfer `zaduzenje` / `razduzenje` / `prenos` koji mijenja holder (osim inventory workflow-a)
- transfer `rashodovanje` **van** popisa (osim admin)
- `PATCH` equipment koji mijenja `status`, `currentHolderId`, `warehouseId`, `warehouseCondition`
- evidentičar: bilo kakva promjena stanja opreme

**Dozvoliti:**

- `recordLine` / ažuriranje `InventoryLine` (članovi komisije)
- kreiranje **draft** transfera iz popisa (RAW) + **upload** potpisane prenosnice
- **ne** finalizovati transfer tako da mijenja opremu dok je sesija `active` (usklađeno s §6.3.3)

**Implementacija (preporuka):**

- centralni `InventoryFreezeService.assertNoEquipmentMutation(equipmentId, user, action)`
- poziv iz: `equipment.service`, `transfers.service` (create/sign/finalize), `warehouses` prijemi
- izuzetak: inventory line + upload na transfer vezan za `inventoryLineId` (bez equipment update do close)

### 11.5. Popisne komisije — struktura i članstvo

**Kreiranje (admin, u `draft` sesiji):**

- Jedna komisija po **kategoriji** (root) u okviru distribucije sesije
- Opseg opreme komisije:
  - kategorija + sve podkategorije
  - `status ≠ rashodovano`
  - efektivni grad opreme = grad distribucije sesije
  - uključuje: opremu na skladištu u tom gradu + zaduženu kod radnika u tom gradu (zaduženje sa skladišta te distribucije)

**Članstvo (cilj):**

| Uloga | Popisna komisija | Komisija rashoda |
|-------|------------------|------------------|
| Predsjednik | **Obavezan** `User` (app) u okviru ED/distribucije | **Obavezan** `User` (glasanje/odobrenje) |
| Članovi | min. 2; mogu biti `Employee` **bez** user računa | min. 2; user opcionalno ako glasaju u app |
| Prava u app | članovi **s user računom** rade unos; ostali — offline/zapisnik | predsjednik odobrava po stavci u app |

**Trenutni gap:** `validateCommitteeMembers(..., { requireUserForAll: true })` — treba prebaciti na `requireUserForPresidentOnly`.

**Auto komisija rashoda:**

- Pri kreiranju `InventoryCommittee` automatski `DisposalCommission` (isti grad, `inventoryCommitteeId`)
- Članovi rashoda mogu biti isti kao popisni ili posebno definisani u wizardu

### 11.6. Unos linija popisa — statusi i pending akcije

**Statusi linije (`InventoryLineStatus`):**

- `prisutna` — roba prisutna na popisu
- `ostecena` — obavezna napomena
- `nije_prisutna` — obavezna napomena
- `promjena_lokacije` — cilj: `skladiste` ili `osoba` (+ `relocationToPersonId`)

**Predloženo proširenje (rashod):**

- `predlozen_rashod` (ili poseban flag na liniji) → `InventoryPendingAction.kind = disposal`
- Preduslov rashoda: oprema mora biti **razdužena** (na skladištu), ne zadužena kod osobe
- Oprema koju je evidentičar ranije označio za rashod ulazi u spisak komisije rashoda

**Tok snimanja linije:**

1. Član komisije (user + employeeId u komisiji) snimi liniju
2. Kreira/ažurira `InventoryPendingAction` (`pending`)
3. Za `promjena_lokacije`: **ne** kreira transfer odmah — tek na close job (ili draft bez equipment update)
4. Oprema u bazi **ostaje nepromijenjena** do zatvaranja sesije

**Prenosnica u popisu (usklađeno s §6):**

- RAW prenosnica: download/print odmah nakon što postoji draft transfer (na close ili ranije kao “preview”)
- Upload potpisane prenosnice: obavezan prije finalizacije
- Članovi komisije imaju ista prava kao evidentičar **samo za transfer-e vezane uz svoju liniju** i **samo dok je sesija active**
- Potpisani dokument se čuva kao i van popisa (`scannedDocUrl` / Upload)

### 11.7. Zatvaranje sesije (close job) — redoslijed primjene

Admin: `closeSession` → `closing` + `InventorySessionCloseJob` (async).

**Preporučeni redoslijed u workeru:**

1. Validacija: sve linije s prenosom imaju upload (ili eksplicitno “preskočeno” s razlogom)
2. Primjena `mark_present` / `ostecena` / `nije_prisutna` — audit snapshot (opciono čuvati stanje na `activate`)
3. Primjena `relocate` — **finalizacija** transfera (equipment update) ili kreiranje + finalize u jednom koraku
4. Primjena `disposal` — **ne** rashodovati odmah; generisati **listu kandidata** za komisiju rashoda
5. Generisanje **zapisnika popisa** (session-level, header/footer, grupe po radniku/skladištu/kategoriji)
6. Status sesije → `closed`; komisije read-only

**Trenutni gap u workeru:**

- `disposal` → `BadRequestException('Disposal apply is not implemented')`
- `relocate` kreira RAW transfer; equipment se mijenja tek ako neko potpiše transfer **prije** close — treba uskladiti s §11.4

### 11.8. Komisija rashoda — workflow poslije popisa

**Ulazni spisak (kandidati za rashod):**

- oprema koju je evidentičar **prije popisa** označio za rashod (u scope grad+kategorije komisije)
- oprema koju je popisna komisija označila `predlozen_rashod` tokom popisa
- deduplikacija po `equipmentId`

**Odobrenje:**

- Predsjednik komisije rashoda **mora** odobriti **svaku stavku** (novi model npr. `DisposalInventoryApproval` po opremi, ili proširenje postojećeg approval-a)
- Članovi mogu imati ulogu informacije/glasanja prema pravilima
- Tek nakon odobrenja: oprema prelazi u status vidljiv skladištaru npr. `rashod_odobren` / `spremno_za_unistenje` (vidi §7.3)

**Zapisnik rashodovanja:**

- Odvojen dokument od zapisnika popisa
- Header/footer, lista odobrenih stavki, potpisi komisije
- Export PDF / print

**Blokada van popisa:**

- `rashodovanje` transfer create/sign zabranjen u gradu dok postoji aktivna sesija **ili** dok stavka nije prošla komisiju rashoda nakon popisa (definisati jedno pravilo; preporuka: rashod **isključivo** kroz popis + komisiju)

### 11.9. Skladištar — uništenje (veza §7.3)

Nakon odobrenja komisije rashoda:

- Skladištar (keeper dodijeljenog skladišta) vidi listu opreme **spremne za uništenje**
- Akcija “Uništi” / “Deaktiviraj”:
  - `warehouseCondition = unisteno` (ili novi finalni status)
  - oprema ostaje u bazi za evidenciju, **bez** daljnje manipulacije
- Audit: ko, kada, koje skladište

### 11.10. API / model promjene (checklist)

**Backend:**

- [ ] `InventoryFreezeService` + integracija u equipment/transfers/warehouses
- [ ] `validateCommitteeMembers`: predsjednik = user, članovi opcionalno
- [ ] `recordLine`: dozvola za člana bez usera — samo ako ima user (ili offline import — odvojeno)
- [ ] `InventoryLineStatus` + `predlozen_rashod` + `disposal` apply u close workeru
- [ ] Transfer iz popisa: **ne** mijenjati equipment na `sign` dok je sesija active; finalize u close job-u
- [ ] `DisposalInventoryApproval` (ili ekvivalent) — odobrenje po opremi
- [ ] Blokirati `rashodovanje` van popisa u scope gradu
- [ ] Session zapisnik endpoint + rashod zapisnik
- [ ] Skladištar: lista + akcija uništenja

**Frontend:**

- [ ] Wizard komisije: članovi bez obaveznog usera (predsjednik obavezan)
- [ ] Linije: status rashod + validacija razduženja
- [ ] Koraci prenosnice: RAW → upload → (finalize na close, ne odmah sign)
- [ ] Panel komisije rashoda: lista + odobrenje predsjednika
- [ ] Skladištar: tab “Za uništenje”
- [ ] UI/UX prema §11.12 (command center, mobile unos, freeze banner, stepper prenosnice, rashod tab)

**Matrice:**

- [ ] `.cursor/docs/matrices/inventory-count/MATRIX.md` — freeze, članstvo, close redoslijed
- [ ] `.cursor/docs/matrices/disposal-commission/MATRIX.md` — spisak po opremi, odobrenje predsjednika
- [ ] `.cursor/docs/matrices/transfers/MATRIX.md` — cross-ref §6 + §11
- [ ] `.cursor/docs/matrices/equipment-status/MATRIX.md` — rashod/uništeno faze

### 11.11. Test plan (popis + rashod)

- **Sesija:** create draft → activate (datumi 01.12–31.12) → close → closed
- **Freeze:** tokom `active`, skladištar ne može prijem; evidentičar ne može update statusa; običan transfer blokiran
- **Komisija:** scope kategorije uključuje podkategorije; oprema na skladištu + zadužena u gradu distribucije
- **Linija:** `promjena_lokacije` → pending; equipment holder nepromijenjen dok je active
- **Prenosnica:** upload tokom sesije; equipment se mijenja tek na close/finalize
- **Close job:** svi pending applied; zapisnik generisan
- **Rashod:** lista kandidata → odobrenje predsjednika → skladištar vidi → uništenje → read-only oprema
- **Negativno:** rashod transfer van popisa odbijen; potpis prenosnice van komisije odbijen
- **UI:** responsive unos linija; banner freeze; checklist prije zaključka liste; stepper prenosnice (vidi §11.12)

### 11.12. UI/UX — popis i rashod (preporuke)

Referenca trenutnog UI: `InventoryCountPage`, `inventory-committee-wizard`, `session-lines-panel`, `TransferDocumentPanel`, `DisposalCommissionsPage`.

Princip: **jedan vidljiv tok** od sesije do uništenja; na terenu **mobile-first**; jasno razdvojiti *zaključak liste komisije* vs *zatvaranje sesije*; rashod kao **faza 2** iste komisije, ne zaseban mentalni model “Prenosi”.

#### 11.12.1. Informaciona arhitektura

- **Stepper** (admin / član komisije):
  `Nacrt → Aktivna → Unos linija → Prenosnice → Zaključak liste → (sesija zatvorena) → Rashod → Zapisnici`
- **Dashboard** za člana: kartica “Moja aktivna komisija” s progresom `evidentirano / ukupno`, CTA “Nastavi unos”.
- **Rashod u okviru komisije:** tab **“Rashod”** na istoj stranici komisije (ne samo `Komisije za rashod` po gradu za stari transfer-tok).
- Zadržati `Komisije za rashod` samo za admin registry / legacy transfer approvals — jasno označiti “Stari tok (transfer)” vs “Popisni rashod”.

#### 11.12.2. Admin — command center sesije

Konsolidovati panel za odabranu sesiju:

- status + period (01.12–31.12)
- agregat: broj komisija, ukupno stavki, % evidentirano, komisije zaključene/ukupno
- akcije: Aktiviraj | Zatvori sesiju | Osvježi
- **close job:** progress bar + lista grešaka (klik → oprema/linija), ne samo tekst

Tabela sesija — dodatne kolone: **Period**, **Progres**, **Komisije (zatvorene/ukupno)**.

**Wizard komisije:**

- Korak 1: preview broja stavki u opsegu prije kreiranja (“~124 komada”).
- Korak 2–3: vizuelno odvojene kartice “Popisna” vs “Rashod”.
- Opcija **“Kopiraj članove u komisiju rashoda”**.
- Predsjednik: samo korisnici s računom; članovi: svi radnici (kad backend dozvoli — trenutno UI filtrira samo `employeesWithUser`).

#### 11.12.3. Unos linija (član komisije) — prioritet

Trenutna široka tabela + `<select>` po redu je teška na mobilnom i kod velikog broja stavki.

| Prioritet | Promjena |
|-----------|----------|
| Visok | **Mobile-first kartice** po stavci: inventurni broj, kategorija, zaduženje, status kao chips |
| Visok | Filteri: “Samo neevidentirano”, “Čeka prenosnicu”, “Greška primjene” |
| Visok | **Bulk:** “Označi sve prisutne na stranici” |
| Srednji | **Grupisanje** kao na štampi: accordion po radniku / skladištu |
| Srednji | Inline validacija (ne `alert()`); guided flow za `promjena_lokacije` |
| Srednji | Progress header: `87/124 · 12 prenosnica čeka upload · 3 greške` |

Ukloniti zbunjujući tekst “Rashod preko Prenosa” → kad postoji `predlozen_rashod`: *“Rashod odobrava komisija rashoda nakon zatvaranja sesije”* + link na tab Rashod.

#### 11.12.4. Prenosnica u kontekstu popisa (usklađeno s §6)

Po liniji — **stepper** u `TransferDocumentPanel` (inventory mode):

1. **RAW** — preuzmi / štampaj  
2. **Upload** — potpisani PDF  
3. **Čeka zatvaranje sesije** — oprema se ne mijenja  
4. **Primijenjeno** — nakon close job-a  

- Badge razdvojiti: `Nema uploada` vs `Upload OK, čeka zatvaranje`.
- Dugme “Potpiši/Finalizuj”: disabled tokom `active` sesije + tooltip (kad backend usklađen).
- **Mobile:** prenosnica u **Sheet/Drawer**, ne expand u tabeli.

#### 11.12.5. Inventory freeze — vidljivo korisniku

- **Globalni banner** u `Layout` dok postoji aktivna sesija u gradu/distribuciji korisnika.
- Na Oprema / Transferi / Skladište: disabled akcije + link “Otvori popis”.
- API greške zamijeniti porukom: *“Godišnji popis je aktivan u ovom gradu.”*

#### 11.12.6. Rashod — UI po fazama

**Faza A (tokom popisa, popisna komisija):**

- Status linije `predlozen_rashod`; ako oprema zadužena — CTA “Prvo razduži” (disabled rashod).
- Obavezna napomena.

**Faza B (nakon zatvaranja sesije, komisija rashoda):**

- **Inbox predsjednika:** lista stavki, Approve / Odbij + razlog (po opremi, ne samo po transferu).
- Članovi: read-only pregled + status (ako ostane glasanje).

**Faza C (skladištar):**

- Tab **“Za uništenje”** na warehouse detail (§8.4): inventurni broj, datum odobrenja, komisija, “Potvrdi uništenje” + potvrda.

**Zapisnici:**

- Meni na komisiji: Popisna lista | Zapisnik popisa | Zapisnik rashoda (enabled po fazi).
- Preview grupa prije printa (ne samo print view).

#### 11.12.7. Zaključavanje — jasni nazivi i checklist

| Akcija | UI naziv | Ko |
|--------|----------|-----|
| Zaključak komisije | **Zaključi popisnu listu** | predsjednik popisne komisije |
| Zatvaranje sesije | **Zatvori sesiju popisa** | admin |

Prije zaključka liste — **modal checklist:**

- sve stavke evidentirane?
- sve prenosnice uploadovane?
- nema `failed` pending?

Prije zatvaranja sesije — pregled po komisijama (koja lista nije zaključena, broj grešaka). Destruktivne akcije: modal sa sažetkom, ne `confirm()`.

#### 11.12.8. Uloge — šta koja uloga vidi

| Uloga | Prikaz |
|-------|--------|
| Član komisije | “Moje komisije” + unos |
| Predsjednik popisa | + zaključak liste + pregled prenosnica tima |
| Admin | command center sesije; `SessionLinesPanel` samo preview |
| Predsjednik rashoda | inbox odobrenja (nakon close) |
| Skladištar | “Za uništenje”, ne cijeli popis |
| Evidentičar | banner freeze + read-only pregled predloženog rashoda |

**Empty states:** konkretne poruke (npr. “Popis još nije aktiviran za ED Zenica”), ne generičko “Niste član komisije”.

#### 11.12.9. Kvalitet interakcije (brzi dobitci)

- Greške: toast / inline umjesto `alert()`.
- **Socket.IO:** osvježavanje nakon close job-a, novih odobrenja rashoda.
- Notifikacije: prenosnica čeka upload, sesija zatvorena, rashod čeka odobrenje.
- A11y: status kao radio/chip grupa, ne samo `<select>` u tabeli.
- Terminologija: konzistentno *zaključiti listu* vs *zatvoriti sesiju*.

#### 11.12.10. Prioritet implementacije UI

1. Progress + filter “neevidentirano” na unosu linija  
2. Stepper prenosnice + jasniji badge-ovi  
3. Banner freeze + poruke blokade  
4. Admin command center + close job UI  
5. Tab Rashod u okviru komisije (kad backend spreman)  
6. Mobile kartice umjesto tabele (`< md`)  
7. Skladištar “Za uništenje”

---

## 12) Test plan (minimalno — org, skladišta, transferi)

- **OrgUnit tree**
  - promjena `parentId` ne smije napraviti ciklus
  - dozvoljene / nedozvoljene parent→child veze
- **Effective location**
  - override na višem nivou propagira se na potomke
  - override na nižem nivou “prekida” nasljeđivanje
- **Effective signer**
  - ista pravila kao lokacija, uključujući propagaciju
- **Warehouse scope**
  - skladistar vidi samo opremu svog skladišta (i po definisanim statusima)
- **Disposal/destroy tok**
  - komisija: pending → approved → potpis rashoda
  - skladište: preuzimanje → finalizacija uništenja → vidljivost
- **Popis + rashod** (detaljno): vidi §11.11

---

## Deliverables (šta treba završiti)

- DB migracija: `effectiveSignerId`
- Backend: servis za signer resolution + integracija u tokove
- Backend: `POST /org-units` prima `locationCityId`
- Backend: validacija tipova po matrici
- Matrice: update `org-hierarchy`, `locations`, `warehouses`, `equipment-status`, `disposal-commission`, `inventory-count` (kad se logika promijeni)
- Backend: enforce warehouse scope za `skladistar` (read + write) i uništenje workflow
- Frontend: prikaz eksplicitnog vs efektivnog (potpisnik/lokacija) + kompletan skladišni tok
- **Popis + rashod (§11):**
  - `InventoryFreezeService` + blokade skladišta/evidentičara/transfera
  - članstvo komisije (predsjednik user, članovi employee)
  - pending `disposal` + close job primjena + zapisnici
  - komisija rashoda: spisak po opremi + odobrenje predsjednika
  - transferi iz popisa usklađeni s §6 (upload prije equipment update)
  - skladištar: uništenje rashodovane opreme
  - **UI/UX (§11.12):** command center sesije, mobile unos, freeze banner, stepper prenosnice, rashod tab, inbox predsjednika, warehouse “Za uništenje”

