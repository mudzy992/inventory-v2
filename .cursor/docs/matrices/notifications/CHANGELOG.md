# Changelog — notifications matrix

## 2026-05-29

- Inicijalna matrica za fazu 5: REST + Socket.IO gateway, transfer triggeri, JWT handshake, frontend SocketProvider i NotificationsPanel.

## 2026-06-03 (faza 18c)

- Tipovi: `inventory_transfer_upload_pending`, `inventory_session_closed`, `disposal_approval_pending`.
- Socket eventi: `inventory.close_job.updated`, `inventory.disposal_inbox.updated`.
- Triggeri: draft prenosnica na popisu, close job worker, `DisposalInventoryApproval` pending.
- Frontend: `ToastProvider`, `useInventorySocketEvents`, stepper prenosnice van popisa.
