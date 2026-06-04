# Changelog — auth-session

## 2026-06-04

- **Šta:** `localStorage` za access/refresh tokene; silent refresh na 401; bootstrap s refresh fallback; socket reconnect na promjenu tokena; migracija `sessionStorage` → `localStorage`.
- **Zašto:** Korisnici su bili odjavljeni nakon ~15 min (istek access JWT) jer frontend nije koristio `/auth/refresh`.
