# Matrica: Instalacija / onboarding

## Status

| Endpoint | Auth | Odgovor |
|----------|------|---------|
| `GET /backend/setup/status` | — | `{ needsSetup: boolean }` — `true` ako `users` tabela prazna |

## Inicijalizacija (jednokratno)

| Endpoint | Auth | Pravilo |
|----------|------|---------|
| `POST /backend/setup/initialize` | — | 409 ako postoji bilo koji korisnik |

### Company (obavezno)

- `companyName`, `companyAddress`, `companyCity`
- Opcionalno: `companyPostalCode`, `companyPhone`, `companyEmail`, `companyTaxId`

### Admin (obavezno)

- `adminFirstName`, `adminLastName`, `adminUsername`, `adminPassword` (min 8)
- Opcionalno: `adminEmail`

### Zaštita

- Ako je `SETUP_TOKEN` u env postavljen, tijelo mora sadržavati `setupToken` koji se poklapa.

### Poslije setup-a

- Kreira se `User` (`role: admin`) sa profilnim poljima.
- Postavke: `company.*`, `app.name` = naziv preduzeća, `app.initialized` = `true`.
- Nema auto-logina — korisnik ide na login ekran.

## Frontend

- Ako `needsSetup` → `SetupWizardPage` (3 koraka).
- Javna QR ruta: `/equipment/:uuid` → `PublicEquipmentPage` (bez auth).
