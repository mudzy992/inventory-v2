# CHANGELOG — employee-relocation

## 2026-06-23

- `GET /employee-relocation/preview` dostupan evidentičaru u scope-u radnika (prije org. promjene iz modula Radnici).
- Trigger org. promjene: admin, moderator ili evidentičar (scope radnika).

## 2026-06-16

- Source transfer **Prebaci** koristi `resolveCanonicalDestLotInTx` (isti kanonski lot po `catalogItemId` na cilju; reopen zatvorenog umjesto duplikata).

## 2026-06-05 (spec inheritance)

- Dest relocation lot nasljeđuje lot-specifikaciju sa izvornog lota ili postojećeg lota istog `catalogItemId` na cilju.
- Idempotentno na Prebaci + Prihvati; dest prelazi u `spremno_za_izdavanje` kad spec postoji.

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
