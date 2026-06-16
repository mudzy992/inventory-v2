# Changelog — locations

## 2026-06-15 (guard audit)

- `deleteCanton` sada poziva `assertFeatureEnabled('features.locations')`.
- `GET /locations/cities` vraća `disposalCommissionCount` po gradu za FE `canDeleteCity`.
- GUARDS_REGISTRY: puni audit redovi.

## 2026-06-15

- BS poruke brisanja (`location-messages.util.ts`); FE guard `canDeleteCanton` / `canDeleteCity`.

## 2026-06-03

- PATCH/DELETE API za kantone i gradove s referentnim provjerama pri brisanju.
- UI Registar: hijerarhijski expandable prikaz kanton → gradovi s edit/delete.
- UI: brojač u Registru sada koristi deduplicirane kantone (isti broj kao redovi u listi); upozorenje ako postoje duplikati ID; redni brojevi u hijerarhiji; tab Kantoni prikazuje kompletnu listu.

## 2026-06-01

- Dokumentovano: opseg evidentičara koristi `effectiveLocationCityId` za zaduženu opremu.
