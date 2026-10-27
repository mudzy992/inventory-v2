# PostgreSQL migracije

Ovaj direktorij sadrži istoriju migracija koju koristi `prisma migrate deploy`:

1. `20260822185741_init_postgres` — početna PostgreSQL shema.
2. `20260830010442_add_document_jobs` — trajna tabela i indeksi za poslove konverzije dokumenata.
3. `20260831062751_document_jobs_active_source_unique` — djelimični unique indeks koji dozvoljava najviše jedan aktivan (`queued`/`running`) DocumentJob po paru `(sourceType, sourceId)`.
4. `20261025180000_add_refresh_token_expiry_index` — složeni indeks na `RefreshToken.expiresAt`/`id` za efikasno, batch-ovano uklanjanje isteklih refresh-token zapisa.
5. `20261025190000_add_inventory_close_leases` — lease tokeni/expiry za oporavak worker-a i pending akcija koje su ostale `running` nakon isteka vlasništva.
6. `20261025200000_add_notification_outbox_and_close_retry_audit` — idempotentni notification outbox i veza prema trajnom Notification zapisu, plus audit tabela admin retry zahtjeva za inventory close job.
7. `20261025210000_add_transfer_docx_generation_state` — trajni DOCX status, lease/attempt/error polja i backfill postojećih prenosnica za sigurnu asinhronu generaciju i zaseban retry.

Posljednji indeks namjerno postoji samo u SQL migraciji jer Prisma schema DSL ne može izraziti njegov `WHERE` uslov. Ne uklanjati ga radi usklađivanja sa `schema.prisma`; indeks štiti od TOCTOU race-a pri konkurentnom enqueue-u. Promjene koje ga mijenjaju moraju uključiti novu pregledanu SQL migraciju i regresioni test.

## Arhivirana MySQL istorija

Stare MySQL migracije (36 fajlova sa `CREATE TABLE` backtick-ovima, `ENGINE=InnoDB`, `CHARACTER SET utf8mb4`, `DATETIME(3)` i slično) arhivirane su u `backend/prisma/migrations_mysql_backup/` samo kao istorijska referenca. Ne pokretati ih nad PostgreSQL bazom.

## Pravila za nove migracije

- `schema.prisma` je izvor za modele i indekse koje Prisma može izraziti. Kreirati novu migraciju kada se shema mijenja; ne uređivati migracije koje su već primijenjene u nekom okruženju.
- Pregledati generisani SQL, naročito destructive operacije, lock trajanje, indekse i podatkovne backfill-e. Ne koristiti `prisma db push` kao deployment mehanizam.
- Deploy raditi sa `prisma migrate deploy`. CI provjerava validnost Prisma sheme, primjenjuje cijelu migracionu istoriju na privremeni PostgreSQL, provjerava `prisma migrate status` i pokreće `test:integration:migration-drift` (vidi dole).
- Prije release-a provjeriti i praznu bazu i kompatibilan upgrade put sa reprezentativne prethodne verzije; zabilježiti rollback/restore plan za promjene podataka.
- SQL-only objekte (uključujući partial indexe) dokumentovati ovdje i pokriti regresionim testom kako ih kasnija migracija ne bi slučajno izbrisala.

## Schema snapshot i nepromjenjivost historije

`prisma migrate deploy` na svježoj CI bazi uvijek ponavlja **trenutne** SQL fajlove — ako se već primijenjena migracija naknadno izmijeni, to se ne vidi. Zato `backend/prisma/schema-drift.manifest.json` (namjerno izvan `migrations/` da ne smeta Prisma engine-u) bilježi SHA-256 `schema.prisma` i svakog `migration.sql`, po redoslijedu primjene.

CI korak `Verify migration history and schema snapshot` (`npm run test:integration:migration-drift`) bez baze provjerava:

- da `schema.prisma` nije promijenjen bez nove migracije (hash se mora poklapati sa manifestom);
- da nijedan zabilježeni `migration.sql` nije prepravljen, obrisan ili preuređen;
- da ne postoji nova migracija koja nije upisana u manifest;
- da su imena direktorija `YYYYMMDDHHMMSS_slug` i strogo rastuća, da svaki sadrži tačno jedan neprazan `migration.sql` i da `migration_lock.toml` i dalje kaže `postgresql`;
- da SQL-only indeks `document_jobs_active_source_unique` i dalje postoji u tačno jednoj migraciji i da je dokumentovan u `schema.prisma` i ovom README-ju.

**Workflow za novu migraciju:** dodati direktorij sa pregledanim `migration.sql`, promijeniti `schema.prisma` ako je potrebno, zatim pokrenuti `npm run prisma:manifest` i commitovati ažurirani manifest zajedno sa migracijom. Ako se manifest ne regeneriše, CI odbija promjenu — to je namjerna zaštita od „schema drift"-a, a ne greška koju treba zaobići.

**Destruktivni SQL** (`DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `DROP TYPE`, `TRUNCATE`, `DELETE FROM`) u novoj migraciji mora imati eksplicitni pregled u istom fajlu:

```sql
-- migration-review: <zašto je uklanjanje sigurno i kako se radi rollback>
DROP TABLE "legacy_table";
```

Bez tog markera drift check ne prolazi. Svaka izmjena markera ulazi u code review. Unit testovi za sva pravila su u `backend/prisma/utils/migration-drift.util.spec.ts` (`npm run test:unit:migration-drift`).

Vidi `migracija-mysql-postgres.md` u root-u repoa za istorijski kontekst prelaska sa MySQL-a na PostgreSQL.
