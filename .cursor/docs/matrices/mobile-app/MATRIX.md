# Matrica — Evidens Android

## Klijent

| Ekran | API |
|-------|-----|
| Login | `POST /auth/login` |
| Sesija | `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` |
| Start gate | `GET /settings/public` → `features.mobile_app` |
| Flagovi | `GET /settings/effective` |
| Sken / pretraga opreme | `GET /equipment?search=`, `GET /equipment/:id` |
| Detalj (prikaz) | `GET /public/equipment/:id` (fallback auth DTO) |
| Historija | `GET /transfers?equipmentId=` |
| Prenos | `POST /transfers` |
| Radnici | `GET /employees?search=`, `GET /employees/:id/profile` |
| Bootstrap prenosa | `GET /org-units`, `GET /warehouses` |

## Flagovi

| Key | Efekat na mobilnom |
|-----|--------------------|
| `features.mobile_app` | blocked ekran |
| `features.equipment` | pretraga / detalj |
| `features.qr_scanner` | skener tab |
| `features.transfers` | Zaduži / Prenesi / Razduži |
| `features.employees` | tab radnika |

## Build

Android 15+ (API 35), samo `arm64-v8a`, EAS profil `preview` APK.
API baza: `https://api.evidens.ba101.top`.
