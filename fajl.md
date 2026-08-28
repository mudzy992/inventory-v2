# --- App ---
APP_NAME=evidens
APP_DISPLAY_NAME=Evidens
APP_SUBTITLE=Hijerarhijska evidencija i zaduženje opreme
APP_URL=https://evidens.ba101.top
API_PREFIX=backend

# --- Baza (PRIMARNA: PostgreSQL) ---
# NAPOMENA: Prisma driver adapter (@prisma/adapter-pg) i schema.prisma su fiksno
# vezani za PostgreSQL — provider se NE mijenja u runtime-u preko env varijable.
# DB_PROVIDER ispod je samo informativna oznaka za skripte/dokumentaciju/health-check,
# ne mijenja stvarno ponašanje Prisme.
DB_PROVIDER=postgresql
DATABASE_HOST=postgres
# 3306 za mysql 5432 za postgres
DATABASE_PORT=5432
DATABASE_USER=evidens
DATABASE_PASSWORD=Mojalozinka!1
DATABASE_NAME=evidens
# DATABASE_URL=mysql://mudzy:nije,kikiriki@sql.ba101.top:3306/inventory-v3
DATABASE_URL=postgresql://evidens:Mojalozinka!1@postgres:5432/evidens?schema=public

# --- Setup (produkcija, opcionalno) ---
# Ako je postavljen, POST /backend/setup/initialize zahtijeva isti token u tijelu
SETUP_TOKEN=

# --- Auth ---
JWT_SECRET=f275e89c134a686b00cde536081cf4363b51686062949756b4a29b52ed42e5d6
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# --- Uploads ---
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10

# --- CORS ---
CORS_ORIGIN=https://evidens.ba101.top

# --- Frontend (Vite) ---
# npm run dev: uvijek koristi /backend + proxy (VITE_DEV_API_PROXY → backend)
VITE_DEV_API_PROXY=http://localhost:3000
# npm run build (produkcija): puni URL API-ja
VITE_API_URL=https://evidens.ba101.top/backend
VITE_APP_NAME=Evidens
# QR naljepnice (produkcijski origin); fallback u dev: window.location.origin
VITE_APP_URL=https://evidens.ba101.top

# --- Docker / runtime ---
BACKEND_PORT=3000
# NODE_ENV: ne stavljati u .env — Vite dev čita root .env i prijavljuje grešku.
# Docker: NODE_ENV=production u backend/Dockerfile i docker-compose*.yml
