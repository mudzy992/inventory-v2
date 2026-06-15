## 2026-06-15

- BS poruke brisanja (`category-messages.util.ts`); FE guard `canDeleteCategory`.
- API klijent: prazan DELETE body više ne prikazuje lažnu grešku.

## 2026-06-12

- **Nova semantika odjeljaka:** `fields` = polja po komadu (sva obavezna pri izdavanju, samo Unikat flag); `optionalFields` = polja lota (Obavezno flag, bez Unikat). Scope više nije određen `unique` flagom preko oba niza.
- Evidentičar pri izmjeni opreme: zaključana samo unit polja s `unique: true`.

## 2026-05-29

- Categories API + JSON fields validacija (faza 2).
