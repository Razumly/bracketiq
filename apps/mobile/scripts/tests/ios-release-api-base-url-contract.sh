#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_file="$repo_root/iosApp/iosApp.xcodeproj/project.pbxproj"
info_plist="$repo_root/iosApp/iosApp/Info.plist"
api_source="$repo_root/core/network/src/iosMain/kotlin/com/razumly/mvp/core/network/ApiBaseUrl.ios.kt"
sanitizer="$repo_root/scripts/sanitize-ios-release-runtime-urls.sh"

fail() {
  echo "iOS release API base URL contract failed: $*" >&2
  exit 1
}

[[ -f "$project_file" ]] || fail "Xcode project file was not found"
[[ -f "$info_plist" ]] || fail "iOS Info.plist was not found"
[[ -f "$api_source" ]] || fail "iOS API resolver source was not found"
[[ -x "$sanitizer" ]] || fail "iOS Release runtime URL sanitizer was not found or is not executable"

release_target_config="$(awk '
  index($0, "7555FFA7242A565B00829871 /* Release */ = {") { in_release = 1 }
  in_release { print }
  in_release && $0 ~ /^[[:space:]]*name = Release;$/ { exit }
' "$project_file")"
debug_target_config="$(awk '
  index($0, "7555FFA6242A565B00829871 /* Debug */ = {") { in_debug = 1 }
  in_debug { print }
  in_debug && $0 ~ /^[[:space:]]*name = Debug;$/ { exit }
' "$project_file")"

[[ -n "$release_target_config" ]] || fail "iOS app Release target configuration was not found"
[[ -n "$debug_target_config" ]] || fail "iOS app Debug target configuration was not found"
grep -Fq 'MVP_RELEASE_API_BASE_URL = https://bracket-iq.com;' <<<"$release_target_config" \
  || fail "iOS app Release target does not pin the production API endpoint"
if grep -Fqi 'ngrok' <<<"$release_target_config"; then
  fail "iOS app Release target contains an ngrok endpoint"
fi
if grep -Fq 'MVP_RELEASE_API_BASE_URL' <<<"$debug_target_config"; then
  fail "iOS app Debug target unexpectedly pins the Release API endpoint"
fi

grep -Fq $'\t<key>MVP_RELEASE_API_BASE_URL</key>' "$info_plist" \
  || fail "Info.plist does not expose the Release API endpoint setting"
grep -Fq $'\t<string>$(MVP_RELEASE_API_BASE_URL)</string>' "$info_plist" \
  || fail "Info.plist does not resolve the Release API endpoint build setting"

grep -Fq 'RELEASE_API_BASE_URL_INFO_KEY' "$api_source" \
  || fail "iOS API resolver does not read the Release API endpoint"
grep -Fq 'releaseConfiguredApiBaseUrl()' "$api_source" \
  || fail "iOS API resolver does not prefer the Release API endpoint"
release_guard_count="$(grep -Fc 'if (releaseConfigured.isNotBlank())' "$api_source")"
[[ "$release_guard_count" -eq 2 ]] \
  || fail "iOS API and redirect resolvers do not force the Release endpoint"

sanitizer_phase_count="$(grep -Fc 'scripts/sanitize-ios-release-runtime-urls.sh' "$project_file")"
[[ "$sanitizer_phase_count" -eq 2 ]] \
  || fail "iOS app and watch targets do not both sanitize Release runtime URLs"

test_root="$(mktemp -d "${TMPDIR:-/tmp}/mvp-ios-release-url-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

create_runtime_secrets() {
  plist="$1"
  mkdir -p "$(dirname "$plist")"
  plutil -create xml1 "$plist"
  /usr/libexec/PlistBuddy -c 'Add :mvpApiBaseUrl string http://localhost:3000' "$plist"
  /usr/libexec/PlistBuddy -c 'Add :mvpApiBaseUrlRemote string https://example.ngrok-free.dev' "$plist"
  /usr/libexec/PlistBuddy -c 'Add :mvpWebBaseUrl string https://example.ngrok-free.dev' "$plist"
}

release_product="$test_root/release/BracketIQ.app"
release_secrets="$release_product/Secrets.plist"
create_runtime_secrets "$release_secrets"
CONFIGURATION=Release \
TARGET_BUILD_DIR="$test_root/release" \
UNLOCALIZED_RESOURCES_FOLDER_PATH=BracketIQ.app \
MVP_RELEASE_API_BASE_URL=https://bracket-iq.com \
  "$sanitizer"

for property_name in mvpApiBaseUrl mvpApiBaseUrlRemote mvpWebBaseUrl; do
  value="$(/usr/libexec/PlistBuddy -c "Print :$property_name" "$release_secrets")"
  [[ "$value" == "https://bracket-iq.com" ]] \
    || fail "Release Secrets.plist $property_name is not production"
done
if grep -Fqi 'ngrok' "$release_secrets"; then
  fail "Release Secrets.plist still contains an ngrok endpoint"
fi

debug_product="$test_root/debug/BracketIQ.app"
debug_secrets="$debug_product/Secrets.plist"
create_runtime_secrets "$debug_secrets"
CONFIGURATION=Debug \
TARGET_BUILD_DIR="$test_root/debug" \
UNLOCALIZED_RESOURCES_FOLDER_PATH=BracketIQ.app \
  "$sanitizer"
debug_remote="$(/usr/libexec/PlistBuddy -c 'Print :mvpApiBaseUrlRemote' "$debug_secrets")"
[[ "$debug_remote" == "https://example.ngrok-free.dev" ]] \
  || fail "Debug Secrets.plist did not retain the development endpoint"

echo "iOS release API base URL contract passed"
