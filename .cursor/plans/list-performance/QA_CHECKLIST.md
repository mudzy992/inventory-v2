# Ručni QA — list performance

Koristi nakon deploya ili lokalno (`npm run dev` u backend + frontend). Označi `[x]` kad prođe.

## Priprema

- [ ] Backend pokrenut, baza seedovana (`npm run db:seed` ili demo seed)
- [ ] Test korisnici dostupni: **admin**, **evidentičar** (s registrar scope), **user** (s employeeId), **skladistar** (warehouse keeper)
- [ ] DevTools → Network: uključen preserve log

## 1. Login i bootstrap

- [ ] Login admin — Network: nema bulk `/equipment`, `/employees`, `/transfers`, `/users` list poziva
- [ ] Bootstrap payload sadrži org-units, categories, warehouses, cantons, cities, notifications (≤50)
- [ ] `AppState` u memoriji: `equipment`, `employees`, `transfers`, `users` su prazni nizovi

## 2. Paginirane liste

- [ ] **Oprema** — scroll / sljedeća stranica; `meta.total` i `meta.page` u response-u
- [ ] **Prenosi** — paginacija + filter po tipu (client na trenutnoj stranici OK)
- [ ] **Zaposlenici** — paginacija; evidentičar vidi samo scope
- [ ] **Skladišta** — paginacija; evidentičar filter (client) ne prikazuje tuđa skladišta
- [ ] **Korisnici** (admin) — paginacija

## 3. Evidentičar scope

- [ ] Lista opreme — samo kategorije/skladišta/org iz dodjele
- [ ] Detalj opreme izvan scope-a → 403 ili nije u listi
- [ ] Novi prenos tipa zaduženje — samo ako ima mode A dodjelu
- [ ] Prenos osoba→osoba unutar scope-a radi; cross-service blokiran (non-admin)

## 4. Ostale uloge

- [ ] **User** — vidi samo svoju opremu (`currentHolderId`)
- [ ] **Skladistar** — vidi stock na dodijeljenim skladištima
- [ ] **Admin** — pun pristup svim listama

## 5. Stranice migrirane s store-a

- [ ] **EquipmentCard** (QR / lista) — detalj i transferi učitavaju se po ID-u
- [ ] **Warehouse detail** — transfers tab paginiran po `warehouseId`
- [ ] **Warehouse stock browse** — lots iterable (nema `lots is not iterable`)
- [ ] **Categories** — statistike kategorija prikazuju brojeve (summary API)
- [ ] **Organization** — org subtree equipment count (API, ne prazan store)
- [ ] **Inventory count** — lazy load sesija / komisija / linija

## 6. Notifikacije

- [ ] Header badge — broj nepročitanih odgovara API-ju (`unread=true`, `meta.total`)
- [ ] Panel prikazuje prvih 50; **Učitaj više** učitava sljedeću stranicu
- [ ] Označi pročitano / označi sve — badge se ažurira
- [ ] (Opciono) Realtime: nova notifikacija stiže preko socket-a

## 7. Postavke

- [ ] Admin → Postavke → tab **Liste**
- [ ] `lists.default_page_size` i `lists.max_page_size` vidljivi i spremanje radi
- [ ] Promjena max page size — API lista clamp-uje `pageSize` (npr. request 500 → max)

## 8. Performanse (smoke)

- [ ] Inicijalni login < 2 s (bez velikih JSON listi)
- [ ] Stranica opreme s 1000+ zapisa — prva stranica < 1 s (lokalno)

## Napomene / bugovi

_(popuni tokom testiranja)_

| # | Korak | Očekivano | Stvarno |
|---|-------|-----------|---------|
|   |       |           |         |
