#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
build_files=(
  "$repo_root/composeApp/build.gradle.kts"
  "$repo_root/core/network/build.gradle.kts"
  "$repo_root/wearApp/build.gradle.kts"
)
generated_build_configs=(
  "$repo_root/composeApp/build/generated/source/buildConfig/release/com/razumly/mvp/BuildConfig.java"
  "$repo_root/core/network/build/generated/source/buildConfig/release/com/razumly/mvp/core/network/BuildConfig.java"
  "$repo_root/wearApp/build/generated/source/buildConfig/release/com/razumly/mvp/wear/BuildConfig.java"
)
release_properties="$repo_root/release.properties"
google_services_config="$repo_root/composeApp/google-services.json"
temporary_google_services_created=false

fail() {
  echo "Android release API base URL contract failed: $*" >&2
  exit 1
}

cleanup() {
  if [[ "$temporary_google_services_created" == true ]]; then
    rm -f -- "$google_services_config"
  fi
}
trap cleanup EXIT

if [[ ! -f "$google_services_config" ]]; then
  temporary_google_services_created=true
  cat > "$google_services_config" <<'JSON'
{
  "project_info": {
    "project_number": "123456789",
    "project_id": "example-project"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:123456789:android:example",
        "android_client_info": {
          "package_name": "com.razumly.mvp"
        }
      },
      "oauth_client": [
        {
          "client_id": "example-web-client.apps.googleusercontent.com",
          "client_type": 3
        }
      ],
      "api_key": [
        {
          "current_key": "example-api-key"
        }
      ]
    }
  ],
  "configuration_version": "1"
}
JSON
fi

for build_file in "${build_files[@]}"; do
  [[ -f "$build_file" ]] || fail "${build_file#"$repo_root/"} was not found"
done
[[ -f "$release_properties" ]] || fail "release.properties was not found"
for property_name in MVP_API_BASE_URL MVP_API_BASE_URL_REMOTE MVP_WEB_BASE_URL; do
  grep -Fxq "$property_name=https://bracket-iq.com" "$release_properties" \
    || fail "release.properties does not pin $property_name to production"
done
if grep -Fqi 'ngrok' "$release_properties"; then
  fail "release.properties contains an ngrok endpoint"
fi

(
  cd "$repo_root"
  ./gradlew \
    :composeApp:generateReleaseBuildConfig \
    :core:network:generateReleaseBuildConfig \
    :wearApp:generateReleaseBuildConfig \
    --no-daemon \
    --console=plain
)

for build_file in "${build_files[@]}"; do
  release_block="$(awk '
    /^[[:space:]]*buildTypes[[:space:]]*\{/ { in_build_types = 1 }
    in_build_types { print }
    in_build_types && /^[[:space:]]*compileOptions[[:space:]]*\{/ { exit }
  ' "$build_file")"

  for property_name in MVP_API_BASE_URL MVP_API_BASE_URL_REMOTE MVP_WEB_BASE_URL; do
    grep -Fq "$property_name" <<<"$release_block" \
      || fail "${build_file#"$repo_root/"} Release does not override $property_name"
  done
  production_override_count="$(grep -Fc 'productionApiBaseUrl.asBuildConfigString()' <<<"$release_block")"
  [[ "$production_override_count" -eq 3 ]] \
    || fail "${build_file#"$repo_root/"} Release does not pin all URL values to production"
  if grep -Fqi 'ngrok' <<<"$release_block"; then
    fail "${build_file#"$repo_root/"} Release contains an ngrok endpoint"
  fi
done

for generated_build_config in "${generated_build_configs[@]}"; do
  [[ -f "$generated_build_config" ]] \
    || fail "${generated_build_config#"$repo_root/"} was not generated"
  for property_name in MVP_API_BASE_URL MVP_API_BASE_URL_REMOTE MVP_WEB_BASE_URL; do
    grep -Fq "public static final String $property_name = \"https://bracket-iq.com\";" \
      "$generated_build_config" \
      || fail "${generated_build_config#"$repo_root/"} $property_name is not production"
  done
  if grep -Fqi 'ngrok' "$generated_build_config"; then
    fail "${generated_build_config#"$repo_root/"} contains an ngrok endpoint"
  fi
done

echo "Android release API base URL contract passed"
