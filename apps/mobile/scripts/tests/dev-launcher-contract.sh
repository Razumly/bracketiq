#!/usr/bin/env bash
set -euo pipefail

# This lightweight contract test runs on macOS/Linux where PowerShell may not
# be installed. It guards the fail-fast ordering that prevents dev.ps1 from
# installing a stale APK after a failed native command.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/dev.ps1"

require_line() {
  local needle="$1"
  if ! rg --fixed-strings --quiet -- "$needle" "$script"; then
    echo "Missing dev.ps1 launcher contract: $needle" >&2
    exit 1
  fi
}

line_number() {
  rg --fixed-strings --line-number -- "$1" "$script" | head -n 1 | cut -d: -f1
}

require_line 'function Assert-NativeExitCode'
require_line 'throw "Timed out waiting for backend on port $Port.'
require_line '$buildExitCode = $LASTEXITCODE'
require_line 'Assert-NativeExitCode "Android debug build" $buildExitCode'
require_line '$installExitCode = $LASTEXITCODE'
require_line 'Assert-NativeExitCode "APK installation" $installExitCode'
require_line '$launchExitCode = $LASTEXITCODE'
require_line 'Assert-NativeExitCode "Android app launch" $launchExitCode'
require_line 'Assert-NativeExitCode "adb device discovery" $adbExitCode'

build_assertion_line="$(line_number 'Assert-NativeExitCode "Android debug build" $buildExitCode')"
apk_presence_check_line="$(line_number 'if (-not (Test-Path -LiteralPath $apk))')"

if (( build_assertion_line >= apk_presence_check_line )); then
  echo "The build failure check must run before any existing APK can be reused." >&2
  exit 1
fi

echo "dev.ps1 fail-fast launcher contract passed"
