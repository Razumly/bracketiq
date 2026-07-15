#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
criteria="$repo_root/gradle/gradle-daemon-jvm.properties"
settings="$repo_root/settings.gradle.kts"

require_exact_property() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local values
  local count

  values="$(awk -v key="$key" '
    /^[[:space:]]*#/ { next }
    index($0, key "=") == 1 { print substr($0, length(key) + 2) }
  ' "$file")"
  count="$(printf '%s\n' "$values" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [[ "$count" -ne 1 || "$values" != "$expected" ]]; then
    echo "Expected exactly one $key=$expected in ${file#"$repo_root"/}." >&2
    exit 1
  fi
}

require_https_property() {
  local key="$1"
  local values
  local count

  values="$(awk -v key="$key" '
    /^[[:space:]]*#/ { next }
    index($0, key "=") == 1 { print substr($0, length(key) + 2) }
  ' "$criteria")"
  count="$(printf '%s\n' "$values" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [[ "$count" -ne 1 || "$values" != https\\://* ]]; then
    echo "Expected exactly one non-empty HTTPS $key in ${criteria#"$repo_root"/}." >&2
    exit 1
  fi
}

plugin_line='id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"'
if [[ "$(rg --fixed-strings --count-matches -- "$plugin_line" "$settings")" -ne 1 ]]; then
  echo "Expected exactly one Gradle-9-compatible Foojay resolver declaration." >&2
  exit 1
fi

require_exact_property "$criteria" "toolchainVendor" "ADOPTIUM"
require_exact_property "$criteria" "toolchainVersion" "17"
require_https_property "toolchainUrl.LINUX.X86_64"
require_https_property "toolchainUrl.MAC_OS.AARCH64"
require_https_property "toolchainUrl.MAC_OS.X86_64"
require_https_property "toolchainUrl.WINDOWS.X86_64"

if rg --regexp '^toolchainVendor=JETBRAINS$|^toolchainVersion=21$' --quiet "$criteria"; then
  echo "The Gradle daemon must not regress to the failing JetBrains JDK 21 criteria." >&2
  exit 1
fi

echo "Gradle daemon JDK 17 toolchain contract passed"
