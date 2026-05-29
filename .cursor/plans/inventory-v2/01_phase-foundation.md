# Faza 0 — Foundation (identitet, git, monorepo, bootstrap)

> **Projekat:** Inventory v2 · `mudzy992/inventory-v2` · `C:\Users\m.ceric\Documents\GitHub\inventory-v2`

## Cilj

Projekat postaje production-ready monorepo sa git historijom, GitHub remote-om i Cursor scaffolding-om — bez još punog backend koda.

## Zadaci

### 0.1 Reorganizacija foldera

1. Kreirati `frontend/` i premjestiti postojeće fajlove iz roota:
   - `src/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`
2. Root `package.json` (opcionalno workspaces) ili README sa uputama `cd frontend && npm run dev`.
3. Ukloniti `vite-plugin-singlefile` za produkciju (ostaviti samo za demo export ako treba).

### 0.2 Git inicijalizacija

```powershell
cd C:\Users\m.ceric\Desktop\hierarchical-inventory-management-system
git init
git branch -M main
```

**.gitignore** (minimum):

- `node_modules/`, `dist/`, `build/`
- `.env`, `.env.*`, `!.env.example`
- `backend/uploads/*`, `!backend/uploads/.gitkeep`
- `.cursor/plans/**/HANDOFF.md` (opcionalno lokalno) — **ne** ignorisati planove
- IDE: `.idea/`, `.vscode/` (osim shared settings ako treba)

### 0.3 GitHub repozitorij

```powershell
gh repo create opremnica --private --source=. --remote=origin --description "Hijerarhijska evidencija i zaduženje opreme (Opremnica)"
git add .
git commit -m "chore: initial monorepo scaffold with frontend prototype"
git push -u origin main
```

*Ako ime `opremnica` zauzeto: `opremnica-ba` ili `hierarchical-inventory` — DNS slug uskladiti.*

### 0.4 Cursor bootstrap (skill: project-bootstrap)

- `.cursor/rules/00_project.mdc` — stack, BS/EN, bez mobile
- `.cursorrules` — kratka skretnica na plan + matrice
- `.cursor/docs/00_identity.md` — kopija identiteta iz overview-a

### 0.5 README.md (root)

- Naziv, sub-naslov, opis
- Lokalni dev (frontend only dok nema backend-a)
- Link na plan: `.cursor/plans/opremnica/`
- Env varijable (referenca na `.env.example`)

### 0.6 `.env.example` (root)

```env
# App
APP_NAME=opremnica
APP_URL=https://opremnica.ba101.top
API_PREFIX=backend

# Database
DATABASE_URL=mysql://opremnica:changeme@mysql:3306/opremnica

# JWT
JWT_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Uploads
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10

# CORS (dev)
CORS_ORIGIN=http://localhost:5173
```

## Kriterijumi završetka

- [ ] `frontend/` radi (`npm run dev`)
- [ ] `git log` ima initial commit
- [ ] `origin` pokazuje na GitHub
- [ ] `.cursor/plans/opremnica/` i matrice folderi postoje
- [ ] Nema commitovanih tajni

## Rizici

- Folder još nije preimenovan u `opremnica` — samo branding; putanja na disku može ostati `hierarchical-inventory-management-system`.
