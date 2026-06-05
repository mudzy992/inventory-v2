# Maintenance parts — CHANGELOG

## 2026-06-04 (kategorije UI)

- Katalog dijelova (CategoryMaintenanceLink) premješten u dijalog uređivanja ASSET leaf podkategorije; na listi samo badge prikaz odabranog kataloga.
- Kategorije: odvojeni tabovi Oprema / Održavanje.
- Prijem opreme (ISSUABLE lot): dropdown samo ASSET leaf kategorije.

## 2026-06-04 (kategorije UI — tabovi dijalog + autocomplete katalog)

- Dijalog ASSET podkategorije: 3 taba (Osnovni detalji, Specifikacija, Katalog dijelova).
- Specifikacija: „+ Dodaj polje” na dnu liste; novo polje se dodaje na dno liste.
- Katalog: autocomplete grupa održavanja + checkbox tipovi po grupi (više grupa).
- Lista opreme: badge polja (* obavezno, ● unikat) uz katalog dijelova.

## 2026-06-04

- Inicijalni modul: Prisma šema, `MaintenancePartsModule`, registry `features.maintenance_parts`, admin linkovi kategorija, skladišni prijem, ugradnja/zamjena/kvar na host opremi.

## 2026-06-04 (migracija MySQL)

- `20260604160000_maintenance_parts`: skraćena imena indeksa/FK (limit 64 znaka); `rollback_partial.sql` za oporavak nakon P3018.

## 2026-06-04 (UX)

- Zamjena ugrađenog dijela na mobilnom: bottom sheet (`md:hidden`) umjesto inline forme na dnu panela; desktop ostaje inline.

## 2026-06-04 (B6 + P3)

- B6: `consumption-summary` endpoint + panel potrošnje na skladištu (filter host kategorije).
- P3: UI za legacy spec polja na prijemu lota i ugradnji/zamjeni (`CategoryLotSpecFields`).

## 2026-06-04 (child host linkovi)

- **Breaking (semantika):** `hostCategoryId` = ASSET **leaf** (Radne stanice, Printeri), ne parent Računarska oprema.
- MAINTENANCE link može biti **parent grupa** (Računarski dijelovi) ili leaf (SSD); expand pri ugradnji.
- UI: katalog na podkategoriji u Kategorijama; oprema koristi samo link na svojoj `categoryId`.
- API: `GET /maintenance-parts/linked-host-categories`.
- Potrošnja agregirana po `equipment.categoryId`.
- Migracija: ručno premapiranje starih parent linkova.
