# Matrica — kategorije i dinamička polja

## Hijerarhija

- Parent kategorija: `parentId = null`, `fields` obično prazno
- Sub-kategorija (leaf): oprema mora referencirati **leaf** (`children.length === 0`)

## Odjeljci specifikacije (leaf kategorija)

| Odjeljak | DB kolona | UI naziv | Scope | Kada se popunjava |
|----------|-----------|----------|-------|-------------------|
| 1 | `fields` | Polja po komadu | Svaki komad opreme iz lota | Pri **izdavanju** (`POST .../issue`) |
| 2 | `optionalFields` | Polja lota | Cijeli lot | Pri **definisanju lot spec** (`PATCH .../specifications`) |

## Polje po komadu (`Category.fields[]`)

| Svojstvo | Pravilo |
|----------|---------|
| `type` | `text`, `number`, `date`, `select` |
| `required` | Uvijek implicitno `true` (normalizacija pri save) |
| `unique` | Jedina opcija u UI. `true` = globalno jedinstvena vrijednost u leaf podkategoriji |
| `unique: false` | Vrijednost po komadu; **ponavljanje dozvoljeno** (npr. isti vlasnik na više komada) |
| `options` | Obavezno za `select` |

## Polje lota (`Category.optionalFields[]`)

| Svojstvo | Pravilo |
|----------|---------|
| `type` | `text`, `number`, `date`, `select` |
| `required` | Jedina opcija u UI |
| `unique` | Uvijek implicitno `false` (odbijeno pri save ako `true`) |
| `options` | Obavezno za `select` |

## Snapshot na opremi

`Equipment.specifications` = merge lot spec + unit spec pri izdavanju. Izmjena lot spec-a **ne retroaktivno** mijenja već izdatu opremu.

## Validacija opreme (`PATCH /equipment/:id`)

- Sva polja iz `fields` moraju postojati u `specifications` (uvijek obavezna na komadu).
- Polja iz `optionalFields`: obavezna samo ako je `required: true`.
- Nepoznati ključevi u `specifications` → 400.

## Izmjena opreme (evidentičar)

| Polje | Evidentičar | Admin |
|-------|-------------|-------|
| `fields` + `unique: true` | **read-only** (definisano pri izdavanju) | može mijenjati |
| `fields` + `unique: false` | može mijenjati | može mijenjati |
| `optionalFields` (lot snapshot) | može mijenjati | može mijenjati |

- Backend: `resolveRegistrarEquipmentSpecifications`
- Frontend: `EquipmentPage` — disabled/read-only za unit + unique kad uloga nije admin

## Normalizacija pri save kategorije

- `fields[]`: `required = true`, `unique` zadržati
- `optionalFields[]`: `unique = false`, `required` zadržati; `unique: true` → 400

## API

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/categories`, `/tree` | admin, evidenticar |
| POST/PATCH/DELETE | `/backend/categories` | admin |
