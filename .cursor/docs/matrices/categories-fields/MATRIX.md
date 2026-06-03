# Matrica — kategorije i dinamička polja

## Hijerarhija

- Parent kategorija: `parentId = null`, `fields` obično prazno
- Sub-kategorija (leaf): oprema mora referencirati **leaf** (`children.length === 0`)

## Polje (`CategoryField`)

| Svojstvo | Tipovi |
|----------|--------|
| `type` | `text`, `number`, `date`, `select` |
| `required` | obavezno u `specifications` |
| `unique` | business pravilo (inventory broj je poseban unique) |
| `options` | obavezno za `select` |

## Validacija opreme

`specifications` mora sadržavati sva `required` polja; ključevi moraju postojati u fields + optionalFields.

## API (faza 2)

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/categories`, `/tree` | admin, evidenticar |
| POST/PATCH/DELETE | `/backend/categories` | admin |
