# Changelog — warehouse-stock

## 2026-06-16 (kanonski dest lot)

- Cross-warehouse dispatch sada koristi `resolveCanonicalDestLotInTx`: zatvoreni kanonski lot se reopen-uje pri sljedećem dispatch-u; `quantityReceived` se uvećava na istom lotu (bez duplikata po `catalogItemId`).

## 2026-06-16 (pripadnost pri izdavanju)

- Issue i commission payload uključuju obavezno polje `affiliation` (`distribucija` | `snabdjevanje`).
- UI forma izdavanja/kolaudacije: select Pripadnost (default Distribucija).

## 2026-06-16

- Prijem robe sada **uvećava postojeći lot** u istom skladištu po `catalogItemId` (umjesto kreiranja novog lota za svaki ulaz).
- Dodan `WarehouseStockLotReceipt` kao evidencija prijema (količina + ugovor + datum ulaza) i uveden FIFO za dodjelu `(contractNumber, entryDate)` na `Equipment` pri `issue`/`commission`.
- Dodan preview endpoint za prijem (`receive-preview`) radi jasne poruke skladištaru prije snimanja.

## 2026-06-15 (guard audit)

- `defineSpecifications` sada poziva `assertFeatureEnabled('features.registrar_stock')`.
- FE guardi: `canEditLotSpecifications`, `canIssueFromLot` u `warehouse-stock-guards.ts`.
- BE poruke: `warehouse-stock-messages.util.ts`.

## 2026-06-13

- **Cross-warehouse prikaz:** dest relocation lot auto-`zatvoreno` kad `onHand=0` i komadi izdati; grupna agregacija `totalReceived`/`warehouseCount` uključuje zatvorene lotove; UI filter „Zatvoreno"; badge „Sve izdato" za privremeno stanje.
- **Kolaudacija komada:** `POST /stock-lots/:id/commission` — evidentičar evidentira pojedinačni komad na skladištu bez zaduženja; ista unit validacija kao issue; bez prenosnice; `executeStockLotCommissionInTx`.
- Frontend: dugme „Kolaudiraj 1 komad" + shared forma `lot-unit-action-section.tsx`; kolaudirani komadi u tabeli prikazuju skladište umjesto radnika.

## 2026-06-12

- **Specifikacija po odjeljku:** lot spec = `optionalFields`; issue = sva `fields` (unit). Unikat enforcement na backendu pri issue. Lot bez obaveznih lot polja → `spremno_za_izdavanje` na prijemu.
- API provjera (`npm run test:api:lot-spec`): lot spec PATCH (ceka/spremno/zatvoreno, scope 403, freeze 400), snapshot pri issue, paginacija opreme, bootstrap payload — 15/15 PASS na lokalnoj DB.
- Frontend: migracija na React Router (URL rute, bookmark, back/forward); deep link lota `/registrar-stock/lots/:lotId`.
- Evidentičar može **izmijeniti** lot specifikaciju dok lot nije `zatvoreno` (`spremno_za_izdavanje`); UI komponenta `lot-specification-section.tsx`.
- Specifikacija lota: collapsible kartica — otvorena samo na `ceka_specifikaciju`, zatvara se nakon snimanja i ostaje zatvorena pri sljedećim posjetama.
- Frontend routing: lazy-loaded stranice, route skeleton fallback, prefetch na navigaciji, Vite vendor chunk split (inicijalni JS ~95 kB umjesto monolita ~790 kB).

## 2026-06-11

- Frontend browse: Skladišna roba (`registrar-stock-page`) — parent → podkategorija → grupe proizvoda; shared category-browse komponente.
- Frontend browse: Zalihe održavanja u skladištu — isti pattern za MAINTENANCE kategorije.
- Dijalozi: `ModalRoot` default bez zatvaranja na backdrop/Escape; inline overlay-i migrirani na `ModalRoot`.

## 2026-06-10

- Grupni prikaz skladišne robe: `GET /warehouse-stock/assigned/groups`, filteri `warehouseId` / `categoryId` / `status` / `groupKey` na assigned listi; util `stock-lot-group-key.util.ts`.
- Izdata oprema u detail lota: `issuedUnits.currentHolder` za prikaz nosioca i navigaciju na opremu.
- Cross-warehouse izdavanje (admin): postavka `transfer.allow_admin_cross_warehouse_issue`; lot računovodstvo W1→W2 pri `POST .../issue`; util `cross-warehouse-issue.util.ts`.

## 2026-06-08

- Dva toka izdavanja: s transferom/prenosnicom ili direktno zaduženje (`executeStockLotIssueDirectInTx`).

## 2026-06-03

- Uveden `WarehouseStockLot` i tok prijem → spec → issue.
- Skladištar više ne kreira punu `Equipment` na prijemu.
- Notifikacija `warehouse_stock_received` za evidentičare.
