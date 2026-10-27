# Javni QR pregled opreme — privacy contract

**Endpoint:** `GET /public/equipment/:id` — jedini neautentifikovani equipment
endpoint (skeniranje QR koda sa telefona). Status odluke: **accepted-risk**,
reviewed 2026-10-27. Kanonski izvor istine je
`backend/src/modules/public-equipment/public-equipment.contract.ts`; CI gate
`backend/prisma/check-public-equipment-contract.ts` poredi taj kontrakt sa
backend i frontend DTO interfejsima preko TypeScript compiler API-ja.

## Odluka vlasnika

Zadržavaju se **sva postojeća polja**, uključujući puno ime i titulu držaoca,
organizacionu putanju, historiju kretanja i brojeve dokumenata — poslovni
proces zahtijeva te podatke na javnoj QR stranici. Privatnosni rizik je
**prihvaćen i dokumentovan**, ne "riješen". Kao protivmjera, tačan oblik
odgovora je **zamrznut**: dodavanje, uklanjanje ili preimenovanje bilo kojeg
polja zahtijeva izričitu odluku vlasnika i izmjenu kontrakta, backend servisa,
frontend DTO-a i ovog dokumenta u istom commitu. Runtime asercija u
`PublicEquipmentService` odbija neusklađen odgovor (500) umjesto da tiho
objavi nerecenzirani podatak.

## Tačan javni DTO

| Polje | Tip | Osjetljivost |
|---|---|---|
| `id` | string | identifikator opreme (PII po vezivanju) |
| `inventoryNumber` | string \| null | inventurni broj |
| `isAccountingTracked` | boolean | poslovni podatak |
| `status` | string | poslovni podatak |
| `categoryName` | string | poslovni podatak |
| `productName` | string \| null | poslovni podatak |
| `uniqueFields` | `{ label, value }[]` | **PII**: serijski brojevi |
| `specifications` | `Record<string, string>` | **PII**: dinamički ključevi, mogu sadržavati serijske brojeve |
| `currentHolder` | `{ fullName, title, orgUnitPath } \| null` | **PII**: identitet, titula, org putanja |
| `warehouse` | `{ name } \| null` | lokacija |
| `movements` | `{ date, type, status, fromLabel, toLabel, documentNumber }[]` | **PII**: imena strana + brojevi dokumenata, cijela historija |
| `disposalReason` | string \| null | poslovni podatak |

Dokumentovane PII putanje (u kontraktu `PUBLIC_EQUIPMENT_PII_PATHS`):
`currentHolder.fullName`, `currentHolder.title`, `currentHolder.orgUnitPath`,
`movements[].fromLabel`, `movements[].toLabel`,
`movements[].documentNumber`, `uniqueFields[].value`, `specifications.*`,
`id`, `inventoryNumber`.

## Operativne kontrole

- **Rate limit:** namjenski Redis bucket po IP-u
  (`RATE_LIMIT_PUBLIC_EQUIPMENT_MAX=60`, `..._WINDOW_SEC=60`,
  `..._FAIL_CLOSED=false`), implementiran kroz `PublicEquipmentRateLimitGuard`.
- **Feature flag:** `features.public_equipment_lookup` može potpuno isključiti
  endpoint (vraća 404).
- **Cache:** Redis `remember` 60 s; smanjuje broj DB upita po QR skeniranju.
- **List cap:** `PUBLIC_EQUIPMENT_MAX_MOVEMENTS` (1–1000, default **200**)
  prosljeđuje se kao `take` u Prisma `transfers` include. Hard cap 1000 se
  dodatno provjerava u runtime aserciji. Nevaljana env vrijednost ruši
  konstrukciju servisa (fail-closed), ne "objavi sve".
- **Org putanja:** umjesto `orgUnit.findMany()` (cijelo stablo u memoriji na
  svakom cache miss), servis prati samo lanac predaka držaoca, sa ciklus
  zaštitom i maksimalnom dubinom 20.
- **Anti-enumeration:** UUID `id` + navedeni rate limit; nema javne list
  rute (`@Get(':id')` je jedini GET u kontroleru).

## Kako promijeniti javni DTO (review proces)

1. Dobiti izričito odobrenje vlasnika za novo/uklonjeno polje i ažurirati
   procjenu rizika u ovom dokumentu.
2. Ažurirati `PUBLIC_EQUIPMENT_SHAPES` (i po potrebi
   `PUBLIC_EQUIPMENT_PII_PATHS`) u `public-equipment.contract.ts`.
3. Ažurirati `PublicEquipmentService.buildResponse()`, backend interfejse,
   `frontend/src/api/public-equipment-api.ts` i ovu tabelu **u istom commitu**.
4. Pokrenuti `npm run test:integration:public-equipment-contract` i
   `npm run test:unit:public-equipment-contract`; CI korak
   `Verify public QR privacy contract` blokira merge dok sve četiri strane ne
   budu usklađene.

## Preostali rizici (vlasnik)

- Prihvaćeno objavljivanje identiteta i historije znači da svako ko dođe do
  QR koda vidi lične podatke. Ako se politika promijeni, opcije su maskiranje
  imena, skraćivanje historije na posljednjih N zapisa uz jasan indikator, ili
  izdvajanje javnog QR tokena sa sopstvenim, užim DTO-jem.
- Ne postoji autentifikacija niti autorizacija po uređaju; UUID je jedina
  tajnost. Rate limit je fail-open po defaultu (dostupnost ispred
  brute-force zaštite) — `RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED=true` za
  stroži režim.
- Nema load testa za QR endpoint pod velikim brojem skeniranja; preporuka je
  izmjeriti nakon uvođenja cap-a.
