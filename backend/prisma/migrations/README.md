# PostgreSQL migracije

Ovaj direktorij sadrži istoriju migracija koju koristi `prisma migrate deploy`:

1. `20260822185741_init_postgres` — početna PostgreSQL shema.
2. `20260830010442_add_document_jobs` — trajna tabela i indeksi za poslove konverzije dokumenata.
3. `20260831062751_document_jobs_active_source_unique` — djelimični unique indeks koji dozvoljava najviše jedan aktivan (`queued`/`running`) DocumentJob po paru `(sourceType, sourceId)`.
4. `20261025180000_add_refresh_token_expiry_index` — složeni indeks na `RefreshToken.expiresAt`/`id` za efikasno, batch-ovano uklanjanje isteklih refresh-token zapisa.

Posljednji indeks namjerno postoji samo u SQL migraciji jer Prisma schema DSL ne može izraziti njegov `WHERE` uslov. Ne uklanjati ga radi usklađivanja sa `schema.prisma`; indeks štiti od TOCTOU race-a pri konkurentnom enqueue-u. Promjene koje ga mijenjaju moraju uključiti novu pregledanu SQL migraciju i regresioni test.

## Arhivirana MySQL istorija

Stare MySQL migracije (36 fajlova sa `CREATE TABLE` backtick-ovima, `ENGINE=InnoDB`, `CHARACTER SET utf8mb4`, `DATETIME(3)` i slično) arhivirane su u `backend/prisma/migrations_mysql_backup/` samo kao istorijska referenca. Ne pokretati ih nad PostgreSQL bazom.

## Pravila za nove migracije

- `schema.prisma` je izvor za modele i indekse koje Prisma može izraziti. Kreirati novu migraciju kada se shema mijenja; ne uređivati migracije koje su već primijenjene u nekom okruženju.
- Pregledati generisani SQL, naročito destructive operacije, lock trajanje, indekse i podatkovne backfill-e. Ne koristiti `prisma db push` kao deployment mehanizam.
- Deploy raditi sa `prisma migrate deploy`. CI provjerava validnost Prisma sheme, primjenjuje cijelu migracionu istoriju na privremeni PostgreSQL i provjerava `prisma migrate status`.
- Prije release-a provjeriti i praznu bazu i kompatibilan upgrade put sa reprezentativne prethodne verzije; zabilježiti rollback/restore plan za promjene podataka.
- SQL-only objekte (uključujući partial indexe) dokumentovati ovdje i pokriti regresionim testom kako ih kasnija migracija ne bi slučajno izbrisala.

Vidi `migracija-mysql-postgres.md` u root-u repoa za istorijski kontekst prelaska sa MySQL-a na PostgreSQL.
