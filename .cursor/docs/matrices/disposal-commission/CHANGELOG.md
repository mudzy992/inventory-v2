# disposal-commission — CHANGELOG

## 2026-06-03 — Faza 17 (Full Effect)

- Novi model `DisposalInventoryApproval` — odobrenje rashoda **po opremi** nakon popisa (pored legacy `DisposalApproval` na transferu).
- Inbox predsjednika: `GET /inventory-sessions/:sessionId/disposal-inbox`.
- Odobrenje: `PATCH /inventory-sessions/disposal-approvals/:id` → `spremno_za_unistenje`.
- Transfer `rashodovanje` blokiran tokom aktivnog popisa u gradu distribucije.
