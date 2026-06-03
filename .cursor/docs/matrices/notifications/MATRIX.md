# Matrica — notifikacije (in-app + realtime)

## Scope

In-app notifikacije za autentificirane korisnike. Realtime preko Socket.IO; REST ostaje source-of-truth za listu.

## Feature flag

| Key | Scope | Default | Efekat |
|-----|-------|---------|--------|
| `notifications.enabled` | public | `true` | Kad je `false`, backend ne kreira nove notifikacije |

## Tipovi

| Tip | Trigger | Primatelji |
|-----|---------|------------|
| `transfer_pending` | Kreiran raw transfer | admin, potpisnik, evidentičari u scope-u |
| `transfer_complete` | Potpis transfera | admin, potpisnik, evidentičari u scope-u, `toPerson` user |
| `equipment_assigned` | Potpis transfera na osobu | korisnik `toPersonId` |
| `disposal_pending_approval` | Legacy rashod transfer (komisija grad) | članovi komisije s user računom |
| `disposal_approved` | Legacy rashod odobren | po definiciji servisa |
| `inventory_transfer_upload_pending` | Draft prenosnica na liniji popisa (`promjena_lokacije`) bez uploada | članovi komisije popisa |
| `inventory_session_closed` | Close job `done` | admin, članovi komisija sesije, evidentičari u scope-u distribucije |
| `disposal_approval_pending` | `DisposalInventoryApproval` status `pending` (popisni rashod) | članovi komisije rashoda vezanog uz komitet |
| `info` | Ručno / buduće | po definiciji |

## REST API

| Metoda | Putanja | Auth |
|--------|---------|------|
| GET | `/backend/notifications` | JWT |
| PATCH | `/backend/notifications/:id/read` | JWT (samo vlastita) |
| POST | `/backend/notifications/read-all` | JWT |

## Socket.IO

| Parametar | Vrijednost |
|-----------|------------|
| Namespace | `/notifications` |
| Path | `/backend/socket.io` |
| Auth | JWT u `handshake.auth.token` ili `Authorization: Bearer` |
| Room | `user:{userId}` |

### Eventi (server → client)

| Event | Payload | Namjena |
|-------|---------|---------|
| `notification.created` | notification objekt | Nova in-app notifikacija |
| `notification.read` | `{ id: string }` | Označeno pročitano |
| `settings.updated` | `{ key, value }` | Public settings |
| `inventory.close_job.updated` | `{ sessionId, status, appliedCount, failedCount, totalCount }` | Osvježavanje close job UI bez pollinga |
| `inventory.disposal_inbox.updated` | `{ sessionId }` | Osvježavanje inboxa popisnog rashoda |

## Frontend

- `SocketProvider` — konekcija nakon login-a
- `useNotifications` — lista, unread count, mark read
- `useInventorySocketEvents` — close job + disposal inbox refresh
- `ToastProvider` / `useToast` — greške i potvrde umjesto `alert()`
- Fallback polling: 60s kad WS nije povezan (notifikacije)
- Layout bell → `NotificationsPanel`

## Edge cases

- Korisnik bez `User` zapisa za employee → ne prima personal notifikacije
- Dupli WS eventi → frontend deduplicira po `id` (notifikacije)
- `notifications.enabled=false` → postojeće notifikacije ostaju u DB, nove se ne kreiraju
- Close job failed → `inventory.close_job.updated` sa `status=failed`, bez `inventory_session_closed` notifikacije
