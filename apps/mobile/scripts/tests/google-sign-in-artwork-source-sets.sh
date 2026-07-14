#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ui_root="$repo_root/core/ui/src"
common_root="$ui_root/commonMain"
android_root="$ui_root/androidMain"
ios_root="$ui_root/iosMain"

fail() {
  echo "Google sign-in artwork source-set contract failed: $1" >&2
  exit 1
}

if find "$common_root" -type f -iname '*GoogleButton*.kt' | rg --quiet '.'; then
  fail "platform artwork must not be compiled from commonMain"
fi

android_files="$(find "$android_root" -type f -iname '*GoogleButton*.kt' | sort)"
ios_files="$(find "$ios_root" -type f -iname '*GoogleButton*.kt' | sort)"

for file in AndroidGoogleButtonDark.kt AndroidGoogleButtonLight.kt; do
  if ! rg --fixed-strings --quiet -- "/$file" <<<"$android_files"; then
    fail "androidMain is missing $file"
  fi
done

for file in iOSGoogleButtonDark.kt iOSGoogleButtonLight.kt; do
  if ! rg --fixed-strings --quiet -- "/$file" <<<"$ios_files"; then
    fail "iosMain is missing $file"
  fi
done

if rg --quiet 'iOSGoogleButton(Dark|Light)' "$android_root"; then
  fail "androidMain references iOS artwork"
fi

if rg --quiet 'AndroidGoogleButton(Dark|Light)' "$ios_root"; then
  fail "iosMain references Android artwork"
fi

android_payload_count="$(find "$android_root" -type f -name 'AndroidGoogleButton*.kt' | wc -l | tr -d ' ')"
ios_payload_count="$(find "$ios_root" -type f -name 'iOSGoogleButton*.kt' | wc -l | tr -d ' ')"

if [[ "$android_payload_count" != "2" ]]; then
  fail "expected exactly two Android artwork payloads, found $android_payload_count"
fi

if [[ "$ios_payload_count" != "2" ]]; then
  fail "expected exactly two iOS artwork payloads, found $ios_payload_count"
fi

echo "Google sign-in artwork source-set contract passed"
