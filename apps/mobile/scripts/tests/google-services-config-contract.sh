#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
build_file="$repo_root/composeApp/build.gradle.kts"
gitignore_file="$repo_root/.gitignore"
readme_file="$repo_root/README.md"
provision_script="$repo_root/scripts/provision-google-services.sh"

fail() {
  echo "Google Services configuration contract failed: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local text="$2"
  if ! rg --fixed-strings --quiet -- "$text" "$file"; then
    fail "missing '$text' in ${file#"$repo_root"/}"
  fi
}

require_text "$gitignore_file" 'composeApp/google-services.json'
require_text "$build_file" 'id("com.google.gms.google-services") version "4.5.0" apply false'
require_text "$build_file" 'if (hasGoogleServicesConfig) {'
require_text "$build_file" 'apply(plugin = "com.google.gms.google-services")'
require_text "$build_file" 'tasks.matching { it.name == "preReleaseBuild" }.configureEach'
require_text "$build_file" 'dependsOn(requireGoogleServicesConfig)'
require_text "$readme_file" './scripts/provision-google-services.sh'
require_text "$readme_file" 'MVP_GOOGLE_SERVICES_JSON_BASE64'

temporary_root="$(mktemp -d)"
trap 'rm -rf "$temporary_root"' EXIT

fixture="$temporary_root/google-services.json"
cat > "$fixture" <<'JSON'
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
          "client_id": "example.apps.googleusercontent.com",
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

path_output="$temporary_root/from-path.json"
MVP_GOOGLE_SERVICES_OUTPUT="$path_output" "$provision_script" "$fixture" >/dev/null
cmp -s "$fixture" "$path_output" || fail "path provisioning changed the validated configuration"

encoded_fixture="$(python3 - "$fixture" <<'PY'
import base64
import sys

with open(sys.argv[1], "rb") as source:
    print(base64.b64encode(source.read()).decode("ascii"))
PY
)"
base64_output="$temporary_root/from-base64.json"
MVP_GOOGLE_SERVICES_OUTPUT="$base64_output" \
MVP_GOOGLE_SERVICES_JSON_BASE64="$encoded_fixture" \
  "$provision_script" >/dev/null
cmp -s "$fixture" "$base64_output" || fail "base64 provisioning changed the validated configuration"

invalid_fixture="$temporary_root/invalid-package.json"
sed 's/com.razumly.mvp/com.example.wrong/' "$fixture" > "$invalid_fixture"
invalid_output="$temporary_root/invalid-output.json"
if MVP_GOOGLE_SERVICES_OUTPUT="$invalid_output" "$provision_script" "$invalid_fixture" \
  > /dev/null 2> "$temporary_root/invalid.err"; then
  fail "provisioning accepted a configuration for the wrong Android package"
fi
if [[ -e "$invalid_output" ]]; then
  fail "failed validation left a configuration file behind"
fi
require_text "$temporary_root/invalid.err" 'no Android client exists for package com.razumly.mvp'

echo "Google Services configuration contract passed"
