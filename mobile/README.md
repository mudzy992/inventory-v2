# Evidens — Android

Expo 58 klijent na `https://api.evidens.ba101.top` (bez `/backend` prefiksa).

```bash
npm start
npm run build:android   # lokalni APK → artifacts/evidens.apk (Android SDK)
npm run eas:android     # EAS cloud, treba `eas login`
npm run test:parse-qr
```

`*.apk` je u gitignore.

Android 15+ (API 35), samo `arm64-v8a`. Nema iOS-a ni push notifikacija.

Lokalni API: `EXPO_PUBLIC_API_URL` u `.env`.
