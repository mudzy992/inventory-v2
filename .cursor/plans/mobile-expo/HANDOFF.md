# Handoff — Evidens Android

## Stanje

Implementacija po planu `expo_android_mobile`. Lokalni `npx expo start` radi bez Expo naloga. EAS build treba `eas login` ili `EXPO_TOKEN`.

## API

`EXPO_PUBLIC_API_URL=https://api.evidens.ba101.top` (bez `/backend`).

## Build

Lokalni APK (preporučeno):

```bash
cd mobile && npm run build:android
```

Izlaz: `mobile/artifacts/evidens.apk` (nije u gitu). Treba Android SDK (`ANDROID_HOME`).

EAS cloud i dalje: `npm run eas:android` nakon `eas login` / `eas init`.

## Van scope-a

iOS, push, Socket.IO, PDF/potpis, rashod, lot izdavanje.
