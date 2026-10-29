# Evidens Android — Expo mobile

Android klijent u `mobile/` na postojeći API `https://api.evidens.ba101.top` (bez `/backend` prefiksa). Nema novih write endpointa. Nema iOS-a, pusha ni Socket.IO.

| Polje | Vrijednost |
|-------|------------|
| Package | `top.ba101.evidens` |
| minSdk | 35 (Android 15) + samo `arm64-v8a` |
| SDK | Expo 58, RN 0.88, Expo Router |
| Auth | JWT u SecureStore, isti `/auth/*` kao web |
| Flag | `features.mobile_app` (public, default true) |

Web / QR: `https://evidens.ba101.top/equipment/:id`.

## Ekrani

- Login
- Tabovi: Sken, Oprema, Radnici, Profil
- Detalj opreme (hero + Zaduženje / Specifikacije / Historija)
- Prenos sheet: Zaduži / Prenesi / Razduži
- Profil radnika + zadužena oprema

## Faze

| Faza | Dokument |
|------|----------|
| 1 | [01_phase-scaffold.md](./01_phase-scaffold.md) |
| 2 | [02_phase-auth.md](./02_phase-auth.md) |
| 3 | [03_phase-scan-detail.md](./03_phase-scan-detail.md) |
| 4 | [04_phase-transfer-search.md](./04_phase-transfer-search.md) |

Status: [CHECKLIST.md](./CHECKLIST.md).
