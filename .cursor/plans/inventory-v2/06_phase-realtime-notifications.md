# Faza 5 — Realtime i notifikacije

## Cilj (global realtime policy)

Obavezno za:
- **notifications** — in-app refresh liste i unread count
- **settings** (opcionalno u istoj fazi) — refresh public settings

## Backend

- `@nestjs/websockets` + Socket.IO gateway `NotificationsGateway`
- Namespace: `/backend/socket` ili `/socket` (usklađeno sa Traefik path — vidi deploy matricu)
- Eventi:
  - `notification.created`
  - `notification.read`
  - `settings.updated` (public keys)

## Frontend

- `SocketProvider` + hook `useNotifications`
- Layout bell icon: realtime unread count
- Fallback: polling svakih 60s ako WS padne

## REST (ostaje)

- `GET /backend/notifications`
- `PATCH /backend/notifications/:id/read`
- `POST /backend/notifications/read-all`

## Matrica

`.cursor/docs/matrices/notifications/MATRIX.md`

## Kriterijumi završetka

- [ ] Novi transfer generiše notifikaciju relevantnim korisnicima
- [ ] UI se osvježava bez reload-a
- [ ] JWT autentifikacija na WS handshake-u
