#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v eas >/dev/null 2>&1; then
  exec npx eas-cli build --platform android --profile preview --non-interactive
fi
exec eas build --platform android --profile preview --non-interactive
