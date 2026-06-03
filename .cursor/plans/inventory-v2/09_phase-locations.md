# Faza 9 — Lokacije

**Status:** gotovo (2026-05-29)

## Cilj

Registar kantona/gradova, veza na org jedinice, nasljeđivanje efektivne lokacije.

## Isporuka

- Prisma: `Canton`, `City`, `OrgUnit.locationCityId`, `effectiveLocationCityId`
- `LocationsModule`, `resolve-effective-location.util.ts`
- Frontend: `LocationsPage`, picker na `OrganizationPage`
- Matrica: `.cursor/docs/matrices/locations/`

## Seed

Kanton Sarajevo, gradovi Sarajevo/Zenica, distribucija Sarajevo s lokacijom.
