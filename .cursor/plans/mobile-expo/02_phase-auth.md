# Faza 2 — Auth + API + settings

- Fetch klijent: Bearer, refresh na 401, `ApiError`
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- Tokeni u `expo-secure-store`
- `GET /settings/public` na startu; `features.mobile_app === false` → blocked ekran
- `GET /settings/effective` nakon logina
- Registry: `features.mobile_app` (public, modules, default true)
- Login UI: brand mark + Inter, bosanski copy
