---
name: Override preuzeo placeholder
overview: Dodati optional dokument-only override polje za `{preuzeo}` na transferima tipa `zaduzenje` i `razduzenje`, sa prefillingom iz prethodnih transfera za isti komad opreme i autocomplete prijedlozima iz unikatnih ranije upisanih vrijednosti.
todos:
  - id: db-transfer-override
    content: Dodati nullable `manualPreuzeoLabel` u `Transfer` model i migraciju
    status: completed
  - id: be-transfer-create
    content: Proširiti DTO/create flow i template builder da koriste override samo za `zaduzenje`/`razduzenje`
    status: completed
  - id: be-suggestions-prefill
    content: Dodati backend čitanje posljednje vrijednosti za isti equipment i endpoint za unique suggestions
    status: completed
  - id: fe-transfer-forms
    content: Dodati optional input + autocomplete u `TransfersPage` i `EquipmentCard`, te slanje kroz payload
    status: completed
  - id: fe-mapping
    content: Ažurirati FE types/api mapiranje za novo polje gdje je potrebno
    status: completed
  - id: docs-matrix
    content: Kratko ažurirati transfer matricu za dokument-only override `{preuzeo}`
    status: completed
isProject: false
---

# Override `{preuzeo}` na prenosnici

## Cilj
Dodati **optional** polje na transferu koje utiče **samo na placeholder `{preuzeo}`** u Word/PDF prenosnici, bez promjene postojeće poslovne logike transfera, statusa opreme ili starih transfer zapisa.

Obuhvat:
- `zaduzenje` (`skladiste -> osoba`)
- `razduzenje` (`osoba -> skladiste`)
- ne obuhvata `prenos` (`osoba -> osoba`)

## Trenutno stanje
`{preuzeo}` se danas generiše iz ciljne strane transfera:

```45:57:backend/src/modules/transfers/utils/build-transfer-template-data.util.ts
return {
  broj_prenosnice: transfer.documentNumber,
  predao: formatParty(transfer.fromType, transfer.fromPerson, transfer.fromWarehouse),
  preuzeo: formatParty(transfer.toType, transfer.toPerson, transfer.toWarehouse),
  potpisnik: formatPerson(transfer.signer),
```

`Transfer` model nema posebno override polje u [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma), a payload za kreiranje transfera ide kroz [`backend/src/modules/transfers/dto/create-transfer.dto.ts`](backend/src/modules/transfers/dto/create-transfer.dto.ts) i [`frontend/src/helpers/create-transfer-payload.util.ts`](frontend/src/helpers/create-transfer-payload.util.ts).

## Predložena implementacija

### 1. Baza i Prisma model
U [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) dodati novo nullable tekstualno polje na `Transfer`, npr.:
- `manualPreuzeoLabel String? @db.VarChar(255)`

Napomena:
- Polje je **dokument-only override**.
- Stari transferi ostaju netaknuti; admin ih po potrebi može ručno editovati kasnije kroz postojeće admin mehanizme ili budući UI.

### 2. Backend DTO i create flow
U [`backend/src/modules/transfers/dto/create-transfer.dto.ts`](backend/src/modules/transfers/dto/create-transfer.dto.ts) dodati optional string, npr. `manualPreuzeoLabel?: string`.

U [`backend/src/modules/transfers/transfers.service.ts`](backend/src/modules/transfers/transfers.service.ts):
- snimati vrijednost samo za `zaduzenje` i `razduzenje`
- za ostale tipove ignorisati
- po želji trim + empty-string -> `null`

To ne mijenja:
- `equipment` update logiku
- scope/freeze/cross-service pravila
- finalizaciju
- postojeće transfer zapise

### 3. Generisanje placeholdera
U [`backend/src/modules/transfers/utils/build-transfer-template-data.util.ts`](backend/src/modules/transfers/utils/build-transfer-template-data.util.ts):
- proširiti `TransferForTemplate` sa `manualPreuzeoLabel`
- `preuzeo` računati kao:
  - `manualPreuzeoLabel`, ako postoji i nije prazan
  - inače postojeći `formatParty(...)`

To zadržava sadašnji default za sve transfere bez override-a.

### 4. Prefill za isti komad opreme
Dodati backend read helper u `TransfersService` koji za dati `equipmentId` vraća:
- posljednju ne-praznu `manualPreuzeoLabel` vrijednost sa transfera tog komada opreme
- samo za tipove `zaduzenje` / `razduzenje`

Na frontendu, kad korisnik otvori formu za `zaduzenje` ili `razduzenje` i odabere opremu, polje se prefill-a tom vrijednošću ako postoji.

Time dobijamo baš ponašanje koje si tražio:
- ako je ranije ručno definisano za taj komad, nudimo istu vrijednost odmah
- ako nije, korisnik prvi put unosi ručno

### 5. Autocomplete prijedlozi
Dodati mali readonly endpoint u transfers modulu, npr. nešto tipa:
- `GET /backend/transfers/manual-preuzeo-suggestions`

Backend vraća:
- unikatne ne-prazne `manualPreuzeoLabel` vrijednosti iz `transfers` tabele
- sortirane i limitirane

Frontend koristi te vrijednosti kao autocomplete source u formama:
- [`frontend/src/components/TransfersPage.tsx`](frontend/src/components/TransfersPage.tsx)
- [`frontend/src/components/EquipmentCard.tsx`](frontend/src/components/EquipmentCard.tsx)

Pošto u projektu već postoje autocomplete obrasci poput [`frontend/src/components/searchable-autocomplete.tsx`](frontend/src/components/searchable-autocomplete.tsx), iskoristiti postojeći UI pattern gdje je smisleno; za jednostavniju verziju može i input + datalist ako je dovoljno lagano.

### 6. Frontend forma
U oba transfer entry mjesta dodati novo optional polje, samo za:
- `zaduzenje`
- `razduzenje`

Fajlovi:
- [`frontend/src/components/TransfersPage.tsx`](frontend/src/components/TransfersPage.tsx)
- [`frontend/src/components/EquipmentCard.tsx`](frontend/src/components/EquipmentCard.tsx)
- [`frontend/src/helpers/create-transfer-payload.util.ts`](frontend/src/helpers/create-transfer-payload.util.ts)
- [`frontend/src/types.ts`](frontend/src/types.ts) ako treba za response/record mapiranje

UI copy:
- label: `Preuzeo (za prenosnicu)`
- help text: `Optionalno. Ako unesete vrijednost, koristi se samo na dokumentu umjesto podrazumijevanog naziva skladišta ili osobe.`

### 7. API i mapiranje transfer row
Ako transfer row ide nazad u FE i želimo kasnije prikaz/edit mogućnosti, proširiti mapiranje u:
- [`frontend/src/api/transfers-api.ts`](frontend/src/api/transfers-api.ts)
- [`frontend/src/types.ts`](frontend/src/types.ts)

To nije kritično za sam create flow, ali je korisno da polje bude dostupno u FE modelu odmah.

## Minimalni fajlovi za izmjenu
- [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)
- [`backend/src/modules/transfers/dto/create-transfer.dto.ts`](backend/src/modules/transfers/dto/create-transfer.dto.ts)
- [`backend/src/modules/transfers/transfers.service.ts`](backend/src/modules/transfers/transfers.service.ts)
- [`backend/src/modules/transfers/utils/build-transfer-template-data.util.ts`](backend/src/modules/transfers/utils/build-transfer-template-data.util.ts)
- [`frontend/src/helpers/create-transfer-payload.util.ts`](frontend/src/helpers/create-transfer-payload.util.ts)
- [`frontend/src/components/TransfersPage.tsx`](frontend/src/components/TransfersPage.tsx)
- [`frontend/src/components/EquipmentCard.tsx`](frontend/src/components/EquipmentCard.tsx)
- [`frontend/src/api/transfers-api.ts`](frontend/src/api/transfers-api.ts)
- [`frontend/src/types.ts`](frontend/src/types.ts)

## Test / verifikacija
- `razduzenje` bez novog polja: `{preuzeo}` ostaje naziv skladišta kao danas
- `razduzenje` sa novim poljem: `{preuzeo}` koristi ručni unos
- `zaduzenje` bez novog polja: `{preuzeo}` ostaje osoba kao danas
- `zaduzenje` sa novim poljem: `{preuzeo}` koristi ručni unos
- `prenos` (`osoba -> osoba`): nema novog polja i nema promjene ponašanja
- za isti `equipmentId`, forma pri novom `zaduzenje`/`razduzenje` prefill-a posljednju ručnu vrijednost
- autocomplete prikazuje unikatne ranije upisane vrijednosti iz kolone

## Napomena o matricama
Pošto je ovo mala dokument-only logika, ažurirati transfer matricu kratko:
- override utiče samo na render placeholdera `{preuzeo}`
- ne utiče na ownership, warehouse routing, status ni finalize logiku
