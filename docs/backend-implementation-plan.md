# Backend — detaljan plan implementacije audita

**Status:** implementacija u toku. Već zatvoreno: prenosnica escape-uje dinamički HTML; ranjivi proxy/Multer/Socket.IO dependency lanac je patchovan, a backend lockfile prolazi `npm audit` bez nalaza; production CORS allow-lista je fail-closed za HTTP i WebSocket; user scope izmjene i refresh rotacija su transakcijski zaštićene; production setup odbija nedostajući token, bootstrap se serijalizuje i početne postavke upisuju se u istoj transakciji; uploadi imaju pre-parser limite, signature/ZIP provjere i temp-file/rename + DB transakciju sa cleanup-om na grešku; inventory-close poslovi imaju retry/reconciliation; FIFO lot dekrementi i transfer state transitions su conditional/atomarni; WebSocket odbija neaktivne korisnike i employee deactivation prekida njihove aktivne socket sesije; izabrani write endpointi koriste validirane DTO-e; category reparent provjerava ciklus pod advisory lock-om; CSV ćelije neutralizuju formule, a equipment CSV se sada šalje backpressure-aware streamom u 500-rednim cursor stranicama; readiness provjerava PostgreSQL, shared Redis i obje BullMQ queue konekcije. Dodana je PostgreSQL TLS konfiguracija sa peer verifikacijom/CA podrškom i CI provjera stvarnog ponašanja partial unique indeksa; Redis konfiguracija u backendu i document-workeru sada strogo validira boolean TLS i port/DB numeričke vrijednosti; grešna vrijednost za TLS više ne može tiho isključiti enkripciju. Document-worker ima config/health/TLS unit testove i live Redis readiness provjeru, uz build i dependency audit u zasebnom CI jobu. Refresh tokeni se automatski čiste jednom dnevno u UTC-u u ograničenim batch-ovima, uz složeni expiry indeks. CI za ranije pushanu promjenu `6dcfe57` (run `40227562390`) prošao je frontend, backend i worker; tada je backend suite imao 414 testova, a CI uključuje PostgreSQL migracije, settings-defaults, inventory race, disposal-approval race i Redis rate-limit/lease-renewal integration testove. Pending-action retry commit `8ad07bf` prošao je CI run `40230286269` na frontend, backend i document-worker jobovima; backend CI je prošao Prisma/migration provjere, PostgreSQL inventory/disposal race integracije, Redis testove, lint, typecheck, build i svih 423 unit testa. Proširena PostgreSQL disposal integracija je prošla: same-session retry čuva review status, a nova sesija ponovo otvara approval. Nastavak za stale lease recovery commit `bfcd73a` prošao je CI run `40231642660` na sva tri joba; backend je prošao novu migraciju, expired close-lease PostgreSQL integraciju, lint, typecheck, build i svih 426 unit testova. Dodatna PostgreSQL provjera stvarnog `SIGKILL` nakon disposal side-effect commita prošla je u CI run-u `40232428101`, zajedno sa frontend/backend/document-worker provjerama. Produkcijski TLS/Redis ACL i proxy topologija i dalje traže deployment/staging potvrdu; javni QR privacy odluka i ostale neriješene tačke ostaju otvorene.
**Osnova:** [`backend-audit.md`](./backend-audit.md), koji sadrži nalaze, izvore u kodu i početnu faznu podjelu
**Opseg:** backend API, PostgreSQL/Prisma, Redis/BullMQ/Socket.IO, uploadi, background poslovi, sigurnost, testovi i operativna spremnost.

> Ovaj dokument razrađuje redoslijed i kriterije prihvatanja. Ne predstavlja odobrenje za promjenu poslovnih pravila. Prije promjene ponašanja (npr. javnih QR podataka, djelimično neuspjele inventure, statusa prenosa) potrebno je potvrditi očekivanja sa vlasnikom procesa.

## 1. Cilj i pravila izvođenja

Cilj je zatvoriti potvrđene sigurnosne i integritetske rizike bez velikog „big-bang“ refaktora. Raditi u malim, pregledljivim promjenama, uz test prije ili zajedno sa svakom izmjenom.

1. **Prvo reprodukcija, pa izmjena.** Zabilježiti postojeće ponašanje i napraviti test koji prikazuje kvar/rizik.
2. **Jedna poslovna tema po promjeni.** Dependency update, upload promjena, transakcije i refaktor servisa ne spajati u jedan veliki diff.
3. **Baza je autoritet za integritet.** Pre-check u aplikaciji služi za razumljivu poruku; unique constraint, conditional update ili transakcija sprečavaju race.
4. **Asinhroni poslovi moraju biti oporavljivi.** Svaki DB posao mora imati definisanog vlasnika, retry pravilo, idempotency i reconciliation.
5. **Kompatibilan rollout.** Migracije prvo proširiti kompatibilno, zatim objaviti kod koji koristi novo polje/indeks, a tek kasnije ukloniti zastarjelo.
6. **Ne izlagati tajne ili PII u testovima/logovima.** Koristiti sintetičke podatke, anonimizovane fixture-e i konfiguracije bez produkcijskih credentiala.
7. **Svaki paket završava jasnim prihvatanjem.** Ne prelaziti na veći refaktor dok testovi i observability ne pokažu da je promjena sigurna.

## 2. Prioriteti i redoslijed

| Talas | Fokus | Zašto ovim redom |
|---:|---|---|
| 0 | Baseline i runtime provjere | Razdvaja potvrđene kodne probleme od deployment pretpostavki i čuva rollback put. |
| 1 | Kritična sigurnost: dependency chain, upload, HTML, setup/config | Smanjuje neposrednu izloženost prije većih funkcionalnih zahvata. |
| 2 | Atomičnost auth/user promjena i invalidacija pristupa | Sprečava nevažeće scope-ove, dupli refresh i pristup deaktiviranih korisnika. |
| 3 | Inventory close i pouzdanost queue/outbox tokova | Sprečava trajno zaglavljene ili duplirane poslovne poslove. |
| 4 | Konkurentnost, ograničenja i privatnost domenskih podataka | Učvršćuje zalihe, transfere, kategorije, izvještaje i javni QR. |
| 5 | Integracioni testovi, health i release gate | Održava popravke dokazivim pri sljedećim isporukama. |
| 6 | Refaktor i performanse | Raditi tek uz stabilan karakterizacijski test i mjerenje. |

P1 iz audita ne mora značiti isti redoslijed za svaki deployment. Ako stvarna konfiguracija pokaže da su TLS, CORS ili setup već zaštićeni na infrastrukturnom sloju, dokumentovati dokaz i zatvoriti nalaz kao potvrđeno mitigovan — ne uvoditi paralelnu, nepotrebnu konfiguraciju.

## 3. Talas 0 — baseline, staging i deployment dokazi

### 0.1 Zabilježiti reproduktivni baseline

- Sačuvati branch/commit, Node/npm verziju, lockfile hash, `npm run test:unit` rezultat i backend/document-worker build rezultate.
- CI rezultat za posljednju promjenu: run `40227562390` za commit `6dcfe57` prošao je frontend/backend/document-worker provjere, uključujući typecheck, build, lint, dependency audit, 414 backend testova i 12 worker testova; backend job generiše Prisma client, primjenjuje Postgres migracije te pokreće settings-defaults, inventory race, disposal-approval race i Redis rate-limit/lease-renewal integration testove.
- Nastaviti koristiti hosted CI kao provjeru punog builda; lokalni rezultat bez generisanog Prisma clienta ne zamjenjuje CI kompilaciju.
- Sačuvati `npm audit` JSON za backend i zavisnosti workera. Advisory brojevi su vremenski promjenjivi; svaki update se poredi sa novim izvještajem.

### 0.2 Potvrditi produkcijske granice

Bez unošenja tajni u repozitorij ili chat, provjeriti u staging/prod konfiguraciji:

- Koji proxy terminira TLS, kojim redoslijedom prolaze proxy-i i da li je backend direktno dostupan s interneta.
- Efektivni CORS origin allow-list, `trust proxy`, TLS za PostgreSQL/Redis, Redis ACL i CA mount.
- Da li je `SETUP_TOKEN` obavezan prije prvog administratora i kako se rotira.
- Da li transfer HTML endpoint ostaje unutar istog browser origin-a ili se preuzima kao attachment.
- Koji procesi/replice dijele upload filesystem i koliko DB konekcija koriste zajedno.

### 0.3 Migracijski i rollback rehearsal

- Na praznoj Postgres bazi izvršiti sve migracije od početka.
- Na staging kopiji bez ličnih podataka izvršiti upgrade od trenutne verzije.
- Zabilježiti vrijeme, blokade, indeksne operacije i rollback/restore korake.
- Ažurirati migration README tako da odgovara stvarnom direktoriju migracija.

**Kriteriji izlaza:** ponovljiv testni okoliš; potvrđen DB/Redis TLS ili jasno evidentiran gap; migracije prolaze na praznoj i upgrade bazi; poznat rollback postupak.

## 4. Talas 1 — sigurnosni P1 nalazi

### 1.1 Dependency nadogradnje kao odvojeni, mali paketi

**Red:** proxy/rate-limit relevantni paketi → upload/Multer lanac → ostali backend runtime advisories → dev-only alati.

1. Napraviti lockfile baseline i listu direktnih/transitivnih dependency-ja, njihovih runtime upotreba i dostupnih patch verzija.
2. Ažurirati najmanji mogući raspon verzija; prvo `proxy-addr`/Express lanac jer IP login rate-limit zavisi od `request.ip` i trust-proxy topologije.
3. Posebno pregledati Multer update zbog promjena upload ponašanja i Nest platform-express kompatibilnosti.
4. Pokrenuti testove, build, upload/auth/Socket regression suite i `npm audit` ponovo.
5. Pregledati advisories koji ostanu: napisati da li je paket runtime ili dev-only, da li je putanja reachable i ko prihvata rezidualni rizik.

**Prihvatanje:** nema kritičnih/visokih runtime advisories bez dokumentovanog izuzetka i vlasnika rizika; lockfile diff je pregledan; relevantni regresioni testovi prolaze.

### 1.2 Uvesti jedinstvenu upload politiku prije bufferovanja

Obuhvatiti `uploads` i DOCX template upload kroz zajednički, konfigurabilni policy sloj.

- Postaviti Multer `limits` prije nego što fajl uđe u memory storage: maksimalna veličina, broj fajlova, broj/veličina polja i prihvatljive field names.
- Odbiti prazne, prevelike i neočekivane fajlove prije daljeg procesiranja; API vratiti stabilan 4xx kod i poruku bez stack trace-a.
- Za PDF provjeriti signature/sniffed content i strukturu u dozvoljenom obimu; MIME/ekstenzija klijenta koristiti samo kao dodatnu provjeru.
- Za DOCX ograničiti compressed bytes, broj ZIP entries, ukupne uncompressed bytes i compression ratio prije čitanja XML-a ili renderovanja.
- Napraviti testove MIME spoofing-a, pogrešnog potpisa, oversized input-a i ZIP dekompresijskog budžeta.
- Pisati u privremeni naziv unutar kontrolisanog direktorija; završiti validaciju prije finalnog rename-a. Ako DB zapis ili konačni rename ne uspije, očistiti temp/final fajl gdje je bezbjedno i evidentirati cleanup grešku.
- Dodati periodični/startup reconciler za stare temp fajlove i fajlove bez DB metapodataka; ne brisati fajl samo na osnovu starosti bez provjere ownership-a.
- Prije rollout-a izmjeriti očekivane najveće legitimne PDF/DOCX fajlove sa poslovnim korisnicima; limite ne birati napamet.

**Prihvatanje:** hard limit se primjenjuje prije parsiranja/bufferovanja; validacija stvarnog sadržaja prolazi; DB failure ne ostavlja neotkriven orphan; dozvoljeni dokumenti i download ACL rade kao prije.

#### Stored transfer-template path containment (P2 — implementation added)

- Putanja template-a iz baze se sada normalizuje i provjerava da ostane unutar `UPLOAD_DIR`; apsolutne putanje, traversal izvan root-a i root direktorij kao fajl odbijaju se kao neispravan interni zapis.
- Isti resolver koriste download, activation i generisanje prenosnice; testovi pokrivaju validnu relativnu putanju, traversal, apsolutnu putanju i root. Lokalni lint i 406 unit testova su prošli, a CI run `40222506782` je prošao sve workflow jobove.

### 1.3 Ukloniti stored HTML injection iz prenosnica

- Potvrditi endpoint response i origin u stvarnom deployment-u.
- Ako poslovni proces zahtijeva HTML preview, escape-ovati sve tekstualne čvorove i atribute kontekstualno; ne umetati raw vrijednosti iz `reason`, `notes`, imena, labela ili inventurnih brojeva.
- Razmotriti `Content-Disposition: attachment` ili generisani PDF samo nakon potvrde da je to kompatibilno sa postojećim potpisivanjem/štampom.
- Dodati regression testove za `<script>`, `</td><script>`, `img onerror`, quote/attribute payload i unicode/ampersand tekst; očekivati prikaz kao tekst, ne izvršavanje.
- Provjeriti i druge HTML/CSV export putanje u istom modulu da fix nije samo za jedan template.

**Prihvatanje:** nijedna vrijednost iz DTO/DB ne može postati izvršni markup; postojeće legitimne vrijednosti se ispravno prikazuju/štampaju.

### 1.4 Učiniti setup i produkcijski HTTP config fail-safe

- Startup u production režimu odbija prazan ili placeholder `SETUP_TOKEN` prije inicijalizacije prvog admina; dokumentovati tajni provisioning i rotaciju.
- Serializovati bootstrap jedinstvenim DB/advisory lock-om ili ekvivalentnim single-winner mehanizmom; provjeriti stanje unutar iste transakcijske granice.
- Uključiti company/system settings u transakciju ili uvesti idempotentan oporavak prije nego što setup označi uspjeh.
- Zamijeniti CORS fallback `origin: true` sa eksplicitnom allow-listom u production; startup treba odbiti praznu ili wildcard konfiguraciju uz credentials. Dev fallback mora biti eksplicitan po environmentu.
- Provjeriti trusted proxy hop count prema stvarnoj topologiji; ne mijenjati `trust proxy` samo da bi se utišao audit bez provjere da direktni klijenti ne mogu falsifikovati forwarded headers.

**Prihvatanje:** dva paralelna setup zahtjeva daju tačno jednog pobjednika; production startup ne može raditi sa otvorenim CORS/setup defaultom; dev režim i dokumentovani deployment i dalje rade.

## 5. Talas 2 — atomičnost identiteta i dodjela pristupa

### 2.1 Atomarni `UsersService.update()`

- Prije koda nacrtati sve entitete koje update može mijenjati: user, role, moderator/org/warehouse/registrar dodjele i povezani employee podaci.
- Premjestiti assignment delete/create i user promjene u jednu Prisma transakciju; validacije koje zavise od baze ponoviti u transakciji.
- Invalidirati auth/scope cache **nakon commit-a**. Ako invalidacija ne uspije, koristiti pouzdan retry/event mehanizam ili kratak TTL kao dodatnu mitigaciju, ne prijevremeno brisanje.
- Testirati rollback na grešci svakog koraka, downgrade role-a, self-edit, moderator granice, duplu dodjelu i paralelnu izmjenu.

**Prihvatanje:** ni jedan neuspjeli update ne ostavlja djelimično izbrisane/dodijeljene scope-ove; endpoint poruke za validation/unique conflict ostaju stabilne.

### 2.2 Atomarna refresh rotacija i sesijski životni ciklus

- Uvesti compare-and-set revoke (`where revokedAt IS NULL`) i provjeriti da je pogođen tačno jedan red; novi token se kreira u istoj transakciji.
- Paralelni refresh test: od dva istovremena zahtjeva najviše jedan izdaje novi validan refresh token; drugi dobija kontrolisani unauthorized odgovor.
- Provjeriti logout, expiry, revoke, password/account deactivation i cleanup starih refresh redova.
- P2 retention: `RefreshTokenCleanupService` jednom dnevno (03:00 UTC) briše istekle redove u batch-ovima do 20.000 po pokretanju; složeni `(expiresAt, id)` indeks podržava determinističko skeniranje, a preostali redovi se nastavljaju narednim danom. Testovi pokrivaju aktivne tokene, batch limit i cleanup rezultat.
- Dodati metrike za refresh failure/reuse bez logovanja tokena ili token hash-a.

**Prihvatanje:** dupli refresh ne može proizvesti dvije aktivne rotacije; logout/deactivation ponašanje je pokriveno integration testom.

### 2.3 Jedinstvena invalidacija deaktiviranog korisnika

- Napraviti shared servis/API za promjenu aktivnog statusa i auth-cache invalidaciju; koristiti ga iz Users i Employees toka.
- Pri deaktivaciji opozvati relevantne refresh tokene prema odobrenoj sesijskoj politici.
- WebSocket: provjeriti korisnika i status pri connect-u; za aktivne sesije uvesti event/registry kojim se konekcije deaktiviranog korisnika odmah prekidaju. Provjera samo pri connect-u nije dovoljna ako zahtjev traži trenutni revoke.
- Testirati REST nakon deaktivacije, WebSocket već otvoren prije deaktivacije, reconnect i drugi backend instance.

**Prihvatanje:** deaktivirani user ne dobija novi REST/WS pristup; cache ne produžava pristup izvan dogovorene granice.

## 6. Talas 3 — pouzdanost inventurnog zatvaranja i background poslova

### 3.1 Definisati jedan state machine

Prije implementacije dogovoriti tačno značenje i prelaze za inventory close, npr.:

`queued → running → done | failed` (sa lease-token/expiry recovery za napušteni `running` posao)

- **Odluka vlasnika procesa:** inventurna sesija ostaje zatvorena i pending action greške se evidentiraju; retry iscrpljen ili trajna/business greška ostaje `failed` uz `failedCount`.
- **Odluka o retry-u:** samo poznate prolazne DB/connection greške dobijaju najviše 3 pokušaja ukupno, sa eksponencijalnim čekanjem 250 ms pa 500 ms (cap 2 s); business/validation i neklasifikovane greške se ne ponavljaju. Retry izvršava close worker u okviru obrade akcije; BullMQ i dalje upravlja retry-em samog close posla.
- Lease/heartbeat recovery je implementiran: lease traje 2 minute, heartbeat se obnavlja svakih 30 sekundi, a reconciler ponovo enqueue-a queued i istekle running poslove. Ručni retry je zaseban, admin-only tok samo za `failed` posao dok je sesija još `closing`; zahtijeva razlog (5–500 znakova) i u istoj DB transakciji bilježi audit zapis. Završena sesija/job se ne mogu ponovo otvoriti.

### 3.2 Atomarni claim, idempotency i recovery

**Pending-action retry implementacija:** `applyPendingAction()` sada ponavlja samo eksplicitno allowlistane prolazne Prisma/PostgreSQL/network greške, najviše 3 pokušaja ukupno, uz 250/500 ms backoff. Trajne, business i nepoznate greške ne dobijaju retry: akcija se bilježi kao `failed`, a close worker nastavlja i zatvara sesiju uz `failedCount > 0`, po odobrenoj poslovnoj odluci. Pokušaji uključuju početni claim i dodatne retry pokušaje. Relocation finalize već je idempotentan preko terminalnog transfer statusa; direktni relocation retry prepoznaje ciljano warehouse/person stanje nakon mogućeg ambiguous commit-a. Disposal retry u istoj sesiji sada ne resetuje terminalni review status i za pending zapis mijenja samo line link pod uslovom da status i dalje `pending`; nova sesija i dalje otvara novi pending review.

Dodani su unit testovi za retry, lease claim i reconciler te PostgreSQL integracija koja u child procesu uradi disposal approval commit pa ga prisilno prekine sa `SIGKILL` prije statusa akcije; worker oporavi lease i replay potvrđuje da postoji samo jedan approval. Osnovni lease recovery prošao je CI run `40231642660` (426 backend unit testova), a stvarni process-kill/replay scenario prošao je CI run `40232428101`. Nova migracija, Prisma validacija, PostgreSQL/Redis integracije, lint, typecheck, build i 432 unit testa prošli su u CI run-u `40234427074`. Prethodni run `40234238392` otkrio je zastarjele test-double metode u process-kill integraciji; ažurirane su u commit-u `59f8942` prije uspješnog rerun-a.

- Implementirano: conditional DB claim uz unikatni lease token, expiry od 2 minute i heartbeat svakih 30 sekundi. Pri takeover-u se pending actions ostavljene `running` atomarno vraćaju u `pending`; terminalne akcije se ne diraju.
- Progress brojači i terminalni action status se commituju u jednoj transakciji pod istim lease tokenom; close-job finalizacija i session zatvaranje su također transakcijski. API response mapperi izostavljaju interne lease kolone, pa response shape ostaje nepromijenjen.
- Relocation/disposal DB promjene su zaštićene replayom. Notification outbox je uveden za disposal approval pending i zatvaranje sesije: idempotentni outbox zapisi se kreiraju u istoj DB transakciji kao approval/session close, a relay upsert-a jednu Notification po outbox ID-u. Socket.IO je at-least-once signal: pad nakon emit-a, a prije mark-as-delivered može proizvesti dupli event; REST Notification zapis ostaje jedinstven i trajno čitljiv.
- Ako se DB queued zapis kreira, a `queue.add()` padne, status ostaje retryable; startup/periodični reconciler sada traži queued poslove i running poslove sa isteklim ili starim null lease-om, uz deterministički recovery job ID.
- Admin-only `POST /inventory-sessions/:id/close-job/retry` prihvata obavezan razlog, upisuje audit zapis i vraća samo failed posao sesije koja je i dalje `closing` u `queued`. Kompletirana sesija i job nisu retryable. Ako Redis enqueue ne uspije, DB zapis ostaje queued za postojeći reconciler.
- Dodan PostgreSQL CI test `check-inventory-pending-action-outcomes.ts`: nad stvarnim DB close-job/action zapisima injektuje dvije poznate prolazne greške pa uspješan treći pokušaj, te trajnu grešku za drugu akciju. Provjerava tačno tri pokušaja za transient, bez retry-a za permanent, `failedCount`/`lastError` evidenciju i da se sesija ipak zatvori sa close jobom `done`. Dvije worker instance istovremeno dobijaju isti job; test provjerava da DB lease claim dopušta samo jednom da primijeni akcije. Izabrani pending-action ugovor prošao je run `40315214840`; proširena provjera duple worker isporuke i atomičnog claim-a prošla je zajedno sa ostalim CI provjerama u run-u `40320587282`.
- Proširen `check-inventory-close-reconciler-concurrency.ts`: `closeSession()` prvo komituje `closing/queued`, dok enqueue mock simulira Redis grešku nakon commita; zatim dvije reconciler instance istovremeno čitaju durable DB job i dodaju ga u stvarni BullMQ/Redis queue. Test provjerava da posao ostane retryable i da deterministički recovery ID bude u queue-u tačno jednom. PostgreSQL/Redis integracija i kompletni backend/frontend/document-worker CI prošli su u run-u `40317337619`; prošireni scenario (enqueuing failure + simultaneous reconciliation) također je prošao run `40320587282`.
- Dodan `check-inventory-manual-close-retry-race.ts` za dva admin zahtjeva nad istim failed jobom: test sinhronizuje transakcije nakon čitanja `failed` statusa, pa provjerava da conditional update daje jednog pobjednika, jedan kontrolisani `ConflictException`, samo jedan queue enqueue i tačno jedan audit red sa actor-om i normalizovanim razlogom. Cijeli backend/PostgreSQL/Redis, frontend i document-worker CI prošao je u run-u `40318393918`.

### 3.3 Fault-injection i prihvatanje

Testirati najmanje:

- Redis nedostupan prije i poslije DB enqueue zapisa.
- Worker proces se ugasi tokom obrade i nakon side effect-a, ali prije DB completion statusa.
- Isti job isporučen dva puta ili paralelno na dvije worker instance.
- Retry admin-only na failed close job dok je sesija još `closing`, odbijanje za već zatvoren session/job i audit trail razloga.
- Djelimično neuspjela pending action i odluka o finalnom session statusu.
- Reconciler pokrenut istovremeno na dvije backend instance.

**Prihvatanje:** nijedan validan posao ne ostaje trajno u `closing/queued/running` bez vlasnika; retry je dokazano bez duplih poslovnih posljedica; stanje API-ja i UI-ja odgovara dogovorenom poslovnom ishodu.

### 3.4 Outbox za kritične side-effecte

Transactional notification outbox je uveden za događaje koji nastaju pri inventory close obradi: disposal approval pending i inventory session closed. Ostale, nepovezane notification tokove nisu obuhvaćeni ovim paketom.

- Business row i per-user outbox zapisi nastaju u istoj PostgreSQL transakciji; jedinstveni idempotency key sprečava dupliciranje pri replay-u.
- Relay claim-a event uz lease, kreira Notification preko unique `outboxId` upsert-a i tek onda emituje Socket.IO signal. Greške se retry-uju bez gubitka outbox reda, uz eksponencijalni backoff od 5 sekundi do najviše 1 sata; istekli `running` lease se preuzima nakon restarta.
- Socket.IO je at-least-once; ponovljeni signal nosi isti Notification ID. Persisted Notification/outbox su izvor istine, a klijent može deduplikovati po ID-u.
- Unit testovi pokrivaju stabilan idempotency key, `skipDuplicates` i notification upsert prije emit-a. Dodan je `check-notification-outbox-crash-replay.ts`: child relay uradi stvarni PostgreSQL notification upsert, zabilježi emit side-effect pa se prisilno ugasi prije mark-as-delivered; parent provjerava istekli lease recovery, ponovni emit istog Notification ID-a, tačno jedan DB Notification i terminalni `delivered` outbox status. Hosted CI run `40321346138` prošao je process-kill/replay integraciju, PostgreSQL/Redis provjere, lint, typecheck, backend unit/build, frontend i document-worker provjere.

**Prihvatanje:** commit approval-a/session close ne može izgubiti odabrani outbox event; ponovljeni relay ne kreira dupli Notification DB zapis.

## 7. Talas 4 — konkurentnost i domenske invarijante

### 4.1 Transferi i promjene statusa

- Conditional status transition za finalize/cancel/markPrinted već koristi affected-row count; unit testovi `claim-transfer-finalize.util.spec.ts` pokrivaju otvoreni claim, uže tranzicije i odbijanje nakon konkurentne terminalne promjene.
- Gdje stanje više redova mora mijenjati zajedno, koristiti transakciju i dosljedan lock/update redoslijed.
- **Post-commit rizik — implementirano i CI-verifikovano:** transfer create/finalize sada atomarno upisuje notification outbox događaje u istoj transakciji kao poslovnu promjenu; stock-lot issue radi isto. Primaoci dobijaju idempotentne `transfer:<id>:<type>:<userId>` ključeve, a postojeći relay pravi trajne Notification zapise prije ponovljivog Socket.IO signala. Direktni post-commit notification loopovi su uklonjeni; crash/replay test je prošao u CI run-u `40321346138`.
- Odabrani ugovor je da poslovni commit pobjeđuje: DOCX render više ne blokira/poništava create/finalize. Migracija dodaje DOCX status, pokušaje, lease token/expiry i grešku; queued/stale-running poslovi se obrađuju kroz 5-sekundni reconciler, a lease claim je atomaran. Greške prelaze u `failed`, HTTP transfer akcija ostaje uspješna, a postojeći retry endpoint ponavlja DOCX kada nedostaje/neuspješan je pa PDF konverziju. Status endpoint sada vraća DOCX state i dostupnost, a `TransferDocumentPanel` prikazuje stanje, poll-uje queued/running i nudi ručni retry za failed.
- Uklonjena je pre-commit provjera aktivnog predloška: nedostajući/neispravan predložak je dokumentacijski neuspjeh koji se evidentira nakon commita. API DTO ne izlaže lease token, pokušaje, interne greške ni generated file paths. Otkazani transferi se ne claim-uju za DOCX generisanje.
- Nova PostgreSQL CI integracija ubija stvarni child worker sa `SIGKILL` nakon što DOCX postoji na disku, ali prije DB finalize update-a. Provjerava `running` + lease, odsutan DB path i prvi pokušaj, zatim ističe lease, poziva stvarni reconciler i potvrđuje drugi pokušaj, `done`, očišćen lease/error i čitljiv konačni DOCX na determinističkoj putanji. Proširena je da ubije drugi worker poslije DOCX DB finalize-a, ali prije PDF enqueue-a: potvrđuje da nema `DocumentJob`, a zatim poziva stvarni PDF download fallback (koji delegira na `retryPdfGeneration()`) i `DocumentConversionQueueService` sa kontrolisanim BullMQ adapterom te provjerava HTTP `409 processing` i kreiranje queued DB posla sa ispravnim izvorom, ciljem i Bull job ID-em. Time se dokazuje eksplicitni retry put za oba crash prozora. Proširena integracija je prošla u hosted PostgreSQL CI run-u `40326482157` zajedno s backend lint/typecheck/unit/build, frontend i document-worker provjerama.
- Nova PostgreSQL + Redis CI integracija ubija proces unutar `DocumentConversionQueueService.queue.add()` nakon što je stvarni `DocumentJob` već commitovan, ali prije nego što Redis/BullMQ primi posao. Provjerava orphan `queued` red bez `bullJobId`, zatim pokreće stvarni `DocumentConversionEventsService.onModuleInit()` i provjerava da nedostajući BullMQ posao postaje `failed` sa retry porukom; ponovni enqueue mora napraviti novi `DocumentJob` i BullMQ ID, uz sačuvan failed red kao audit istoriju. Test je dodatno otkrio da je enqueue servis vraćao stale objekat bez upravo vezanog `bullJobId`; `attachBullJobId()` sada vraća ažurirani DB red pa je i rezultat enqueue-a konzistentan. Startup recovery sada ne proglašava job izgubljenim tokom prvih 60 sekundi (mogući enqueue u drugoj instanci), a reconciler provjerava aktivne poslove svakih 30 sekundi. Osnovni crash/retry test je prošao u hosted CI run-u `40330663082`.
- Dodana PostgreSQL + Redis integracija simulira izgubljeni `completed` QueueEvent: stvarni BullMQ worker završi posao nakon prve reconciliation provjere, dok DB red ostane `running`; naredni periodic reconcile čita stvarno `completed` stanje i popravi DB na `done`. CI/npm wiring je dodan, a test je prošao u hosted PostgreSQL + Redis run-u `40333051652` zajedno s backend lint/typecheck/unit/build, frontend i document-worker provjerama.
- Zatvorena je utrka između asinhronih `active`/`completed`/`failed` QueueEvents handlera: `DocumentJobsService` sada uslovno mijenja status samo iz `queued`/`running`, pa su `done` i `failed` terminalni. Event servis i reconciler izvršavaju sinhronizaciju PDF putanje i Socket.IO notifikaciju samo kada conditional update stvarno pobijedi. Zakašnjeli `active` više ne vraća završeni posao u `running`, duplicirani terminalni eventi ne ponavljaju domenske efekte, a kasniji `incrementAttempts` ne mijenja terminalni brojač pokušaja. Dodana su dva unit testa za side-effect idempotentnost, a PostgreSQL/Redis integracija pokriva oba terminalna statusa. Lokalno su prošli lint i svih 438 unit testova; hosted PostgreSQL + Redis CI run `40336974440` potvrdio je integraciju, backend typecheck/unit/build, frontend i document-worker provjere.
- Dodan unit test za stabilne per-recipient transfer outbox ključeve. Lokalno su prošli backend lint, svih 434 backend unit testa i frontend production build. Lokalni Prisma generate/backend typecheck/build nije moguć jer schema-engine preuzimanje sa `binaries.prisma.sh` pada TLS handshake-om. Prvi hosted CI run `40238066222` našao je nepodudaranje povratnog DTO tipa nakon uklanjanja internih fields; tip je korigovan u `a733a48`. CI `40238184749` je potom prošao migraciju/shema validaciju, PostgreSQL/Redis integracije, backend/frontend/document-worker typecheck, testove, buildove i dependency audit.

**Prihvatanje:** poslovni commit ostaje uspješan uz kasniji notification/DOCX kvar; outbox je trajan i idempotentan, DOCX status/retry je vidljiv, a CI potvrđuje migraciju, typecheck/build i konkurentnost.

### 4.2 Warehouse stock i maintenance lotovi

- Zamijeniti pre-check + decrement sa atomic conditional decrement gdje je moguće (`quantityOnHand >= requested`) i provjeriti pogođeni red.
- U istoj transakciji zapisati movement/event i povezanu opremu/maintenance promjenu.
- Maintenance part statusi (faulty/remove/replace) i disposal approval review koriste conditional update; promjene opreme, zaliha i eventi ostaju u istoj transakciji.
- Implementirano nakon odluke vlasnika: `BulkCreateStockLotDto.items` ima gornju granicu od 100 unosa; DTO test potvrđuje da 100 prolazi, a 101 se odbija. Backend/PostgreSQL/Redis CI run `40235730013` prošao je lint, typecheck, unit testove, migracije i build. Obrada unutar transakcije i dalje je serijska, pa batching treba razmatrati tek uz mjerenje trajanja.
- Zatvoreno: uklonjene su serijske `canAccessStockLot` provjere za svaki red u `listMaintenanceLots` i `listAvailableLotsForHost`. Oba endpointa sada dodaju `RegistrarScopeService.buildStockLotWhere(user)` u Prisma `where` filter, čime se scope primjenjuje u bazi koristeći isti shared predicate kao warehouse-stock list; sačuvani su admin/keeper pristup i fail-closed ponašanje za non-registrar role. Novi service testovi potvrđuju oba query filtra i da per-lot authorization više nije pozvan. Backend lint i 436 unit testova prošli lokalno; hosted CI run `40285691141` je potvrdio Prisma generation, PostgreSQL/Redis integracije, typecheck, build, lint, unit testove i frontend/document-worker provjere. Lokalni `tsc --noEmit` nije validan bez generisanog Prisma clienta (lokalni `prisma generate` je ranije blokiran TLS-om).
- PostgreSQL test `check-stock-lot-decrement-race.ts` pokreće dvije transakcije koje istovremeno pokušavaju potrošiti posljednju jedinicu kroz isti helper; potvrđuje tačno jedan uspjeh, jedan kontrolisani insufficient-stock odgovor, quantity 0 i zatvaranje lota. Test je dodat u obavezni branch CI i prošao u run-u `40282514202`.

**Prihvatanje:** quantity nikad nije negativan niti se potrošnja evidentira bez odgovarajućeg lot movement-a.

### 4.3 Inventura, komisije i scheduler

- `recordLine` i `recordWarehouseLine` sada zaključavaju aktivnu parent sesiju (`SELECT ... FOR UPDATE`) u istoj transakciji prije upisa; oba committee-close toka koriste isti session lock, a committee status se provjerava ponovo nakon zaključavanja.
- PostgreSQL CI integration test sada koristi dvije stvarne transakcije: record-side čeka dok close-side zaključa i zatvori aktivnu sesiju; nakon otključavanja helper ponovo provjerava status i odbija kasniji write. Test je prošao u CI run-u `40221562648`; unit test pokriva active-session guard rezultat.
- PostgreSQL CI integration test pokreće dvije istovremene review transakcije nad istim pending disposal approval zapisom; tačno jedna mora commit-ovati terminalni status, a druga dobiti `Approval already reviewed`. Scenario je prošao u CI run-u `40222094387`; CI je time pokrio close-vs-record i disposal-review race, dok pending-action retry još traži zaseban Postgres integration scenario.
- Inventory cron je sada eksplicitno vezan za 00:05 UTC; `inventory.scheduler_timezone` se koristi za poslovni kalendarski datum, a invalidna IANA zona se loguje i preskače bez rušenja scheduler procesa.
- Redis lease se obnavlja svakih 5 minuta preko token-checked Lua `PEXPIRE`; 15-minutni TTL i dalje čisti lease nakon pada procesa, a token-checked release sprečava brisanje tuđeg locka.
- Unit testovi pokrivaju vlasnički token i TTL argumente; live Redis CI test potvrđuje renewal/TTL/release, deterministički timestamp testovi pokrivaju DST promjene i granicu godine.

**Prihvatanje:** zatvorena komisija/sesija ne prima kasniji write; isti periodični job se ne izvršava duplo; timezone prelazi imaju jedno očekivano ponašanje.

### 4.4 Kategorije i numeric settings

- Parent promjena u kategoriji se validira u transakciji pod PostgreSQL advisory transaction lock-om; nakon lock-a se ponovo čita cijelo stablo, pa dva paralelna reparent-a ne mogu zajedno uvesti ciklus. Prisma raw lock query vraća serializabilan integer umjesto PostgreSQL `void` rezultata. Unit testovi pokrivaju self/descendant i validno reparentovanje; stvarni PostgreSQL test za dva paralelna update-a prošao je u CI run-u `40283745919`.
- `upload.max_mb`, `lists.default_page_size` i `lists.max_page_size` sada odbijaju non-finite vrijednosti, pogrešan tip, decimale i vrijednosti izvan key-specific raspona; dodatno se provjerava `default_page_size <= max_page_size`. Boolean settings odbijaju neprepoznate stringove umjesto da ih tiho pretvore u `false`.
- Svaki novi numeric setting mora deklarisati odgovarajući min/max/integer policy u registry-ju.

**Prihvatanje:** kategorijsko stablo je aciklično; nevažeći setting se odbija sa field-level 400 prije upisa/cache invalidacije.

#### Settings default initialization (P2 — implementation added)

- `SettingsService.ensureDefaults()` sada koristi registry-driven upsert-e u jednoj Prisma transakciji; višestruke replike mogu sigurno inicijalizovati iste ključeve bez check-then-create race-a.
- Postojeće admin vrijednosti ostaju netaknute, a registry metadata se usklađuje; cache ključevi se invalidiraju tek nakon uspješnog commit-a.
- Unit test pokriva transakcijsku granicu i cache invalidaciju; hosted CI ima PostgreSQL test koji istovremeno pokreće dvije inicijalizacije i provjerava da nema duplih/izgubljenih vrijednosti.

### 4.5 CSV i javni QR

- CSV: zaštititi ćelije koje spreadsheet može tretirati kao formulu (`=`, `+`, `-`, `@` i relevantni leading control/whitespace slučajevi), uz test Excel/LibreOffice kompatibilnosti; escaping delimitera sam po sebi nije dovoljan.
- Ograničiti broj export redova ili koristiti streaming; definisati timeout/memorijski budžet. Testirati response prekid i velika, ali dozvoljena izvlačenja.
- Javni QR: vlasnik procesa je odabrao zadržati postojeći DTO, uključujući ime/titulu/organizacijski put i historiju kretanja; ova odluka ne uklanja privacy rizik ni potrebu za redovnim preispitivanjem.
- Anti-enumeration bez nepotrebnog odavanja da li ID postoji; load test na cache miss-u.

#### Javni QR rate limit (P2 — implementation added)

- `GET /public/equipment/:id` sada koristi poseban Redis fixed-window bucket po klijentskoj IP adresi, nezavisan od login bucket-a; podrazumijevano 60 zahtjeva u 60 sekundi, višak dobija 429.
- `RATE_LIMIT_PUBLIC_EQUIPMENT_MAX`, `RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC` i `RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED` dokumentovani su u `.env.example` i proslijeđeni kroz oba Compose deploymenta; konfiguracija se strogo validira. Outage ponašanje je fail-open po defaultu, uz opciju 503 fail-closed.
- Guardovi su registrovani u odgovarajućim Nest modulima i Redis zavisnost se injektuje eksplicitnim tokenom; HTTP integration test pokreće stvarnu Nest rutu, potvrđuje 429 na trećem pozivu i da odbijeni zahtjev ne dođe do service sloja. Unit testovi pokrivaju route guard metadata, odvojene Redis ključeve, prag/prozor, neispravnu konfiguraciju i Redis outage policy.
- Vlasnik procesa je odabrao zadržati postojeći javni response DTO, uključujući historiju transfera; ovaj paket nije mijenjao javna polja. Anti-enumeration/load test ostaju otvoreni; rate limit ne mijenja response DTO.

**Prihvatanje:** export ne izvršava formule i ima predvidivu gornju granicu; javni QR response je dokumentovan i privacy-odobren.

## 8. Talas 5 — API ugovori, health, observability i release zaštita

### 5.1 DTO i autoritativna autorizacija

- Zamijeniti interface/inline `@Body()` tipove class DTO-ima sa `class-validator` pravilima, `transform`, max length i enum/range validacijom.
- Dodati e2e/controller testove da nepoznata polja budu odbijena i da invalid payload ne dođe do service/database sloja.
- Proći kroz scope-sensitive list/detail/write rute: testirati drugi tenant/org/warehouse i potvrditi da se ne može doći do podataka preko ID-a ili relacije.
- Uskladiti query string enum/ID tipove i explicit allow-list za generičke upload/entity rute.

#### Transfer-template upload DTO (P2 — implementation added)

- Multipart `label` se sada validira kroz DTO: optional string, najviše 120 znakova, a nepoznata polja se odbijaju. Time se sprečava 500 greška zbog pogrešnog tipa ili prekoračenja PostgreSQL `VarChar(120)` limita.
- Unit test pokriva odsutan/validan label, pogrešan tip, predugu vrijednost i nepoznato polje; lint i 407 unit testova, uz puni CI run `40223006751`, prolaze.

#### Bounded pagination offsets (P2 — implementation added)

- `parsePagination()` i direktni `paginate()` pozivi sada odbijaju `skip` iznad 100.000 redova sa HTTP 400; neskalabilan offset više ne može postati neograničen DB scan.
- Testovi pokrivaju granicu, prevelike/nesigurne page vrijednosti i potvrđuju da direktni `paginate()` odbije zahtjev prije bilo kojeg DB upita. Za dublje navigacije treba uvesti cursor-based endpoint, ne povećavati limit bez mjerenja.

### 5.2 Health i runtime observability

#### Liveness and readiness probes (P2 — implementation added)

- `GET /health/live` je process-only liveness endpoint i ne zavisi od DB/Redis/queue dostupnosti. `GET /health/ready` ostaje readiness provjera PostgreSQL-a, shared Redis-a i obje kritične BullMQ queue konekcije, sa timeout-om po provjeri.
- Legacy `GET /health` zadržava postojeći DB-only ugovor radi kompatibilnosti; Compose healthchecks u oba deployment fajla koriste `/health/ready` i računaju globalni `API_PREFIX` (uključujući prazan prefix). Orkestrator može koristiti `/health/live` za liveness i `/health/ready` za prijem saobraćaja.
- Unit test potvrđuje da liveness ostaje `ok` i kada su sve zavisnosti nedostupne; testovi, typecheck i build prošli su u CI run-u `40224257666`.

#### Login rate-limit resilience (P2 — implementation added)

- `RedisRateLimitGuard` je eksplicitno registrovan u `AuthModule` (isto kao public QR guard u svom modulu), tako da Nest može injektovati Redis servis u rutu označenu sa `@UseGuards`.
- `RedisService.incrementRateLimitCounter()` koristi jednu Lua skriptu za `INCR` i TTL; ključevi bez TTL-a iz ranijih verzija popravljaju se pri narednom hitu, bez promjene fixed-window semantics.
- `RATE_LIMIT_LOGIN_FAIL_CLOSED=false` zadržava postojeći fail-open default; `true` vraća 503 kad Redis nije dostupan. Max/window i policy vrijednosti se validiraju pri pokretanju.
- Unit testovi pokrivaju Lua poziv, input/response validaciju i oba outage režima; branch CI izvršava i live Redis test sa paralelnim inkrementima, expiry provjerom i legacy TTL repair.
- Failure se trenutno bilježi preko warn/error loga; zasebna rate-limit Redis failure metrika ostaje otvorena uz širu observability implementaciju.

- Razdvojiti liveness (proces/event loop) i readiness (zavisnosti potrebne za prijem saobraćaja).
- Odrediti šta se smatra obaveznim za readiness: DB svakako; Redis/queue prema degradacijskom ugovoru pojedinih funkcija. Ne označavati cijeli servis unhealthy zbog opcionalnog feature-a ako aplikacija može sigurno degradirati.
- Dodati metrike: DB pool/latency, Redis ready/reconnect, queue depth/lag/retry/failed jobs, upload reject counts, inventory close age/status, request latency/error rate.
- Dodati request/correlation ID kroz HTTP, logove i job metadata; redigovati authorization header, lozinke, refresh token, PII i upload sadržaj/putanje.
- Strukturirani logovi i javne error poruke trebaju biti različiti: korisniku stabilan code/message, logu correlation ID i sanitizovan interni razlog.

### 5.3 CI/release gate

Obavezni pipeline prije release-a:

1. `npm ci` iz lockfile-a.
2. Backend unit tests.
3. Postgres integration suite na čisto migriranoj bazi.
4. API/e2e auth-scope-DTO testovi.
5. Redis/BullMQ recovery integration tests za kritične jobove.
6. Backend i document-worker build.
7. `npm audit`/advisory review uz documented exceptions.
8. `prisma migrate deploy` rehearsal i schema drift test.

**Prihvatanje:** release se blokira na regresiji P1, migracijskom drift-u, scope/auth test failure-u, build failure-u ili neodobrenom critical/high runtime advisory-u.

## 9. Talas 6 — refaktor i performanse

Refaktor se radi tek poslije testova koji fiksiraju ponašanje.

### Predloženi red

1. `InventoryCountService`: odvojiti session lifecycle, committee workflow, disposal, pending actions i worker orchestration.
2. `TransfersService`: odvojiti policy/scope, status transition, numbering/document side effects i read/report query.
3. `WarehouseStockService` i `MaintenancePartsService`: lot accounting/use-case boundaries.
4. `EmployeeRelocationService`: preview/read model, case lifecycle i inventory/notification side effects.
5. `EquipmentService`/`NotificationsService`: query/export/recipient resolution i persistent delivery.

### Pravila za svaki refaktor

- Prvo characterization tests za postojeće očekivano ponašanje.
- Refaktor bez promjene API response/statusa/poslovnog pravila u istom PR-u.
- Mjeriti SQL query count i p95 na reprezentativnom dataset-u prije/poslije.
- Rješavati N+1 samo uz dokaz da utiče na kritični tok; uvesti batch query i sačuvati scope filter.
- Provjeriti Postgres pool budžet: broj replika × pool max + worker, migracije i maintenance procesi.
- Uklanjati circular module dependency (`Settings ↔ Notifications`) tek uz jasan port/event contract.

**Prihvatanje:** javni API i poslovni ishodi ostaju isti; testovi prolaze; izmjerena performansa se ne pogoršava i ciljani query/latency budžet je zabilježen.

## 10. Za svaki implementacijski paket

Svaki PR/izdanje treba sadržavati:

- **Problem i referencu:** audit nalaz, konkretna putanja i reprodukcijski korak.
- **Očekivano ponašanje:** pravilo prije koda, posebno za djelimične greške i retry.
- **Testovi:** unit za čistu logiku, integration za DB/Redis, e2e za HTTP/role scope, race/fault-injection za konkurentne tokove.
- **Operativni uticaj:** migracije, env varijable/secrets, filesystem/queue zahtjevi, rollout redoslijed.
- **Rollback:** može li se vratiti samo app kod; treba li unaprijed kompatibilna migracija; kako oporaviti queued jobs/orphan fajlove.
- **Metrika i alert:** kako će se potvrditi da je fix aktivan i kako otkriti regresiju.
- **Korisnički uticaj:** promjena poruke, statusa, javnih podataka, limita ili retry ponašanja mora biti navedena.

## 11. Završni kriteriji za zatvaranje backend audita

Backend audit se može označiti kao implementiran kada su ispunjeni svi sljedeći uslovi ili je preostali rizik formalno prihvaćen:

- Critical/high runtime dependency nalazi riješeni ili dokumentovani sa vlasnikom i rokom.
- Upload veličina/sadržaj ograničeni prije parsiranja; storage ima cleanup/reconciliation.
- HTML/CSV output ne izvršava markup/formule iz poslovnih podataka.
- Setup, user assignment i refresh rotacija imaju atomarnost i race testove.
- Inventory close/critical queue poslovi imaju idempotency, retry/reconciliation i fault-injection dokaz.
- Kritični stock, transfer i inventory state transitions su conditional/transactional i testirani konkurentno.
- Public QR contract ima privatnosnu odluku, limit i rate-control.
- CORS, trust proxy, PostgreSQL TLS/CA, Redis TLS/ACL potvrđeni u staging/deployment konfiguraciji.
- CI izvršava unit + integration + e2e/scope + build + migration provjere; migration README je tačan.
- Health/telemetry mogu otkriti DB/queue/upload/state probleme bez izlaganja tajni/PII.
- Promjene velikih servisa imaju characterization tests i mjerljive performansne kriterije.

## 12. Odluke koje traže vlasnika poslovnog procesa

Prije implementacije ovih tačaka tražiti izričitu potvrdu:

1. **Riješeno:** inventurna sesija se zatvara i uz pending-action greške; svaka trajna/neispravljiva greška ostaje evidentirana kao failed.
2. Koji podaci i koliko historije treba javni QR prikazati neautentifikovanom korisniku?
3. Koje su maksimalne legitimne PDF/DOCX veličine i šta korisnik treba vidjeti pri odbijanju?
4. **Riješeno za transfer i inventory close:** korisnik odabrao trajni outbox za notification događaje, uz Socket.IO kao ponovljiv signal; transfer DOCX/PDF dokumentacijski rad ima trajni status i zaseban retry, a transfer poslovni commit pobjeđuje naknadni document/notification kvar.
5. **Riješeno:** automatski retry je ograničen na allowlistu prolaznih grešaka (maksimum 3 pokušaja, 250/500 ms backoff); ručni retry close joba dozvoljen je samo administratoru, traži razlog i audit zapis, i ne može ponovo otvoriti zatvorenu sesiju.
6. Koje vrijeme (timezone) je autoritativno za automatsko otvaranje/zatvaranje inventurnih perioda?
7. Koji je dozvoljeni recovery prozor za deaktiviran korisnički pristup preko postojećih WS konekcija i tokena?
