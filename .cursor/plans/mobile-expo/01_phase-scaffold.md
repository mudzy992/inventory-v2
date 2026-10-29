# Faza 1 — Scaffold + EAS + tema

- `npx create-expo-app@latest mobile --template tabs`
- Android-only: `app.json` package `top.ba101.evidens`, nema iOS prebuild
- `expo-build-properties`: minSdk 35, target 36, compile 37, R8 + shrink
- Plugin `plugins/with-arm64-only.js` → `reactNativeArchitectures=arm64-v8a`
- `eas.json` preview/production APK, `EXPO_PUBLIC_API_URL=https://api.evidens.ba101.top`
- `scripts/eas-android.sh`
- Tema: port `DESIGN_TOKENS` + Inter + lucide-react-native
- Ažurirati `.cursor/rules/00_project.mdc` da uključi `mobile/`
