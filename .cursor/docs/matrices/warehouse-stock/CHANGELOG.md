# Changelog — warehouse-stock

## 2026-06-12

- Frontend: migracija na React Router (URL rute, bookmark, back/forward); deep link lota `/registrar-stock/lots/:lotId`.
- Evidentičar može **izmijeniti** lot specifikaciju dok lot nije `zatvoreno` (`spremno_za_izdavanje`); UI komponenta `lot-specification-section.tsx`.

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
