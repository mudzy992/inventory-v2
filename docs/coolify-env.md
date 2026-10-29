# Coolify env — Evidens (BEZ tajni)

> Objedinjeno iz bivših root fajlova `fajl.txt` (Coolify, subdomena) i `fajl.md`
> (path-prefiks varijanta). Oba fajla su **obrisana iz repoa** jer su sadržavala
> pravu lozinku baze i `JWT_SECRET` — vidi P0 stavku u [BACKLOG.md](./BACKLOG.md).
> Ovdje su isključivo placeholderi. Prave vrijednosti žive samo u Coolify
> Environment Variables sekciji (i u lokalnom `.env`, koji nije u gitu).

Frontend: `https://evidens.ba101.top` · Backend: `https://api.evidens.ba101.top`
(posebna subdomena, **bez** `/backend` prefiksa).

```ini
# --- App ---
APP_NAME=evidens
APP_DISPLAY_NAME=Evidens
APP_SUBTITLE=Hijerarhijska evidencija i zaduženje opreme
APP_URL=https://evidens.ba101.top
# API_PREFIX MORA ostati prazan u Coolify varijanti (backend je na subdomeni).
# NE brisati red: docker-compose.yml koristi "${API_PREFIX-backend}" (bez
# dvotačke) pa se "backend" default koristi samo ako varijabla ne postoji.
API_PREFIX=

# --- Baza (PostgreSQL, Coolify "db_net" mreža) ---
DB_PROVIDER=postgresql
DATABASE_HOST=<ime_postgres_kontejnera>
DATABASE_PORT=5432
DATABASE_USER=evidens
DATABASE_PASSWORD=<TAJNA-IZ-COOLIFY>
DATABASE_NAME=evidens
DATABASE_URL=postgresql://evidens:<TAJNA>@<ime_postgres_kontejnera>:5432/evidens?schema=public

# --- Setup (opcionalno) ---
SETUP_TOKEN=<min-16-znakova>

# --- Auth ---
JWT_SECRET=<min-32-znaka-generisati-novo>
# Opciono: poseban ključ za šifrovanje SMTP lozinke u bazi (AES-256-GCM).
# Ako nije postavljen, ključ se derivira iz JWT_SECRET (rotacija JWT_SECRET-a
# tada zahtijeva ponovni unos SMTP lozinke u Postavke → E-pošta).
MAIL_CONFIG_SECRET=<min-32-znaka-generisati-novo>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# --- Uploads / CORS ---
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10
CORS_ORIGIN=https://evidens.ba101.top

# --- Frontend (Vite build args, samo pri build-u) ---
VITE_API_URL=https://api.evidens.ba101.top
VITE_APP_NAME=Evidens
VITE_APP_URL=https://evidens.ba101.top

# --- Docker / runtime ---
BACKEND_PORT=3000
```

## Napomene

- Frontend kontejner sluša na portu 3000 (`serve` varijanta, `frontend/Dockerfilefr`)
  ili 80 (nginx varijanta, `frontend/Dockerfile`) — u Coolify UI-ju domena/SSL
  idu preko internog proxyja; kanonski image treba potvrditi (vidi BACKLOG §3).
- `document-worker` servis (LibreOffice, DOCX/XLSX/ODT → PDF) pokreće se
  automatski kao dio istog Docker Compose resursa — nema javnu domenu ni port.
  Koristi isti Redis (`REDIS_HOST`/`REDIS_PASSWORD`/`REDIS_KEY_PREFIX`).
- Stara path-prefiks varijanta (`APP_URL` + `/backend`, `VITE_DEV_API_PROXY`)
  vrijedi samo za lokalni dev — opisana je u root [README.md](../README.md)
  i [.env.example](../.env.example), ne u produkciji.
- Prije deploya: `node scripts/check-deployment-readiness.mjs --env .env`
  (vodič: [deployment-readiness.md](./deployment-readiness.md)).
