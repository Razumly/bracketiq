#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
catalog="$repo_root/gradle/libs.versions.toml"
repository_build="$repo_root/core/repository-impl/build.gradle.kts"
ui_build="$repo_root/core/ui/build.gradle.kts"
compose_build="$repo_root/composeApp/build.gradle.kts"
wear_build="$repo_root/wearApp/build.gradle.kts"

require_line() {
  local file="$1"
  local needle="$2"
  if ! rg --fixed-strings --quiet -- "$needle" "$file"; then
    echo "Missing AndroidX Core dependency contract in ${file#"$repo_root"/}: $needle" >&2
    exit 1
  fi
}

require_line "$catalog" 'androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "androidxCoreKtx" }'
require_line "$catalog" 'androidx-test-core = { module = "androidx.test:core", version.ref = "androidxTestCore" }'
require_line "$repository_build" 'implementation(libs.androidx.core.ktx)'
require_line "$compose_build" 'implementation(libs.androidx.test.core)'
require_line "$wear_build" 'testImplementation(libs.androidx.test.core)'

if ! awk '
  BEGIN {
    in_android_unit_test = 0
    block_depth = 0
    alias_usages = 0
    invalid_usage = 0
  }
  {
    line = $0
    if (!in_android_unit_test && line ~ /^[[:space:]]*androidUnitTest[[:space:]]*\{/) {
      in_android_unit_test = 1
      block_depth = 0
    }

    if (index(line, "libs.androidx.test.core") > 0) {
      alias_usages += 1
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/[[:space:]]+$/, "", trimmed)
      if (!in_android_unit_test || trimmed != "implementation(libs.androidx.test.core)") {
        invalid_usage = 1
      }
    }

    if (in_android_unit_test) {
      braces = line
      opening_braces = gsub(/\{/, "", braces)
      braces = line
      closing_braces = gsub(/\}/, "", braces)
      block_depth += opening_braces - closing_braces
      if (block_depth == 0) {
        in_android_unit_test = 0
      }
    }
  }
  END {
    if (alias_usages != 1 || invalid_usage) {
      exit 1
    }
  }
' "$compose_build"; then
  echo "composeApp must use androidx.test:core exactly once inside androidUnitTest." >&2
  exit 1
fi

if ! awk '
  BEGIN {
    alias_usages = 0
    invalid_usage = 0
  }
  index($0, "libs.androidx.test.core") > 0 {
    alias_usages += 1
    trimmed = $0
    sub(/^[[:space:]]+/, "", trimmed)
    sub(/[[:space:]]+$/, "", trimmed)
    if (trimmed != "testImplementation(libs.androidx.test.core)") {
      invalid_usage = 1
    }
  }
  END {
    if (alias_usages != 1 || invalid_usage) {
      exit 1
    }
  }
' "$wear_build"; then
  echo "wearApp must use androidx.test:core exactly once as testImplementation." >&2
  exit 1
fi

if rg --fixed-strings --quiet \
  --glob '*.gradle' \
  --glob '*.gradle.kts' \
  --glob '!composeApp/build.gradle.kts' \
  --glob '!wearApp/build.gradle.kts' \
  -- 'libs.androidx.test.core' "$repo_root"; then
  echo "The androidx.test:core alias must not be used outside approved test configurations." >&2
  exit 1
fi

if rg --fixed-strings --quiet \
  --glob '*.gradle' \
  --glob '*.gradle.kts' \
  -- 'androidx.test:core' "$repo_root"; then
  echo "Direct androidx.test:core coordinates are forbidden; use the test-only catalog alias." >&2
  exit 1
fi

if rg --fixed-strings --quiet -- 'libs.androidx.core.ktx' "$ui_build"; then
  echo "core:ui must not carry AndroidX Core without a production source usage." >&2
  exit 1
fi

if rg --regexp 'libs\.androidx\.core\)' --quiet --glob '*.gradle.kts' "$repo_root"; then
  echo "The ambiguous libs.androidx.core alias must not be used." >&2
  exit 1
fi

echo "AndroidX Core production/test dependency boundary contract passed"
