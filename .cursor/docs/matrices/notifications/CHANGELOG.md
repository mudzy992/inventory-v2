# Changelog — notifications matrix

## 2026-06-17

- Legacy tipovi `disposal_pending_approval` / `disposal_approved` više se ne emituju (ukinuto glasanje na transferu); aktivni rashod koristi `disposal_approval_pending`.

## 2026-06-05

- Tipovi za promjenu org. jedinice: `employee_relocation_action_required`, `employee_relocation_incoming`, `employee_relocation_admin_alert`, `employee_relocation_resolved`.

## 2026-06-04

- Tip `transfer_signed_upload_pending`: podsjetnik za upload potpisanog PDF-a na običnim RAW transferima (kad je postavka uključena).
- Frontend: ikona/label po tipu u `NotificationsPanel` (`notification-type.util.ts`).

## 2026-05-29

- Inicijalna matrica za fazu 5: REST + Socket.IO gateway, transfer triggeri, JWT handshake, frontend SocketProvider i NotificationsPanel.

## 2026-06-03 (faza 18c)

- Tipovi: `inventory_transfer_upload_pending`, `inventory_session_closed`, `disposal_approval_pending`.
- Socket eventi: `inventory.close_job.updated`, `inventory.disposal_inbox.updated`.
- Triggeri: draft prenosnica na popisu, close job worker, `DisposalInventoryApproval` pending.
- Frontend: `ToastProvider`, `useInventorySocketEvents`, stepper prenosnice van popisa.
