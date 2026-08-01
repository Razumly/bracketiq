#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_file="$repo_root/iosApp/iosApp.xcodeproj/project.pbxproj"
info_plist="$repo_root/iosApp/iosApp/Info.plist"
api_source="$repo_root/core/network/src/iosMain/kotlin/com/razumly/mvp/core/network/ApiBaseUrl.ios.kt"

fail() {
  echo "iOS release API base URL contract failed: $*" >&2
  exit 1
}

[[ -f "$project_file" ]] || fail "Xcode project file was not found"
[[ -f "$info_plist" ]] || fail "iOS Info.plist was not found"
[[ -f "$api_source" ]] || fail "iOS API resolver source was not found"

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

echo "iOS release API base URL contract passed"
