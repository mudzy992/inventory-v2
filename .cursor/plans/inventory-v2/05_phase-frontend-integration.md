# Faza 4 — Frontend integracija

## Cilj

Postojeći UI (`frontend/src`) koristi backend umjesto `localStorage` demo store-a.

## Arhitektura frontenda

```
frontend/src/
├── api/              # fetch wrapper, auth header, error handling
├── hooks/            # useAuth, useOrgUnits, ...
├── contexts/         # AuthProvider, SocketProvider (faza 5)
├── components/       # postojeće stranice (minimalne izmjene)
├── i18n/             # bs.json, en.json
├── types/            # sync sa backend DTO (ili shared types paket kasnije)
└── lib/              # cn, formatters
```

## Koraci migracije

1. **Auth flow:** `LoginPage` → `POST /backend/auth/login`, token u memory + httpOnly cookie (preferirano) ili secure storage
2. **Zamjena `store.ts`:** postepeno — prvo read API, zatim write mutacije
3. **Ukloniti** `resetToDemo` iz produkcijskog builda (samo dev flag)
4. **Vite env:** `VITE_API_URL=https://opremnica.ba101.top/backend` (prod), `/backend` proxy u dev
5. **vite.config.ts:** dev proxy:

```ts
server: {
  proxy: {
    '/backend': { target: 'http://localhost:3000', changeOrigin: true },
  },
},
```

## UI / dizajn

- Apple-linear, clean (global pravilo)
- **Admin panel** — multipage unutar SPA (sidebar već postoji)
- Responsive: drawer/sheet na mobile breakpointu
- Color scheme: primijeniti nakon korisničke potvrde (faza 0 pitanje)

## i18n

- Default BS za sve labele iz `Layout` i stranica
- EN infrastruktura: `react-i18next` ili lightweight custom

## Kriterijumi završetka

- [ ] Login/logout radi protiv API-ja
- [ ] Sve stranice učitavaju podatke sa servera
- [ ] Role-based navigacija i dalje funkcioniše
- [ ] Build `npm run build` bez grešaka
