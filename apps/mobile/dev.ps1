[CmdletBinding()]
param(
    # "backend": only start the local backend.
    # "android": start backend + build/install/launch the Android debug app on a connected device/emulator.
    [ValidateSet("android", "backend")]
    [string]$Mode = "android",

    # Optional: override backend repo directory. Otherwise tries:
    # 1) $env:MVP_SITE_DIR
    # 2) ../mvp-site (sibling to this repo)
    # 3) ~/Projects/MVP/mvp-site
    [string]$BackendDir = $env:MVP_SITE_DIR,

    # Optional: override the port used by the backend. Defaults to MVP_API_BASE_URL port (if present),
    # otherwise 3000.
    [int]$BackendPort = 0,

    # Optional: adb device serial to install/launch on. If omitted, uses the first "device".
    [string]$Device = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-PropertyValue([string]$Path, [string]$Key) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $prefix = "$Key="
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line.StartsWith($prefix)) {
            return $line.Substring($prefix.Length).Trim()
        }
    }

    return $null
}

function Get-ApiBaseUrlFromRepo {
    $fromSecrets = Get-PropertyValue (Join-Path $RepoRoot "secrets.properties") "MVP_API_BASE_URL"
    if ($fromSecrets) {
        return $fromSecrets
    }

    return Get-PropertyValue (Join-Path $RepoRoot "local.defaults.properties") "MVP_API_BASE_URL"
}

function Resolve-BackendDir([string]$Provided) {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($Provided) { $candidates.Add($Provided) }
    if ($env:MVP_SITE_DIR) { $candidates.Add($env:MVP_SITE_DIR) }

    $candidates.Add((Join-Path $RepoRoot "..\\mvp-site"))
    $candidates.Add((Join-Path $HOME "Projects\\MVP\\mvp-site"))
    $candidates.Add((Join-Path $HOME "StudioProjects\\mvp-site"))

    foreach ($candidate in $candidates) {
        try {
            $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction Stop
        } catch {
            continue
        }

        $dir = $resolved.Path
        if (Test-Path -LiteralPath (Join-Path $dir "package.json")) {
            return $dir
        }
    }

    throw ("Could not find the backend repo (mvp-site). " +
        "Set `$env:MVP_SITE_DIR to the mvp-site path, or place it at ../mvp-site relative to this repo.")
}

function Detect-PackageManager([string]$Dir) {
    $hasPnpmLock = Test-Path -LiteralPath (Join-Path $Dir "pnpm-lock.yaml")
    $hasYarnLock = Test-Path -LiteralPath (Join-Path $Dir "yarn.lock")

    if ($hasPnpmLock -and (Get-Command pnpm -ErrorAction SilentlyContinue)) { return "pnpm" }
    if ($hasYarnLock -and (Get-Command yarn -ErrorAction SilentlyContinue)) { return "yarn" }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found on PATH. Install Node.js (which includes npm), or add it to PATH."
    }
    return "npm"
}

function Ensure-BackendDeps([string]$Dir, [string]$Pm) {
    if (Test-Path -LiteralPath (Join-Path $Dir "node_modules")) {
        return
    }

    Write-Host "Backend dependencies not found; installing ($Pm)..." -ForegroundColor Yellow
    Push-Location $Dir
    try {
        switch ($Pm) {
            "pnpm" { & pnpm install }
            "yarn" { & yarn install }
            default { & npm install }
        }
    } finally {
        Pop-Location
    }
}

function Start-BackendInNewWindow([string]$Dir, [string]$Pm, [int]$Port) {
    $portPrefix = ""
    if ($Port -gt 0) {
        # Next.js dev server typically honors PORT.
        $portPrefix = "set PORT=$Port && "
    }

    $cmd = switch ($Pm) {
        "pnpm" { "${portPrefix}pnpm dev" }
        "yarn" { "${portPrefix}yarn dev" }
        default { "${portPrefix}npm run dev" }
    }

    Write-Host "Starting backend in a new window: $cmd" -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -WorkingDirectory $Dir -ArgumentList "/k", "title MVP Backend & $cmd" | Out-Null
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds) {
    if ($Port -le 0) { return }

    Write-Host "Waiting for backend on http://localhost:$Port ..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet) {
            Write-Host "Backend is reachable." -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 1
    }

    Write-Host "Timed out waiting for port $Port. The backend may still be starting." -ForegroundColor Yellow
}

function Resolve-AdbDevice([string]$Preferred) {
    if ($Preferred) {
        return $Preferred
    }

    $deviceLine = (& adb devices) | Select-String -Pattern "\\tdevice$" | Select-Object -First 1
    if (-not $deviceLine) {
        throw "No adb device/emulator found. Start an emulator (or connect a device) and re-run."
    }

    return ($deviceLine.Line -split "\\t")[0]
}

function Install-And-LaunchAndroid([string]$DeviceSerial) {
    $apk = Join-Path $RepoRoot "composeApp\\build\\outputs\\apk\\debug\\composeApp-debug.apk"

    Write-Host "Building :composeApp:assembleDebug ..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & .\\gradlew :composeApp:assembleDebug
    } finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $apk)) {
        throw "APK not found at $apk (build may have failed)."
    }

    Write-Host "Installing APK to $DeviceSerial ..." -ForegroundColor Cyan
    & adb -s $DeviceSerial install -r $apk | Out-Null

    Write-Host "Launching app on $DeviceSerial ..." -ForegroundColor Cyan
    & adb -s $DeviceSerial shell am start -n "com.razumly.mvp/.MainActivity" | Out-Null
}

$backendRepo = Resolve-BackendDir $BackendDir
$pm = Detect-PackageManager $backendRepo

$port = $BackendPort
if ($port -le 0) {
    $baseUrl = Get-ApiBaseUrlFromRepo
    if ($baseUrl) {
        try {
            $uri = [Uri]$baseUrl
            if ($uri.Port -gt 0) { $port = $uri.Port }
        } catch {
            # ignore parse failures and fall back to default
        }
    }
}
if ($port -le 0) { $port = 3000 }

Ensure-BackendDeps $backendRepo $pm
Start-BackendInNewWindow $backendRepo $pm $port
Wait-ForPort $port 60

if ($Mode -eq "android") {
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
        throw "adb was not found on PATH. Install Android platform-tools and ensure adb is available."
    }
    $serial = Resolve-AdbDevice $Device
    Install-And-LaunchAndroid $serial
}

Write-Host ""
Write-Host "Local dev backend should be available at:" -ForegroundColor Green
Write-Host "  Emulator: http://10.0.2.2:$port" -ForegroundColor Green
Write-Host "  Host:     http://localhost:$port" -ForegroundColor Green

