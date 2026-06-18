# Changelog — inventory-count

## 2026-06-18 (uređivanje komisije + popisna lista)

- Wizard edit: preskače korake skladište/kategorija; samo dodavanje/izmjena članova (2 koraka).
- Print-scope API: uključuje `stockLot.productName` za naziv opreme na popisnoj listi.
- Popisna lista: format naziva `{lot} — {serijski}? — {kategorija}`; prazna kolona Kol.; uklonjen Grad/Godina; 3 potpisne linije na svakoj stranici.

## 2026-06-17 (relokacija i warehouse scope cleanup)

- `createRelocationTransfer`: ciljna osoba validirana warehouse coverage / efektivnim skladištem komisije, ne gradom sesije.
- `assertWarehouseInSessionScope`: samo org scope; skladište mora imati `orgUnitId`.
- `listWarehousesForSessionOrgUnit`: uklonjen city OR fallback.
- `resolveDisposalTargetWarehouseId`: za `zaduzeno` prvo holder effective warehouse, pa lot.

## 2026-06-17 (inventory freeze po skladištu)

- `InventoryFreezeService`: zamrzavanje po `warehouseId` (aktivna sesija + production lock), ne po gradu opreme.
- Freeze banner i stock lot provjere usklađene sa skladištem komisije.

## 2026-06-17 (članovi komisije po skladištu)

- Eligible članovi komisije: `resolveForEmployee === warehouseId` ili registrar assignment; uklonjena provjera grada zaposlenika vs `warehouse.cityId`.

## 2026-06-17 (warehouse opseg bez grada)

- `evaluateEquipmentInCommitteeScope`: komisija sa `warehouseId` koristi samo warehouse coverage / `warehouseId` (bez usporedbe grada nosioca i `Warehouse.cityId`).
- Popravka: PJ Maglaj / poslovne jedinice pod ED Zenica u opsegu Skladišta ED Zenica (rashod, wizard brojači, linije popisa).
- Legacy komisije bez `warehouseId`: city-wide opseg nepromijenjen.

## 2026-06-17 (disposal scope evaluator)

- `markForDisposal` i `findEligibleSessionsForEquipment` koriste `evaluateEquipmentInCommitteeScope` (grad skladišta komisije + warehouse coverage za `zaduzeno`), umjesto poređenja session.orgUnit vs holder.orgUnit grada.

## 2026-06-15 (guardovi + toast)

- FE guardovi: `canDeleteInventorySession`, `canDeleteInventoryCommittee`, `canActivateInventorySession`.
- Toast pattern: mutacija odvojena od refresh (`refreshAfterMutation`).

## 2026-06-15 (disposal warehouse fallback)

- Rashod eligible/mark: skladište za `zaduzeno` — fallback `stockLot.warehouseId`, transfer `zaduzenje`, org nosioca (admin bez registrar scope).

## 2026-06-15 (sesija + za_rashod + pretraga)

- Kaskadno brisanje draft sesije (komisije rashoda, lista, slotovi); `za_rashod` oprema → `skladiste`.
- Globalni lock: max jedna otvorena sesija u sistemu.
- Lista za rashod postavlja status opreme `za_rashod`; povrat/odbijanje → `skladiste`.
- Pretraga opreme proširena na JSON specifikaciju (`search`, opcionalno `specFieldId` + `specValue`).

## 2026-06-15 (fix slotovi + rashod)

- Provisioning slotova: sva aktivna skladišta (`warehouses.isActive`), ne org-stablo distribucije — uključuje skladišta na vrhu hijerarhije.
- `POST reconcile-slots` + admin UI **Osvježi slotove** za postojeće draft sesije.
- Rashod eligible: slot-first; `skladiste` koristi `equipment.warehouseId` bez provjere grada.
- Konfiguracija slota: skladište s postojećim slotom u sesiji dopušteno i izvan org-stabla distribucije.
- Dialog **Za rashod**: ispravan `ModalRoot` (X, Escape, backdrop, footer).

## 2026-06-15 (auto slotovi)

- `InventoryCommittee.membersConfigured` — auto slotovi (skladište × ASSET kategorija) pri kreiranju draft sesije.
- Koordinator/admin konfigurišu članove putem `PATCH committees/:id`; `POST` samo uz `features.inventory_manual_committee_create`.
- Aktivacija zahtijeva sve slotove konfigurisane; rashod provjerava postojanje slota + `GET eligible-for-equipment`.
- Scheduler: auto draft + slotovi i na **1.1.** (uz postojeći lock dan).

## 2026-06-15 (faza 5)

- Produkcijski režim: scheduler (`INVENTORY_SCHEDULER_ENABLED`), auto draft na lock datum, auto-close na end datum (bez force ako pending rashod).
- Production freeze proširen na warehouse-stock; freeze-banner vraća `productionLockSessions`.
- Uloga `popis_koordinator` + `InventoryCoordinatorAssignment`; CRUD komisija u draft sesiji.

## 2026-06-15

- Lista za rashod (`EquipmentDisposalListItem`) u draft sesiji; API disposal-list; dodjela pri `createCommittee`.
- Aktivacija sesije blokirana dok postoje nedodijeljene stavke liste.

## 2026-06-05 (c)

- `session-warehouses` i validacija komisije: skladišta po org stablu distribucije (ne samo grad distribucije); opseg opreme/kategorija po gradu skladišta.
- Wizard korak 2: sve ASSET roditeljske kategorije (i s 0 opreme); kandidati opreme po org opsegu skladišta.

## 2026-06-05 (b)

- Admin Popis: automatska krovna distribucija (bez dropdowna); brisanje draft sesije bez komisija; brisanje/izmjena komisija u draft sesiji.

## 2026-06-05

- `InventoryCommittee.warehouseId`: popisna komisija vezana za skladište + kategoriju.
- Unique `(sessionId, warehouseId, categoryId)`; wizard 5 koraka; opseg opreme sužen na skladište.
- API: `session-warehouses`, `committees/setup-options`; admin UI restrukturiran (empty state, liste, detalj).
- Legacy komisije bez `warehouseId`: city-wide opseg (read-only).

## 2026-06-03

- Auto `InventoryWarehouseCommittee` pri aktivaciji sesije (po skladištu u gradu distribucije).
- `InventoryWarehouseLine`: popis lotova (prisutnost + količina); skladištari kao članovi.

## 2026-06-02

- Pending actions i close job za kategorijske komisije.
