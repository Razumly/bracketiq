#!/usr/bin/env bash
set -euo pipefail

# This source contract runs on macOS/Linux even when PowerShell is unavailable.
# It guards Windows parity for backend freshness/readiness and the fail-fast
# ordering that prevents a stale APK from being installed.

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

reject_line() {
  local needle="$1"
  if rg --fixed-strings --quiet -- "$needle" "$script"; then
    echo "Forbidden dev.ps1 launcher behavior: $needle" >&2
    exit 1
  fi
}

require_line 'function Assert-NativeExitCode'
require_line 'function Acquire-BackendBootstrapLock'
require_line 'function Release-BackendBootstrapLock'
require_line 'scripts\local-backend-lock.mjs'
require_line '"mvp-local-backend.lock"'
reject_line 'mvp-local-backend.windows.lock'
require_line 'function Resolve-BackendPort'
require_line '$derivedPort -lt 1 -or $derivedPort -gt 65535'
require_line '(?:\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?'
require_line 'function Get-BackendPackageManager'
require_line 'mvp-site must contain exactly one supported lockfile'
require_line 'package.json requires $pm $declaredVersion'
require_line '"npm" { @("ci") }'
require_line '@("install", "--frozen-lockfile")'
require_line '@("install", "--immutable")'
require_line 'function Ensure-ComposeDatabase'
require_line 'function Wait-ForComposeDatabase'
require_line 'function Get-ComposeDatabaseUrl'
require_line 'function Clear-DatabaseEnvironment'
require_line 'Remove-Item Env:DATABASE_URL_LIVE -ErrorAction SilentlyContinue'
require_line '$env:DATABASE_URL_LIVE = $DatabaseUrl'
require_line 'Get-ComposeDatabaseValue $Dir "POSTGRES_PASSWORD"'
require_line 'postgresql://${user}:${password}@127.0.0.1:$databasePort/${database}?schema=public'
require_line '$hostName -notin @("0.0.0.0", "127.0.0.1", "localhost")'
require_line 'function Get-ListeningProcessIds'
require_line 'function Get-ProcessTreeIds'
require_line 'function Assert-ManagedBackendListenerOwnership'
require_line 'outside the recorded managed process tree; refusing to signal PID $managedId'
require_line '$recordedPortListeners = if ($recordedPort -eq $Port)'
require_line '$requestedPortListeners.Count -gt 0 -or $recordedPortListeners.Count -gt 0'
require_line 'Stopping verified managed backend process tree $managedId from recorded port $recordedPort'
require_line '$recordedPortClosed = $recordedPort -eq $Port -or @(Get-ListeningProcessIds $recordedPort).Count -eq 0'
require_line 'function Wait-ForBackendReadiness'
require_line '/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0'
require_line 'throw "Timed out waiting for database-backed backend readiness on port $Port.'
require_line '$processInfo.EnvironmentVariables["DATABASE_URL"] = $DatabaseUrl'
require_line '$processInfo.EnvironmentVariables["DATABASE_URL_LIVE"] = $DatabaseUrl'
require_line '@("run", "migrate:deploy")'
require_line 'Install-BackendDependencies $backendRepo $packageManager $databaseUrl'
reject_line 'npm install'
reject_line 'Test-Path -LiteralPath (Join-Path $Dir "node_modules")'
reject_line 'function Wait-ForPort'
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

prior_port_discovery_line="$(line_number '$recordedPortListeners = if ($recordedPort -eq $Port)')"
prior_port_tree_check_line="$(line_number 'foreach ($listenerPort in @($Port, $recordedPort) | Select-Object -Unique)')"
managed_taskkill_line="$(line_number '& taskkill.exe /PID $managedId /T /F')"
prior_port_close_line="$(line_number '$recordedPortClosed = $recordedPort -eq $Port -or @(Get-ListeningProcessIds $recordedPort).Count -eq 0')"
if ! (( prior_port_discovery_line < prior_port_tree_check_line &&
        prior_port_tree_check_line < managed_taskkill_line &&
        managed_taskkill_line < prior_port_close_line )); then
  echo "The Windows prior-port process tree is not verified before signaling and closure checks." >&2
  exit 1
fi

package_manager_line="$(line_number '$packageManager = Get-BackendPackageManager $backendRepo')"
stop_line="$(line_number 'Stop-ManagedBackendOrFail $backendRepo $port')"
database_start_line="$(line_number 'Ensure-ComposeDatabase $backendRepo')"
database_wait_line="$(line_number 'Wait-ForComposeDatabase $backendRepo 90')"
database_url_line="$(line_number '$databaseUrl = Get-ComposeDatabaseUrl $backendRepo')"
dependency_line="$(line_number 'Install-BackendDependencies $backendRepo $packageManager $databaseUrl')"
migration_line="$(line_number '@("run", "migrate:deploy")')"
server_start_line="$(line_number 'Start-ManagedBackend $backendRepo $packageManager.Name $port $databaseUrl')"
readiness_line="$(line_number 'Wait-ForBackendReadiness $port 90')"
ownership_line="$(line_number 'Assert-ManagedBackendListenerOwnership $backendRepo $port')"

if ! (( package_manager_line < stop_line &&
        stop_line < database_start_line &&
        database_start_line < database_wait_line &&
        database_wait_line < database_url_line &&
        database_url_line < dependency_line &&
        dependency_line < migration_line &&
        migration_line < server_start_line &&
        server_start_line < readiness_line &&
        readiness_line < ownership_line )); then
  echo "The Windows backend bootstrap ordering is not fail-closed." >&2
  exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoLogo -NoProfile -NonInteractive -Command '
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -gt 0) {
      $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
      exit 1
    }
  ' "$script"
fi

"$repo_root/scripts/tests/gradle-daemon-jvm-contract.sh"
bash "$repo_root/scripts/tests/portable-build-launcher-contract.sh"
bash "$repo_root/scripts/tests/local-backend-lock-contract.sh"
bash "$repo_root/scripts/tests/local-backend-contract.sh"

echo "dev.ps1 fail-fast launcher contract passed"
