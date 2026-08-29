# =========================================================================
# Evidens — env za Coolify (Environment Variables sekcija resursa)
# Frontend: https://evidens.ba101.top
# Backend:  https://api.evidens.ba101.top  (posebna subdomena, BEZ /backend prefiksa)
# =========================================================================

# --- App ---
APP_NAME=evidens
APP_DISPLAY_NAME=Evidens
APP_SUBTITLE=Hijerarhijska evidencija i zaduženje opreme
APP_URL=https://evidens.ba101.top

# API_PREFIX MORA ostati PRAZAN (samo "API_PREFIX=" bez vrijednosti iza znaka
# jednakosti) — backend sada radi na svojoj subdomeni (api.evidens.ba101.top),
# a ne na path-prefiksu (/backend) ispod frontend domene kao ranije.
# NE brisati ovaj red — docker-compose.yml namjerno koristi "${API_PREFIX-backend}"
# (bez dvotačke) baš zato da prazna vrijednost ovdje bude ispoštovana, a da se
# "backend" default koristi samo ako varijabla uopšte ne postoji.
API_PREFIX=

# --- Baza (PostgreSQL, Coolify "db_net" mreža) ---
DB_PROVIDER=postgresql
# Host = service/container ime Postgres resursa u Coolify-ju (isto ono na koje
# se kače i ostali projekti na db_net mreži, npr. immich, seer).
DATABASE_HOST=hgpchekxb6dutalsyctu42al
DATABASE_PORT=5432
DATABASE_USER=evidens
DATABASE_PASSWORD=Mojalozinka!1
DATABASE_NAME=evidens
DATABASE_URL=postgresql://evidens:Mojalozinka!1@hgpchekxb6dutalsyctu42al:5432/evidens?schema=public

# --- Setup (produkcija, opcionalno) ---
# Ako je postavljen, POST https://api.evidens.ba101.top/setup/initialize
# zahtijeva isti token u tijelu zahtjeva (bez /backend u putanji, jer prefiksa
# više nema).
SETUP_TOKEN=

# --- Auth ---
JWT_SECRET=f275e89c134a686b00cde536081cf4363b51686062949756b4a29b52ed42e5d6
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# --- Uploads ---
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10

# --- CORS ---
# Frontend i backend su sada na RAZLIČITIM subdomenama (pravi cross-origin
# zahtjev), pa ovo mora TAČNO odgovarati frontend originu — bez trailing "/"
# i bez ikakve putanje.
CORS_ORIGIN=https://evidens.ba101.top

# --- Frontend (Vite build args, koriste se SAMO pri build-u u Coolify-ju) ---
# Pun URL backend API-ja — BEZ "/backend" nastavka, jer backend nema više prefiks.
VITE_API_URL=https://api.evidens.ba101.top
VITE_APP_NAME=Evidens
VITE_APP_URL=https://evidens.ba101.top

# --- Docker / runtime ---
BACKEND_PORT=3000

# =========================================================================
# Napomene:
# - Frontend kontejner sluša na portu 3000 (node "serve"); u Coolify UI-ju za
#   frontend servis možeš ostaviti port 3000 ili ga po želji promijeniti na 80
#   (Coolify domensko/SSL rutiranje ionako ide preko internog proxy-ja, port
#   koji izlažeš je samo interni target port).
# - backend/.env fajl u repou (drugi, unutar backend/ foldera) više nije
#   potreban — sav env sada ide isključivo kroz Coolify, ne diraj/briši ga u
#   repou ako ne smeta, samo se neće koristiti u produkciji.
# =========================================================================
