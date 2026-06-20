# Changelog — moderator

## 2026-06-20

- Inicijalna matrica uloge `moderator`: dual assignment (org root + warehouse), capability paket, hard deny lista, edge-caseovi.
- Implementacija: backend scope servis, users/org/employees/warehouses/inventory committees, scoped read (equipment, transfers, disposal, relocation), frontend nav + user management UI.
- Fix: moderator `@Roles` na GET `categories`, `locations` (cantons/cities), `nav/module-badges`, `equipment-catalog` (bootstrap read).
