# CHANGELOG — employee-relocation

## 2026-06-05 (lot accounting)

- Pri **prihvatu na cilju**: izvorni lot `quantityReceived -= 1`; dest lot `quantityReceived += 1`.
- Zadužena oprema: dest `quantityOnHand` ostaje 0; skladište (edge) oba broja `+= 1`.
- Util `relocation-lot-accounting.util.ts` + unit testovi.

## 2026-06-05 (catalog map UX)

- Admin-only `PATCH /employee-relocation/lines/:id/map-catalog` + audit event `catalog_mapped`.
- Preview: `unmappedEquipment`; admin-alerts: `unmappedCatalogLines`.
- Frontend Org. promjena: status šifrarnika, **Mapiraj tip**, disabled **Prebaci**.
- Notifikacije `employee_relocation_*` linkaju na Org. promjena.

## 2026-06-05

- Inicijalna matrica: promjena org. jedinice, šifrarnik, cross-warehouse transfer bez prenosnice, virtual pending lot.
