# Matrica: Komisija za rashod

## Model

- `DisposalCommission` — **samo** uz `InventoryCommittee` (auto pri wizardu popisne komisije)
- `DisposalCommissionMember`: employeeId, role (`predsjednik` | `clan`)
- `DisposalInventoryApproval` — odobrenje po opremi u sesiji popisa
- `EquipmentDisposalListItem` — pre-popisna lista (evidentičar, sesija `draft`)
- Legacy `DisposalApproval` na transfer `rashodovanje` — **zastarjelo** (novi unosi blokirani)

## Par s popisom

Pri kreiranju `InventoryCommittee` automatski se kreira `DisposalCommission`. Stavke s `EquipmentDisposalListItem` (`listed`) za isto skladište + roditeljsku kategoriju se dodjeljuju komisiji (`DisposalInventoryApproval` pending).

## Workflow

### Lista za rashod (prije aktivacije sesije)

1. Evidentičar/admin: `POST /inventory-sessions/:id/disposal-list` (samo sesija `draft`)
2. Oprema → status `za_rashod` (nakon razduženja ako je bila `zaduzeno`)
3. Zadužena oprema → auto `razduzenje` (direktno ili prenosnica ako `transfer.generation.on_razduzenje`)
4. Admin može povrat: `DELETE .../disposal-list/:equipmentId` (samo `draft`, status `listed`) → oprema `skladiste`

### Popisni rashod (aktivna sesija + zatvaranje)

1. Popisna komisija: linija `predlozen_rashod` (oprema `skladiste`) → close job → `DisposalInventoryApproval` pending
2. Predsjednik komisije rashoda: inbox → approve/reject
3. **Approve** → `status=rashodovano`, `warehouseCondition=unisteno` (bez koraka skladištara)
4. **Reject** → oprema `skladiste`; list item `rejected` ako postoji

### Admin reaktivacija

- `POST /equipment/:id/reactivate` — samo `rashodovano` + `unisteno`, obavezno obrazloženje → `skladiste` + `na_skladistu`

## API

| Endpoint | Opis |
|----------|------|
| `GET /disposal-commissions` | pregled komisija (read-only registry) |
| `GET /inventory-sessions/:id/disposal-list` | lista za rashod |
| `POST /inventory-sessions/:id/disposal-list` | označi opremu (evidentičar/admin) |
| `DELETE /inventory-sessions/:id/disposal-list/:equipmentId` | admin povrat (draft) |
| `GET /inventory-sessions/:id/disposal-inbox` | inbox predsjednika |
| `PATCH /inventory-sessions/disposal-approvals/:id` | odluka predsjednika |

## Postavke

- `features.disposal_pre_list` — gate za listu prije popisa
- `features.disposal_commissions` — modul komisija rashoda

## Notifikacije

- Socket refresh inboxa rashoda na close job / review
