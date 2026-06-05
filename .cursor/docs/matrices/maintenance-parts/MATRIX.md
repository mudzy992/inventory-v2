# Matrica — oprema za održavanje

## Model

| Entitet | Svrha |
|---------|--------|
| `Category.categoryKind` | `ASSET` (default) ili `MAINTENANCE` |
| `CategoryMaintenanceLink` | **ASSET child leaf** (npr. Radne stanice) ↔ MAINTENANCE **parent grupa ili leaf** (npr. Računarski dijelovi, SSD) |
| `WarehouseStockLot.lotKind` | `ISSUABLE` (izdavanje opreme) ili `MAINTENANCE` (količinski dijelovi) |
| `EquipmentInstalledPart` | ugradnja na host `Equipment` |
| `EquipmentInstalledPartEvent` | audit: installed, marked_faulty, removed, replaced |

## Scope (evidentičar)

- Isti princip kao `RegistrarAssignment`: `(warehouseId, hostCategoryId)` mora pokrivati host opremu i maintenance lot.
- Katalog dijelova: vezano na **kategoriju opreme** (`equipment.categoryId`), ne na glavni parent (Računarska oprema).
- Link na MAINTENANCE **parent** uključuje sve leaf dijelove ispod te grupe (`expand-maintenance-catalog`).
- Registrar dodjela: preporuka **child** kategorija + skladište (npr. Radne stanice), ne samo glavni parent.

## Statusi ugrađenog dijela

| Status | Značenje |
|--------|----------|
| `active` | Ugrađen i u upotrebi |
| `faulty` | U kvaru |
| `removed` | Uklonjen (istorija) |

## Tokovi

### Prijem na skladište

- API: `POST /maintenance-parts/warehouses/:id/stock-lots`
- Uloge: skladištar, evidentičar, admin
- Kategorija mora biti `MAINTENANCE` leaf
- `features.maintenance_parts` + freeze inventure (isto kao stock lot create)

### Ugradnja

- API: `POST /maintenance-parts/equipment/:id/install`
- Evidentičar/admin; `quantityOnHand -= n` na lotu
- Validacija: `equipment.categoryId` ima link koji pokriva maintenance leaf (direktno ili preko MAINTENANCE parent grupe)

### Zamjena

- API: `POST /maintenance-parts/parts/:partId/replace`
- Stari → `removed`; novi `active` sa `replacedById` → stari

### Kvar / uklanjanje

- `PATCH .../faulty`, `PATCH .../remove`

## Zabrane

- `ISSUABLE` lot: `POST .../issue` odbija `MAINTENANCE` lotove
- Regular `warehouse-stock` receive odbija `MAINTENANCE` kategorije
- Rashodovana host oprema: nema ugradnje

## Postavke

| Ključ | Default |
|-------|---------|
| `features.maintenance_parts` | true |

## UI

- Kategorije: link panel na **ASSET podkategoriji** (leaf: Radne stanice, Printeri); grupe MAINTENANCE s checkboxom na grupi + leaf-ovima
- Skladište: tab „Održavanje” + prijem sa lot spec poljima (ne-unique polja kategorije) + tabela potrošnje
- Kartica opreme: panel „Ugrađeni dijelovi” (ugradnja/zamjena sa legacy spec poljima)

## Izvještaj potrošnje (B6)

- API: `GET /maintenance-parts/warehouses/:warehouseId/consumption-summary?hostCategoryId=`
- API: `GET /maintenance-parts/linked-host-categories` — samo ASSET kategorije koje imaju link
- Agregacija po `(maintenanceCategory, equipment.categoryId)`: aktivno / u kvaru / uklonjeno / ukupno ugrađeno
- UI: panel ispod liste lotova na tabu Održavanje

## Migracija linkova (ručno)

- Stari linkovi na parent ASSET (npr. Računarska oprema) **ne važe** — obrisati i ponovo vezati na child (Radne stanice, Printeri, …).

## Legacy spec (P3)

- Prijem lota, ugradnja i zamjena šalju `legacySpecs` (lot polja = kategorijska polja bez `unique`)
- Serijski brojevi (`unique`) i transfer dokument za zamjenu — izvan MVP
