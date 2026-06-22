# Changelog — moderator

## 2026-06-22

- FE: moderator vidi sve kategorije (read) u dropdownima i na stranici „Oprema po kategorijama”; org stablo prikazuje scoped forest roots (npr. ED Zenica / Područje snabdjevanja) umjesto praznog prikaza.

## 2026-06-20 (scoped admin)

- Proširenje: equipment/transfer FULL CRUD u org scope; skladišne operacije + transfer template samo na `moderatorWarehouseIds`; bez kreiranja skladišta; org promjena FULL u scope; popis parity `popis_koordinator`.

## 2026-06-20

- Inicijalna matrica uloge `moderator`: dual assignment (org root + warehouse), capability paket, hard deny lista, edge-caseovi.
- Implementacija: backend scope servis, users/org/employees/warehouses/inventory committees, scoped read (equipment, transfers, disposal, relocation), frontend nav + user management UI.
- Fix: moderator `@Roles` na GET `categories`, `locations` (cantons/cities), `nav/module-badges`, `equipment-catalog` (bootstrap read).
