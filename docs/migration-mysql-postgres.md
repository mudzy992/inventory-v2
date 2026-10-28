# Migracija: MySQL → PostgreSQL

Status: **PostgreSQL je sada primarna baza u kodu** (šema, driver adapter, `.env.example`).
MySQL je zadržan isključivo kao backup/rollback referenca — vidi sekciju
["Rollback na MySQL"](#rollback-na-mysql) na kraju.

Ovaj dokument pokriva ono što je pripremljeno u kodu i korake koje **ti** trebaš izvršiti
ručno (nemam mrežni pristup ni pristup tvom serveru iz ovog okruženja).

---

## 1. Šta je već izmijenjeno u kodu

| Fajl | Izmjena |
|---|---|
| `backend/prisma/schema.prisma` | `datasource db { provider = "postgresql" }` (bilo `mysql`) |
| `backend/prisma/schema.mysql.prisma.bak` | **novo** — kopija originalne MySQL šeme, radi rollback-a |
| `backend/prisma/migrations/` | stare MySQL migracije premještene u `migrations_mysql_backup/` (ne mogu se replay-ovati na Postgres — vidi §3) |
| `backend/src/prisma/create-prisma-client.ts` | driver adapter `@prisma/adapter-mariadb` → `@prisma/adapter-pg`; default port 3306 → 5432 |
| `backend/package.json` | uklonjeno `@prisma/adapter-mariadb`, `mariadb`; dodano `@prisma/adapter-pg`, `pg`, `@types/pg` |
| `backend/src/common/utils/find-equipment-ids-by-specification-search.util.ts` | raw SQL: `CAST(x AS CHAR)` → `x::text`; `categoryId` sada kvotovan (`"categoryId"`) |
| `backend/src/common/utils/json-specification-filter.util.ts` | Prisma JSON `path` filter: MySQL string (`$."uuid"`) → Postgres niz (`["uuid"]`) |
| `backend/src/common/utils/build-equipment-search-where.util.ts` i još 7 servisnih fajlova | dodan `mode: 'insensitive'` na `contains`/`startsWith` filtere (vidi §4) |
| `backend/Dockerfile` | uklonjena prava MySQL lozinka hardkodirana u build stage-u (sigurnosni propust — vidi §5) |
| `.env.example`, `.cursor/rules/00_project.mdc`, `README.md`, `backend/README.md` | ažurirani opisi/env template |

Sve izmjene su **statička analiza + edit koda** — nisam mogao pokrenuti `npm install`,
`prisma generate`, `prisma validate` ni test konekciju jer ovo sandbox okruženje nema
mrežni pristup. Prije prve upotrebe **obavezno** prođi kroz §6 (checklist).

---

## 2. Zašto ne postoji "env prekidač" MySQL ↔ Postgres

Tražio si da MySQL config ostane u `.env`, a da se u env-u bira koja baza je aktivna.
Bitno ograničenje: **Prisma driver adapter je fiksno vezan za jedan provider u kodu**
(`@prisma/adapter-pg` radi samo sa `provider = "postgresql"` u šemi; generisani Prisma
Client je specifičan za taj provider). Ne postoji varijabla u `.env` koja bi u runtime-u
prebacila aplikaciju sa Postgresa na MySQL — to zahtijeva:

1. vraćanje `schema.mysql.prisma.bak` → `schema.prisma`,
2. vraćanje `@prisma/adapter-mariadb` + `mariadb` paketa,
3. vraćanje stare verzije `create-prisma-client.ts`,
4. `npm install` + `prisma generate` + restart backenda.

Zbog toga sam `DB_PROVIDER=postgresql` u `.env.example` ostavio kao **informativnu
oznaku** (za tebe, za dokumentaciju, eventualno za health-check log), ne kao stvarni
prekidač. Puna MySQL konfiguracija je zakomentarisana u `.env.example` upravo da bude
odmah pri ruci ako ikad zatreba rollback (§7).

---

## 3. Kreiranje šeme na Postgresu

Stare MySQL migracije (`backend/prisma/migrations_mysql_backup/`, 36 fajlova) koriste
MySQL-only sintaksu (backtick identifikatori, `ENGINE=InnoDB`, `CHARACTER SET utf8mb4`,
`DATETIME(3)`) i ne mogu se pustiti na Postgresu. Pošto podatke seliš ručno (nema potrebe
za replay-om istorije), najjednostavnije je napraviti **svježi baseline** iz trenutne
`schema.prisma`:

```bash
cd backend
npm install
# .env već treba imati DATABASE_URL=postgresql://evidens:...@sql.ba101.top:5432/evidens

npx prisma migrate dev --name init_postgres
```

Ovo će:
- kreirati sve tabele/indekse/enume na Postgres bazi `evidens` prema trenutnoj šemi,
- napraviti prvi fajl u `backend/prisma/migrations/` (novi Postgres baseline).

Ako želiš samo brzo kreirati šemu bez migration-history fajlova (npr. za lokalni test),
alternativa je `npx prisma db push` — ali za produkciju je `migrate dev`/`migrate deploy`
tok ispravniji jer ostavlja trag migracija za budućnost.

---

## 4. Ponašanje pretrage — case sensitivity (VAŽNO, provjeri)

MySQL je po defaultu koristio kolaciju `utf8mb4_unicode_ci` — što znači da su svi
`contains`/`startsWith`/`LIKE` upiti bili **case-insensitive** (npr. pretraga "hp" nađe i
"HP" i "Hp"). PostgreSQL je po defaultu **case-sensitive** za `LIKE`/`contains`.

Da ponašanje pretrage ostane isto kao prije, dodao sam `mode: 'insensitive'` na svih
~30 mjesta gdje se koristi `contains`/`startsWith` u servisima (equipment, transfers,
employees, categories, org-units, locations, equipment-catalog, JSON specifications
pretraga). Prisma to na Postgresu prevodi u `ILIKE`.

**Ovo je odluka koju vrijedi provjeriti** — ako si namjerno želio case-sensitive pretragu
na nekom mjestu, sada je case-insensitive svuda (kao što je bilo i prije, implicitno kroz
MySQL kolaciju). Ako primijetiš da pretraga sada "hvata" više rezultata nego što očekuješ
na nekom ekranu, to je taj mehanizam.

Ako pretraga postane primjetno spora na velikim tabelama nakon migracije, razmisli o
`pg_trgm` ekstenziji i trigram indeksu za `contains`/`ILIKE` upite — nije urađeno u ovoj
pripremi jer zahtijeva pristup bazi.

---

## 5. Sigurnosna napomena — stara MySQL lozinka u Dockerfile-u

`backend/Dockerfile` je u build stage-u imao:

```
ENV DATABASE_URL="mysql://mudzy:•••••••••@sql.ba101.top:3306/inventory-v3"
```

sa **pravom lozinkom u plain textu**, hardkodiranom direktno u fajlu koji ide u git i u
svaki Docker image layer. `prisma generate` (jedina komanda koja tu vrijednost koristi u
build stage-u) ne treba stvarnu konekciju na bazu — treba samo da `DATABASE_URL` postoji
i da mu je format ispravan za provider. Zamijenio sam je placeholder vrijednošću
(`postgresql://placeholder:placeholder@localhost:5432/evidens`).

**Preporuka**: ta stara MySQL lozinka je bila u git historiji — ako je server na
`sql.ba101.top` i dalje dostupan sa tim kredencijalima, razmisli o rotaciji te MySQL
lozinke, nezavisno od ove migracije.

---

## 6. Checklist prije pokretanja (radiš ti — lokalno, sa mrežnim pristupom)

- [ ] `cd backend && npm install` (povlači `@prisma/adapter-pg`, `pg`, uklanja mariadb pakete)
- [ ] `.env` — postaviti `DATABASE_URL=postgresql://evidens:Mojalozinka!1@sql.ba101.top:5432/evidens`
      (URL-encode specijalne znakove u lozinci ako ih ima — `!` je ok neenkodiran u userinfo dijelu URL-a, ali provjeri ako mijenjaš lozinku)
- [ ] `npx prisma generate`
- [ ] `npx prisma migrate dev --name init_postgres` (kreira šemu na praznoj Postgres bazi)
- [ ] `npm run build` — provjeri da TypeScript prođe bez grešaka (raw SQL util i JSON filter su ručno prepisani, vrijedi provjeriti tipove)
- [ ] `npm run test:unit` — postojeći unit testovi (ažurirao sam 3 spec fajla koja su testirala stari MySQL JSON path format)
- [ ] Pokrenuti backend lokalno (`npm run dev`) i provjeriti `GET /backend/health` (radi `$queryRaw\`SELECT 1\`` na Postgresu)
- [ ] Ručno testirati equipment pretragu (koristi raw SQL util) i pretragu po specifikacijama (JSON path filter) — ovo su dva mjesta gdje je logika stvarno prepisana, ne samo provider promijenjen
- [ ] Provjeriti da `.env` (sa pravim lozinkama) **nije** commit-ovan — već je u `.gitignore`, samo dvostruka provjera
- [ ] Kada si zadovoljan: `git add -A && git commit`, pa deploy (`docker-compose.prod.yml` ne treba dodatne izmjene — i dalje čita `DATABASE_URL` iz `.env` preko `env_file`)
- [ ] Na serveru (produkcija): postaviti `DATABASE_URL` da koristi interno Docker ime Postgres kontejnera umjesto `sql.ba101.top` — vidi §7

Migracija **podataka** (MySQL → Postgres) namjerno nije dio ovog paketa — radiš je ručno,
kako si naveo.

---

## 7. Interna Docker mreža umjesto javnog linka (produkcija)

Postgres i backend su na **istom fizičkom serveru**, oba kao Docker kontejneri, i oba
vidljiva na dijeljenoj `web` (Traefik) mreži. U tom slučaju konekcija preko
`sql.ba101.top` (javna subdomena → DNS → nazad na isti server) je nepotreban zaobilazni
put — brže i sigurnije je koristiti Docker-ov ugrađeni DNS unutar `web` mreže.

`docker-compose.prod.yml` **ne treba mijenjati** — `backend` servis je već na `web`
mreži. Potrebno je samo:

1. Naći service/container ime Postgres kontejnera: `docker network inspect web`
   (izlistaće sve kontejnere spojene na tu mrežu).
2. U produkcijskom `.env` (na serveru), promijeniti `DATABASE_HOST`/`DATABASE_URL` da
   koriste to ime umjesto `sql.ba101.top`:
   ```
   DATABASE_HOST=<ime_postgres_kontejnera>
   DATABASE_URL=postgresql://evidens:PASSWORD@<ime_postgres_kontejnera>:5432/evidens
   ```
3. Dev `.env` (lokalna mašina developera) ostaje na javnoj subdomeni
   (`sql.ba101.top`) — dev mašina nije na `web` Docker mreži tog servera, pa service
   name tamo ne postoji.

**Napomena o SSL-u**: `create-prisma-client.ts` parsira `DATABASE_URL` ručno i uzima
samo `host/port/user/password/database` — svi query parametri (npr. `?sslmode=...`) se
trenutno ignorišu, bez obzira da li se konektuje preko javnog linka ili interne mreže.
Ako trenutna konekcija na `sql.ba101.top` radi bez greške, to znači da Postgres server
dozvoljava nešifrovanu konekciju (ili je SSL "opportunistic", ne mandatory) — vrijedno
provjeriti prije prelaska, jer i dalje ostaje ista situacija na internoj mreži.

**Opciono, nakon prelaska**: ako Postgres port 5432 trenutno nije potreban za pristup
izvan tog servera (npr. DBeaver/pgAdmin sa tvoje mašine), razmisli o restrikciji
javnog pristupa portu 5432 (firewall/security group) — samo bi interni Docker
saobraćaj ostao dozvoljen, čime se smanjuje površina napada.

## 8. Rollback na MySQL

Ako zatreba vratiti se na MySQL:

1. `cp backend/prisma/schema.mysql.prisma.bak backend/prisma/schema.prisma`
2. U `backend/package.json` vratiti `@prisma/adapter-mariadb` + `mariadb`, ukloniti `@prisma/adapter-pg` + `pg`
3. U `backend/src/prisma/create-prisma-client.ts` vratiti `PrismaMariaDb` adapter i default port 3306
4. U `backend/src/common/utils/json-specification-filter.util.ts` vratiti MySQL JSON path string format (`$."uuid"`)
5. U `backend/src/common/utils/find-equipment-ids-by-specification-search.util.ts` vratiti `CAST(specifications AS CHAR)` i ukloniti navodnike oko `categoryId`
6. `mv backend/prisma/migrations_mysql_backup backend/prisma/migrations` (vratiti staru istoriju)
7. U `.env` otkomentarisati `*_MYSQL_BACKUP` varijable i postaviti ih kao primarne (`DATABASE_URL`, itd.)
8. Ukloniti `mode: 'insensitive'` sa svih mjesta navedenih u §4 (MySQL konektor ne podržava taj argument — poziv bi bacio grešku)
9. `npm install && npx prisma generate`

`mode: 'insensitive'` izmjene (§4) **moraju biti uklonjene** ako se vraćaš na MySQL —
Prisma ne podržava `mode: 'insensitive'` na MySQL konektoru uopšte (ne samo da je
nepotrebno; poziv sa tim argumentom baca grešku). Pošto je MySQL i onako
case-insensitive po defaultu (kolacija `_ci`), uklanjanje `mode: 'insensitive'` vraća
identično ponašanje kakvo je bilo prije ove migracije.
