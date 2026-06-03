# Matrica: Komisija za rashod

## Model

- `DisposalCommission` po **`cityId`** (grad)
- `DisposalCommissionMember`: employeeId, role (`predsjednik` | `clan`)
- `DisposalApproval` na transfer `rashodovanje` + `status`: pending | approved | rejected
- `DisposalApprovalVote` po članu
- Jedna aktivna komisija po gradu (`isActive`), osim vezanih uz popis
- `inventoryCommitteeId` — 1:1 s popisnom komisijom (auto-kreiranje pri wizardu)

## Par s popisom

Pri kreiranju `InventoryCommittee` automatski se kreira `DisposalCommission` (isti grad, isti članovi). Rashod tokom aktivnog popisa koristi tu komisiju.

## Rezolucija komisije

1. Za rashod opreme zadužene osobi: `effectiveLocationCityId` radnika (holder).
2. Za opremu na skladištu bez holdera: `warehouse.cityId`.
3. Aktivna komisija za taj `cityId`.

## Workflow

### Legacy (transfer rashodovanje)

1. Evidentičar kreira transfer `rashodovanje` → `raw` + `DisposalApproval` **pending**
2. Članovi glasaju → **approved** → upload/finalize
3. **Blokirano** tokom aktivnog popisa u istom gradu (`InventoryFreezeService`)

### Popisni rashod (faza 17+)

1. Popisna komisija: linija `predlozen_rashod` (oprema na skladištu)
2. Close job: `DisposalInventoryApproval` **pending** po opremi
3. Predsjednik komisije rashoda: inbox → approve/reject
4. Approve → `status=rashodovano`, `warehouseCondition=spremno_za_unistenje` → skladištar uništi (faza 16)

## API

| Endpoint | Opis |
|----------|------|
| `GET/POST /disposal-commissions` | admin CRUD |
| `GET /disposal-commissions/resolve` | preview komisije (`equipmentId` ili `holderEmployeeId`) |
| `POST /disposal-commissions/approvals/:id/vote` | član komisije / admin |

## Notifikacije

- `disposal_pending_approval`, `disposal_approved` (Socket.IO + in-app)
