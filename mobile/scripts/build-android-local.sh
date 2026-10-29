#!/usr/bin/env bash
# Lokalni Android APK (bez EAS clouda). Izlaz: artifacts/evidens.apk
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="$PWD/artifacts"
mkdir -p "$OUT_DIR"

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  for candidate in "$HOME/Android/Sdk" /usr/lib/android-sdk /opt/android-sdk; do
    if [[ -d "$candidate" ]]; then
      export ANDROID_HOME="$candidate"
      export ANDROID_SDK_ROOT="$candidate"
      break
    fi
  done
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_HOME / ANDROID_SDK_ROOT nisu postavljeni." >&2
  exit 1
fi

export EXPO_NO_GIT_STATUS=1
npx expo prebuild --platform android --non-interactive

cd android
chmod +x gradlew
./gradlew :app:assembleRelease --quiet

APK="$(find app/build/outputs/apk -name '*.apk' | sort | tail -n 1)"
if [[ -z "$APK" ]]; then
  echo "APK nije pronađen nakon gradle builda." >&2
  exit 1
fi

DEST="$OUT_DIR/evidens.apk"
cp "$APK" "$DEST"
echo "APK: $DEST"
