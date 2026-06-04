# Changelog — warehouses

## 2026-06-04 (oprema bez direktnog create)

- API matrica: uklonjen `POST /equipment` za admin/evidenticar; oprema samo iz stock lot issue.
- UI Oprema: info blok + prijem robe na detalju skladišta iz taba „Po skladištima“ (`canReceiveStock`).

## 2026-06-04 (UI + create validacija)

- Tab **Kontekst**: `WarehouseContextPanel` (FormCard layout, pun PATCH svih polja).
- Create skladišta: obavezan `orgUnitId` + min 1 skladištar (backend DTO + `WarehousesPage` + org quick create).
- Arhiva templatea: download po `templateId`, UI Preuzmi/Aktiviraj za neaktivne verzije.

## 2026-06-04

- Obrazac prenosnice (.docx) po skladištu: upload/aktivacija API, UI na tabu Kontekst; obavezan `orgUnitId`.
- Effective warehouse walk-up: grad više ne filtrira nasljeđivanje po org stablu (isti princip kao `effectiveSigner` / `effectiveLocation`). `cityId` samo za fallback kad u pretcima nema skladišta.
- Unit testovi: `resolve-effective-warehouse.util.spec.ts`.
- Povezano s org fazom: UI preview na `OrganizationPage` — vidi `org-hierarchy/CHANGELOG.md` (5).

## 2026-06-03

- Prijem robe prebačen na `WarehouseStockLot`; skladištar bez direktnog `Equipment` create.
- Warehouse detail tab „Na skladištu” prikazuje lotove.

## 2026-06-02

- Skladištar read scope po `warehouseId` + status/condition (ne samo global `skladiste`).
