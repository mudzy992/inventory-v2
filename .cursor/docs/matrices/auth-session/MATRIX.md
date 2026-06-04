# Auth session matrica

## Tokeni (frontend)

| Ključ | Storage | Napomena |
|-------|---------|----------|
| `accessToken` | `localStorage` | JWT access; kratki TTL |
| `refreshToken` | `localStorage` | Opaque refresh; dugi TTL u bazi |

Pri prvom učitavanju modula `token-storage`: ako token postoji u `sessionStorage` a ne u `localStorage`, kopira se u `localStorage` i briše iz `sessionStorage`.

## TTL (backend env)

| Env | Zadano | Uloga |
|-----|--------|-------|
| `JWT_ACCESS_TTL` | `15m` | Istek access JWT |
| `JWT_REFRESH_TTL` | `7d` | Istek refresh zapisa u `RefreshToken` |

## Refresh rotacija (backend)

- `POST /auth/refresh` — body `{ refreshToken }`, odgovor `{ accessToken, refreshToken }`.
- Stari refresh se revokuje (`revokedAt`); izdaje se novi par.
- Nevažeći / istekli / revokovani refresh → `401`.

## Silent refresh (frontend)

1. `apiRequest` / `fetchAuthenticatedBlob`: na `401`, ako path nije `/auth/login`, `/auth/refresh`, `/auth/logout` i postoji refresh token → jedan `refreshTokensApi()` (mutex) → retry zahtjeva.
2. Refresh neuspjeh ili drugi `401` → `clearTokens()` + `auth:session-expired` event.
3. Bootstrap (`AuthContext`): `fetchMe` → na `401` refresh → ponovo `fetchMe`.

## Odjava

- Eksplicitna: `logoutApi` revokuje refresh na serveru, `clearTokens()`.
- Automatska: refresh neuspjeh → `auth:session-expired` → `AuthContext` briše `user`.

## Socket.IO

- Konekcija koristi trenutni `accessToken` u `auth.token`.
- `subscribeTokenChange` u `SocketContext` i `use-inventory-socket-events` ponovo veže socket kad se tokeni promijene (nakon refresha).

## Izvori u kodu

- `frontend/src/api/token-storage.ts`
- `frontend/src/api/auth-refresh.ts`
- `frontend/src/api/client.ts`
- `backend/src/modules/auth/auth.service.ts`
