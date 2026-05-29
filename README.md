# Inventory v2

**Sub-naslov:** Hijerarhijska evidencija i zaduženje opreme

Web aplikacija za evidenciju opreme po organizacionoj hijerarhiji — zaduženja, prenosi, dokumenti, QR.

| | |
|---|---|
| **Produkcija** | https://inventory-v2.ba101.top |
| **API** | https://inventory-v2.ba101.top/backend |
| **GitHub** | [mudzy992/inventory-v2](https://github.com/mudzy992/inventory-v2) |

## Struktura

```
inventory-v2/
├── backend/     # NestJS + Prisma (faza 1+)
├── frontend/    # React + Vite + Tailwind
├── docker/      # nginx config
└── .cursor/     # plan, matrice, pravila
```

## Lokalni razvoj (frontend prototip)

```bash
cd frontend
npm install
npm run dev
```

Backend i puni API dolaze u fazi 1 — plan: `.cursor/plans/inventory-v2/`.

## Env

1. Kopiraj `.env.example` → `.env` (već postoji template).
2. Popuni **eksterni MySQL** (`DATABASE_HOST`, `DATABASE_URL`, …).
3. Postavi `JWT_SECRET`.

`.env` nije u gitu.

## Docker

```bash
# Dev (bez Traefik)
docker compose up --build

# Produkcija (Traefik mreža web mora postojati)
docker compose -f docker-compose.prod.yml up -d --build
```

## Plan i matrice

- [Plan overview](.cursor/plans/inventory-v2/00_overview.md)
- [Checklist](.cursor/plans/inventory-v2/CHECKLIST.md)
- [Design tokens](.cursor/docs/design-tokens.md)
