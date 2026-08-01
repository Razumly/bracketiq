#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config_file="$repo_root/composeApp/google-services.json"
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk" && -f "$repo_root/local.properties" ]]; then
  android_sdk="$(sed -n 's/^sdk.dir=//p' "$repo_root/local.properties" | head -n 1)"
fi
aapt2="$android_sdk/build-tools/36.0.0/aapt2"
temporary_config_created=false

fail() {
  echo "Google Sign-In release resource contract failed: $*" >&2
  exit 1
}

cleanup() {
  if [[ "$temporary_config_created" == true ]]; then
    rm -f -- "$config_file"
  fi
}
trap cleanup EXIT

if [[ ! -f "$config_file" ]]; then
  temporary_config_created=true
  cat > "$config_file" <<'JSON'
{
  "project_info": {
    "project_number": "123456789",
    "project_id": "example-project",
    "storage_bucket": "example-project.firebasestorage.app"
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
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
JSON
fi

[[ -x "$aapt2" ]] || fail "Android build tools 36.0.0 aapt2 was not found at $aapt2"

(
  cd "$repo_root"
  ./gradlew :composeApp:assembleRelease --no-daemon --console=plain --stacktrace
)

release_apk="$repo_root/composeApp/build/outputs/apk/release/composeApp-release-unsigned.apk"
[[ -f "$release_apk" ]] || fail "release APK was not produced at ${release_apk#"$repo_root"/}"

if ! "$aapt2" dump resources "$release_apk" 2>/dev/null |
  rg --fixed-strings 'default_web_client_id' >/dev/null; then
  fail "release APK does not contain the generated default_web_client_id resource"
fi

echo "Google Sign-In release resource contract passed"
