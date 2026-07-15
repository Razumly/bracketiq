#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_file="${MVP_GOOGLE_SERVICES_OUTPUT:-$repo_root/composeApp/google-services.json}"
source_file="${1:-${MVP_GOOGLE_SERVICES_JSON_PATH:-}}"
encoded_config="${MVP_GOOGLE_SERVICES_JSON_BASE64:-}"

fail() {
  echo "Google Services provisioning failed: $*" >&2
  exit 1
}

if [[ -n "$source_file" && -n "$encoded_config" ]]; then
  fail "provide either a config file path or MVP_GOOGLE_SERVICES_JSON_BASE64, not both"
fi

if [[ -z "$source_file" && -z "$encoded_config" ]]; then
  fail "pass the downloaded google-services.json path, set MVP_GOOGLE_SERVICES_JSON_PATH, or set MVP_GOOGLE_SERVICES_JSON_BASE64"
fi

command -v python3 >/dev/null 2>&1 || fail "python3 is required to validate the configuration"

mkdir -p "$(dirname "$output_file")"
umask 077
temporary_file="$(mktemp "${output_file}.tmp.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT

if [[ -n "$source_file" ]]; then
  [[ -f "$source_file" ]] || fail "configuration file not found: $source_file"
  cp "$source_file" "$temporary_file"
else
  MVP_GOOGLE_SERVICES_DECODE_TARGET="$temporary_file" python3 <<'PY'
import base64
import binascii
import os
import sys

encoded = "".join(os.environ["MVP_GOOGLE_SERVICES_JSON_BASE64"].split())
try:
    decoded = base64.b64decode(encoded, validate=True)
except (binascii.Error, ValueError) as error:
    print(f"Google Services provisioning failed: invalid base64 configuration: {error}", file=sys.stderr)
    raise SystemExit(1)

with open(os.environ["MVP_GOOGLE_SERVICES_DECODE_TARGET"], "wb") as output:
    output.write(decoded)
PY
fi

python3 - "$temporary_file" <<'PY'
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as source:
        config = json.load(source)
except (OSError, UnicodeError, json.JSONDecodeError) as error:
    print(f"Google Services provisioning failed: invalid JSON configuration: {error}", file=sys.stderr)
    raise SystemExit(1)

project_info = config.get("project_info") or {}
if not str(project_info.get("project_number") or "").strip():
    print("Google Services provisioning failed: project_info.project_number is missing", file=sys.stderr)
    raise SystemExit(1)
if not str(project_info.get("project_id") or "").strip():
    print("Google Services provisioning failed: project_info.project_id is missing", file=sys.stderr)
    raise SystemExit(1)

android_client = next(
    (
        client
        for client in config.get("client") or []
        if ((client.get("client_info") or {}).get("android_client_info") or {}).get("package_name")
        == "com.razumly.mvp"
    ),
    None,
)
if android_client is None:
    print(
        "Google Services provisioning failed: no Android client exists for package com.razumly.mvp",
        file=sys.stderr,
    )
    raise SystemExit(1)

mobile_app_id = str((android_client.get("client_info") or {}).get("mobilesdk_app_id") or "").strip()
if not mobile_app_id:
    print("Google Services provisioning failed: the Android Firebase app ID is missing", file=sys.stderr)
    raise SystemExit(1)

api_keys = [
    str(entry.get("current_key") or "").strip()
    for entry in android_client.get("api_key") or []
]
if not any(api_keys):
    print("Google Services provisioning failed: the Android client API key is missing", file=sys.stderr)
    raise SystemExit(1)

web_client_ids = [
    str(entry.get("client_id") or "").strip()
    for entry in android_client.get("oauth_client") or []
    if entry.get("client_type") == 3
]
if not any(web_client_ids):
    print(
        "Google Services provisioning failed: the OAuth web client used by Android Google sign-in is missing",
        file=sys.stderr,
    )
    raise SystemExit(1)
PY

chmod 600 "$temporary_file"
mv -f "$temporary_file" "$output_file"
trap - EXIT

echo "Provisioned Android Google Services configuration at $output_file"
