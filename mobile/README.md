# Evidens — Android

Expo 58 klijent na `https://api.evidens.ba101.top` (bez `/backend` prefiksa).

```bash
npm start
npm run eas:android   # treba `eas login`
npm run test:parse-qr
```

Android 15+ (API 35), samo `arm64-v8a`. Nema iOS-a ni push notifikacija.

Lokalni API: `EXPO_PUBLIC_API_URL` u `.env`.
