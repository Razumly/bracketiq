#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
build_file="$repo_root/core/network/build.gradle.kts"
generated_build_config="$repo_root/core/network/build/generated/source/buildConfig/release/com/razumly/mvp/core/network/BuildConfig.java"

fail() {
  echo "Android release API base URL contract failed: $*" >&2
  exit 1
}

[[ -f "$build_file" ]] || fail "core/network/build.gradle.kts was not found"

(
  cd "$repo_root"
  ./gradlew :core:network:generateReleaseBuildConfig --no-daemon --console=plain
)

release_block="$(awk '
  /^[[:space:]]*buildTypes[[:space:]]*\{/ { in_build_types = 1 }
  in_build_types { print }
  in_build_types && /^[[:space:]]*compileOptions[[:space:]]*\{/ { exit }
' "$build_file")"

for property_name in MVP_API_BASE_URL MVP_API_BASE_URL_REMOTE MVP_WEB_BASE_URL; do
  grep -Fq "$property_name" <<<"$release_block" \
    || fail "the Android Release build does not override $property_name"
done
production_override_count="$(grep -Fc 'productionApiBaseUrl.asBuildConfigString()' <<<"$release_block")"
[[ "$production_override_count" -eq 3 ]] \
  || fail "the Android Release build does not pin all URL values to production"
if grep -Fqi 'ngrok' <<<"$release_block"; then
  fail "the Android Release build configuration contains an ngrok endpoint"
fi

[[ -f "$generated_build_config" ]] || fail "the generated Android Release BuildConfig was not found"
for property_name in MVP_API_BASE_URL MVP_API_BASE_URL_REMOTE MVP_WEB_BASE_URL; do
  grep -Fq "public static final String $property_name = \"https://bracket-iq.com\";" \
    "$generated_build_config" \
    || fail "the generated Android Release $property_name does not use the production endpoint"
done
if grep -Fqi 'ngrok' "$generated_build_config"; then
  fail "the generated Android Release BuildConfig contains an ngrok endpoint"
fi

echo "Android release API base URL contract passed"
