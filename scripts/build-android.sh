#!/usr/bin/env bash
# Build from the mobile repository root, without sibling projects or local tool paths.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
if [[ ! -d node_modules/expo ]]; then
  printf '%s\n' 'Önce bu depoda npm ci çalıştırın.' >&2
  exit 1
fi
npx --no-install expo prebuild --platform android --no-install
NODE_ENV=production ./android/gradlew -p android :app:assembleRelease \
  :cepdesk-native:testReleaseUnitTest --no-daemon --max-workers=2 \
  "-PreactNativeArchitectures=${CEPDESK_ANDROID_ARCHITECTURES:-arm64-v8a,x86_64}" "$@"
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/CepDesk.apk
printf '%s\n' 'APK: release/CepDesk.apk' 'Kalıcı dağıtım için kendi imzalama anahtarınızı kullanın; README.md dosyasına bakın.'
