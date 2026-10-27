# Upload read policy — autorizacija, allow-list i containment

## Šta je bilo pogrešno

`GET /uploads?entityType=...&entityId=...` je primao dva nevalidirana
`@Query('...') string` parametra. U `UploadsService.findByEntity()` se
autorizacija (`TransfersService.findOne`, koji primjenjuje warehouse/org scope
korisnika) pozivala **samo** ako je `entityType === 'transfer'`. Za bilo koju
drugu vrijednost — uključujući `equipment` i `other` iz Prisma enuma
`UploadEntityType` — provjera se preskakala i endpoint je vraćao metapodatke
uploada (uključujući interni `path`) bez ikakvog scope checka. Isti obrazac je
bio u `getFileStream()`: red sa `entityType !== 'transfer'` ili sa
`entityId = null` mogao se preuzeti bez autorizacije. Uz to se putanja iz baze
spajala sa `UPLOAD_DIR` preko običnog `join()`, bez containment provjere.

Iako danas aplikacija piše samo `transfer` redove, ovo je latentni
authorization-bypass: čim se doda novi tip uploada, njegovi fajlovi bi odmah
bili javno čitljivi za svakog autentifikovanog korisnika.

## Pravila (fail-closed)

1. **allow-list:** `UPLOAD_READABLE_ENTITY_TYPES = ['transfer']` u
   `backend/src/modules/uploads/upload-access-policy.util.ts`. Samo tipovi sa
   registrovanim autorizatorom smiju se čitati.
2. **Striktni DTO:** `ListUploadsQueryDto` koristi
   `@IsIn(UPLOAD_READABLE_ENTITY_TYPES)` za `entityType` i `@IsUUID()` za
   `entityId`. Globalni `ValidationPipe` (`whitelist: true`,
   `forbidNonWhitelisted: true`) odbija nepoznate tipove, loše id-jeve i
   dodatne query parametre prije nego servis uopće bude pozvan.
3. **Odbrana u dubinu:** servis ponovo poziva
   `requireReadableUploadEntityType()` — direktni interni pozivatelji ne mogu
   zaobići provjeru.
4. **Egzhaustivni autorizator:** `UploadsService.authorizeUploadRead()` je
   `switch` sa `const exhaustive: never = type` granom. Dodavanje novog tipa u
   allow-listu bez dodavanja `case` grane je **compile error**, a CI gate preko
   TypeScript AST-ja poredi oba skupa i puca ako se razlikuju.
5. **Stored-row provjera:** `requireAuthorizableStoredUpload()` odbija
   `ForbiddenException` za redove bez `entityId` i za tipove bez read politike.
   Nikad se ne pretpostavlja da je nepoznati tip javan.
6. **containment:** `resolveUploadAbsolutePath(root, relativePath)` koristi
   `resolve()` i provjeru prefiksa (`root + sep`), te odbija apsolutne putanje,
   `..`, Windows drive prefikse, backslash i NUL bajt. Primjenjuje se i na
   **write** i na **download** putanju. Simbolički linkovi se ne dereferenciraju
   — `UPLOAD_DIR` mora biti pouzdan direktorij.
7. **Bez curenja internih putanja:** `findByEntity()` više ne vraća `path`
   (frontend ionako koristi samo `id` i `mime`); `UploadMeta` tip je ažuriran.
   Ime fajla za download i dalje izvodi server iz sopstvenog reda.

## Kako dodati novi entity type

1. Dodati vrijednost u `UPLOAD_READABLE_ENTITY_TYPES`.
2. Dodati odgovarajući `case` u `authorizeUploadRead()` koji poziva scope
   provjeru vlasnika tog entiteta (nikad `return;` bez provjere).
3. Ažurirati `ListUploadsQueryDto` ako je potrebno (`@IsIn` se već poziva na
   konstantu, pa se automatski proširuje).
4. Pokrenuti `npm run test:integration:upload-read-policy` i unit specove;
   CI korak `Verify upload read allow-list and path containment` blokira merge
   dok se allow-lista i autorizatori ne poklope.

## Dokazi

- 14 unit scenarija: allow-lista/odbijeni tipovi, stored-row bez vlasnika,
  traversal payloadi (`../`, apsolutne putanje, drive prefiks, NUL, sibling
  direktorij), DTO validacija (`IsIn`, `IsUUID`, `forbidNonWhitelisted`),
  redoslijed `authorize → findMany`, izostanak `path` u selectu, uspješan
  download kroz pravi temp fajl, odbijeni download za neautorizovani tip i
  za escaping putanju.
- `backend/prisma/check-upload-read-policy.ts` — TypeScript compiler API gate
  koji poredi allow-listu i `case` grane, zabranjuje naslijeđeni
  `entityType as 'transfer'` cast i uslovnu autorizaciju, traži containment na
  obje putanje i provjerava da frontend više ne očekuje `path`.
