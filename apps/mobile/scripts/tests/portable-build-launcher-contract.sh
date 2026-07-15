#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
settings_file="$repo_root/settings.gradle.kts"
backend_script="$repo_root/scripts/ensure-local-backend.sh"
emulator_script="$repo_root/scripts/android-emulator-dev.sh"

fail() {
  echo "Portable build/launcher contract failed: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local text="$2"
  if ! rg --fixed-strings --quiet -- "$text" "$file"; then
    fail "missing '$text' in ${file#$repo_root/}"
  fi
}

require_text "$settings_file" 'providers.gradleProperty("mvp.useMavenLocal")'
require_text "$settings_file" 'providers.environmentVariable("MVP_USE_MAVEN_LOCAL")'
require_text "$settings_file" '.getOrElse(false)'

maven_local_count="$(rg --fixed-strings --count -- 'mavenLocal()' "$settings_file")"
if [[ "$maven_local_count" != "1" ]]; then
  fail "settings.gradle.kts must contain exactly one opt-in mavenLocal() declaration"
fi
if ! awk '
  /if \(useMavenLocal\) \{/ { in_opt_in = 1; next }
  in_opt_in && /mavenLocal\(\)/ { found = 1 }
  in_opt_in && /}/ { in_opt_in = 0 }
  END { exit(found ? 0 : 1) }
' "$settings_file"; then
  fail "mavenLocal() must remain inside the useMavenLocal opt-in guard"
fi

if rg --fixed-strings --quiet -- '/mnt/c/Users/samue' "$backend_script"; then
  fail "ensure-local-backend.sh must not contain a developer-specific Windows path"
fi
require_text "$backend_script" 'MVP_SITE_DIR'
require_text "$backend_script" 'if [[ "${BASH_SOURCE[0]}" == "$0" ]]'
require_text "$emulator_script" 'export ANDROID_HOME="$SDK_DIR"'

temporary_root="$(mktemp -d)"
trap 'rm -rf "$temporary_root"' EXIT

explicit_backend="$temporary_root/custom-mvp-site"
mkdir -p "$explicit_backend"
printf '{}\n' > "$explicit_backend/package.json"

# Sourcing is intentionally supported so path resolution can be verified without
# starting Docker, installing dependencies, or launching the backend.
source "$backend_script"
resolved_backend="$(MVP_SITE_DIR="$explicit_backend" resolve_backend_dir)"
expected_backend="$(cd "$explicit_backend" && pwd)"
if [[ "$resolved_backend" != "$expected_backend" ]]; then
  fail "MVP_SITE_DIR did not resolve the explicit backend checkout"
fi

fake_sdk="$temporary_root/android-sdk"
fake_emulator="$fake_sdk/emulator/emulator"
emulator_log="$temporary_root/emulator-invocations.log"
mkdir -p "$(dirname "$fake_emulator")"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s\n" "$*" >> "$FAKE_EMULATOR_LOG"' \
  'if [[ "${1:-}" != "-list-avds" ]]; then exit 64; fi' \
  'printf "\\nPixel_9_Pro_XL_API_35\\r\\nPixel_Tablet\\r\\n"' \
  > "$fake_emulator"
chmod +x "$fake_emulator"

discovered_avd="$(
  ANDROID_HOME="$fake_sdk" \
  ANDROID_SDK_ROOT= \
  ANDROID_AVD_NAME= \
  FAKE_EMULATOR_LOG="$emulator_log" \
  "$emulator_script" avd
)"
if [[ "$discovered_avd" != "Pixel_9_Pro_XL_API_35" ]]; then
  fail "launcher did not select the first installed AVD"
fi
if [[ "$(cat "$emulator_log")" != "-list-avds" ]]; then
  fail "AVD discovery invoked the emulator with an unexpected command"
fi

: > "$emulator_log"
explicit_avd="$(
  ANDROID_HOME="$fake_sdk" \
  ANDROID_AVD_NAME="CI_Test_AVD" \
  FAKE_EMULATOR_LOG="$emulator_log" \
  "$emulator_script" avd
)"
if [[ "$explicit_avd" != "CI_Test_AVD" ]]; then
  fail "ANDROID_AVD_NAME did not preserve the explicit override"
fi
if [[ -s "$emulator_log" ]]; then
  fail "explicit AVD selection must not depend on the installed-AVD listing"
fi

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" != "-list-avds" ]]; then exit 64; fi' \
  > "$fake_emulator"
chmod +x "$fake_emulator"

missing_avd_error="$temporary_root/missing-avd.err"
if ANDROID_HOME="$fake_sdk" ANDROID_AVD_NAME= "$emulator_script" avd \
  > /dev/null 2> "$missing_avd_error"; then
  fail "launcher accepted an empty installed-AVD list"
fi
if ! rg --fixed-strings --quiet -- 'No Android virtual devices are installed.' "$missing_avd_error"; then
  fail "launcher did not explain how to recover when no AVD is installed"
fi

echo "portable build/launcher contract passed"
