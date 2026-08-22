# Migracije (PostgreSQL)

Ova mapa je namjerno prazna nakon prelaska na PostgreSQL.

Stare MySQL migracije (36 fajlova, `CREATE TABLE` sa backtick-ovima, `ENGINE=InnoDB`,
`CHARACTER SET utf8mb4`, `DATETIME(3)`, itd.) su u dijalektu koji PostgreSQL ne razumije
i ne mogu se "replay-ovati" na novoj bazi. Arhivirane su u
`backend/prisma/migrations_mysql_backup/` isključivo kao istorijska referenca (ne pokretati ih).

Za PostgreSQL bazu, prva migracija se generiše iznova iz trenutne `schema.prisma` — vidi
`migracija-mysql-postgres.md` u root-u repoa, korak "Kreiranje sheme na Postgresu".
