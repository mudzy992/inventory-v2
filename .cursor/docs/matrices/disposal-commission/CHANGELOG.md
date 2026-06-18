# disposal-commission — CHANGELOG

## 2026-06-17 (uklanjanje legacy glasanja)

- Uklonjeni modeli `DisposalApproval` / `DisposalApprovalVote` i API za glasanje na transferu.
- Jedini workflow: `DisposalInventoryApproval` (predsjednik + zapisnik).

## 2026-06-15 (za_rashod)

- Lista za rashod postavlja `equipment.status=za_rashod`; povrat/odbijanje vraća `skladiste`.

## 2026-06-15 — Popisni rashod workflow

- `EquipmentDisposalListItem` — lista za rashod u draft sesiji; auto dodjela pri kreiranju popisne komisije.
- Approve rashoda → `rashodovano` + `unisteno` (bez skladištara).
- Blokiran samostalni `POST /disposal-commissions` i novi transfer `rashodovanje`.
- Postavka `features.disposal_pre_list`.

## 2026-06-03 — Faza 17 (Full Effect)

- Novi model `DisposalInventoryApproval` — odobrenje rashoda **po opremi** nakon popisa (pored legacy `DisposalApproval` na transferu).
- Inbox predsjednika: `GET /inventory-sessions/:sessionId/disposal-inbox`.
- Odobrenje: `PATCH /inventory-sessions/disposal-approvals/:id` → `spremno_za_unistenje`.
- Transfer `rashodovanje` blokiran tokom aktivnog popisa u gradu distribucije.
