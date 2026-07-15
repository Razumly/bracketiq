[CmdletBinding()]
param(
    # "backend": only start the local backend.
    # "android": start backend + build/install/launch the Android debug app on a connected device/emulator.
    [ValidateSet("android", "backend")]
    [string]$Mode = "android",

    # Optional: override backend repo directory. Otherwise tries:
    # 1) $env:MVP_SITE_DIR
    # 2) ../mvp-site (sibling to this repo)
    # 3) ~/Documents/Code/mvp-site
    # 4) legacy personal workspace locations
    [string]$BackendDir = $env:MVP_SITE_DIR,

    # Optional: override the port used by the backend. Defaults to MVP_API_BASE_URL port (if present),
    # otherwise 3000.
    [ValidateRange(0, 65535)]
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

function Assert-NativeExitCode([string]$Operation, [int]$ExitCode) {
    if ($ExitCode -ne 0) {
        throw "$Operation failed with exit code $ExitCode."
    }
}

function Get-ApiBaseUrlFromRepo {
    $fromSecrets = Get-PropertyValue (Join-Path $RepoRoot "secrets.properties") "MVP_API_BASE_URL"
    if ($fromSecrets) {
        return $fromSecrets
    }

    return Get-PropertyValue (Join-Path $RepoRoot "local.defaults.properties") "MVP_API_BASE_URL"
}

function Resolve-BackendPort([int]$RequestedPort) {
    if ($RequestedPort -gt 0) {
        if ($RequestedPort -lt 1 -or $RequestedPort -gt 65535) {
            throw "BackendPort must be between 1 and 65535."
        }
        return $RequestedPort
    }

    $baseUrl = Get-ApiBaseUrlFromRepo
    if (-not $baseUrl) { return 3000 }

    try {
        $uri = [Uri]::new($baseUrl, [UriKind]::Absolute)
    } catch {
        throw "MVP_API_BASE_URL must be a valid absolute HTTP(S) URL."
    }
    if ($uri.Scheme -notin @("http", "https")) {
        throw "MVP_API_BASE_URL must use HTTP or HTTPS."
    }

    $authority = [regex]::Match(
        $baseUrl,
        '^https?://(?:[^/?#@]+@)?(?:\[[^\]]+\]|[^:/?#]+)(?::(?<port>\d+))?(?:[/?#]|$)',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $authority.Success) {
        throw "MVP_API_BASE_URL has an unsupported authority."
    }
    if (-not $authority.Groups["port"].Success) { return 3000 }

    $derivedPort = 0L
    if (-not [long]::TryParse($authority.Groups["port"].Value, [ref]$derivedPort) -or
        $derivedPort -lt 1 -or $derivedPort -gt 65535) {
        throw "The backend port derived from MVP_API_BASE_URL must be between 1 and 65535."
    }
    return [int]$derivedPort
}

function Resolve-BackendDir([string]$Provided) {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($Provided) { $candidates.Add($Provided) }
    if ($env:MVP_SITE_DIR) { $candidates.Add($env:MVP_SITE_DIR) }

    $candidates.Add((Join-Path $RepoRoot "..\\mvp-site"))
    $candidates.Add((Join-Path $HOME "Documents\\Code\\mvp-site"))
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
        "Set `$env:MVP_SITE_DIR to the mvp-site path, clone it to ~/Documents/Code/mvp-site, or place it at ../mvp-site relative to this repo.")
}

$script:BootstrapLockPath = $null
$script:BootstrapLockToken = $null

function Get-ProcessStartToken([int]$Id) {
    $process = Get-Process -Id $Id -ErrorAction Stop
    return $process.StartTime.ToUniversalTime().Ticks.ToString()
}

function Test-ProcessIdentity([int]$Id, [string]$StartToken) {
    try {
        return (Get-ProcessStartToken $Id) -eq $StartToken
    } catch {
        return $false
    }
}

function Acquire-BackendBootstrapLock([string]$Dir) {
    $lockDirectory = Join-Path $Dir ".next\cache"
    New-Item -ItemType Directory -Path $lockDirectory -Force | Out-Null
    $lockPath = Join-Path $lockDirectory "mvp-local-backend.lock"
    $lockHelper = Join-Path $RepoRoot "scripts\local-backend-lock.mjs"
    if (-not (Test-Path -LiteralPath $lockHelper)) {
        throw "Backend bootstrap lock helper not found at $lockHelper."
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "node was not found on PATH."
    }

    $tokenOutput = & node $lockHelper acquire $lockPath $PID
    $lockExitCode = $LASTEXITCODE
    Assert-NativeExitCode "Backend bootstrap lock acquisition" $lockExitCode
    $token = [string](@($tokenOutput)[0])
    if (-not $token -or $token.Trim() -notmatch "^[a-f0-9]{32}$") {
        throw "The backend lock helper returned an invalid owner token."
    }

    $script:BootstrapLockPath = $lockPath
    $script:BootstrapLockToken = $token.Trim()
}

function Release-BackendBootstrapLock {
    if (-not $script:BootstrapLockPath) { return }
    $lockHelper = Join-Path $RepoRoot "scripts\local-backend-lock.mjs"
    try {
        & node $lockHelper release $script:BootstrapLockPath $PID $script:BootstrapLockToken *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not safely release backend bootstrap lock $script:BootstrapLockPath"
        }
    } catch {
        Write-Warning "Could not safely release backend bootstrap lock $script:BootstrapLockPath"
    } finally {
        $script:BootstrapLockPath = $null
        $script:BootstrapLockToken = $null
    }
}

function Get-BackendPackageManager([string]$Dir) {
    $supported = @("package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock")
    $lockFiles = @($supported | Where-Object { Test-Path -LiteralPath (Join-Path $Dir $_) })
    if ($lockFiles.Count -ne 1) {
        throw "mvp-site must contain exactly one supported lockfile; found $($lockFiles.Count)."
    }

    $pm = switch ($lockFiles[0]) {
        { $_ -in @("package-lock.json", "npm-shrinkwrap.json") } { "npm"; break }
        "pnpm-lock.yaml" { "pnpm"; break }
        "yarn.lock" { "yarn"; break }
        default { throw "Unsupported lockfile $($lockFiles[0])." }
    }
    if (-not (Get-Command $pm -ErrorAction SilentlyContinue)) {
        throw "$pm is required by $($lockFiles[0]) but was not found on PATH."
    }

    $environmentSnapshot = Get-DatabaseEnvironmentSnapshot
    Clear-DatabaseEnvironment
    Push-Location $Dir
    try {
        $versionOutput = & $pm --version
        $versionExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
        Restore-DatabaseEnvironment $environmentSnapshot
    }
    Assert-NativeExitCode "$pm version detection" $versionExitCode
    $version = [string](@($versionOutput)[0])
    if (-not $version) { throw "$pm returned an empty version." }
    $version = $version.Trim()

    $packageJson = Get-Content -LiteralPath (Join-Path $Dir "package.json") -Raw | ConvertFrom-Json
    if ($packageJson.PSObject.Properties.Name -contains "packageManager" -and $packageJson.packageManager) {
        $declared = ([string]$packageJson.packageManager).Trim()
        if ($declared -notmatch "^(npm|pnpm|yarn)(?:@(.+))?$") {
            throw "Unsupported packageManager declaration $declared."
        }
        if ($Matches[1] -ne $pm) {
            throw "package.json declares $declared but $($lockFiles[0]) requires $pm."
        }
        if ($Matches[2]) {
            $declaredVersion = $Matches[2].Split("+")[0]
            if ($declaredVersion -ne $version) {
                throw "package.json requires $pm $declaredVersion, but $pm $version is active in $Dir."
            }
        }
    }

    return [PSCustomObject]@{ Name = $pm; LockFile = $lockFiles[0]; Version = $version }
}

function Invoke-PackageManager(
    [string]$Dir,
    [string]$Pm,
    [string[]]$Arguments,
    [string]$Operation,
    [string]$DatabaseUrl
) {
    $hadDatabaseUrl = Test-Path Env:DATABASE_URL
    $previousDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
    $hadLiveDatabaseUrl = Test-Path Env:DATABASE_URL_LIVE
    $previousLiveDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL_LIVE")
    $env:DATABASE_URL = $DatabaseUrl
    $env:DATABASE_URL_LIVE = $DatabaseUrl
    Push-Location $Dir
    try {
        & $Pm @Arguments
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
        if ($hadDatabaseUrl) {
            $env:DATABASE_URL = $previousDatabaseUrl
        } else {
            Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
        if ($hadLiveDatabaseUrl) {
            $env:DATABASE_URL_LIVE = $previousLiveDatabaseUrl
        } else {
            Remove-Item Env:DATABASE_URL_LIVE -ErrorAction SilentlyContinue
        }
    }
    Assert-NativeExitCode $Operation $exitCode
}

function Install-BackendDependencies([string]$Dir, $PackageManager, [string]$DatabaseUrl) {
    Write-Host "Rebuilding backend dependencies immutably from $($PackageManager.LockFile)..." -ForegroundColor Yellow
    $arguments = switch ($PackageManager.Name) {
        "npm" { @("ci") }
        "pnpm" { @("install", "--frozen-lockfile") }
        "yarn" {
            if ($PackageManager.Version.Split(".")[0] -eq "1") {
                @("install", "--frozen-lockfile")
            } else {
                @("install", "--immutable")
            }
        }
        default { throw "Unsupported package manager $($PackageManager.Name)." }
    }
    Invoke-PackageManager $Dir $PackageManager.Name $arguments "Immutable backend dependency install" $DatabaseUrl
}

function Get-DatabaseEnvironmentSnapshot {
    return [PSCustomObject]@{
        HadDatabaseUrl = (Test-Path Env:DATABASE_URL)
        DatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
        HadLiveDatabaseUrl = (Test-Path Env:DATABASE_URL_LIVE)
        LiveDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL_LIVE")
    }
}

function Clear-DatabaseEnvironment {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DATABASE_URL_LIVE -ErrorAction SilentlyContinue
}

function Restore-DatabaseEnvironment($Snapshot) {
    if ($Snapshot.HadDatabaseUrl) {
        $env:DATABASE_URL = $Snapshot.DatabaseUrl
    } else {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
    if ($Snapshot.HadLiveDatabaseUrl) {
        $env:DATABASE_URL_LIVE = $Snapshot.LiveDatabaseUrl
    } else {
        Remove-Item Env:DATABASE_URL_LIVE -ErrorAction SilentlyContinue
    }
}

function Get-ComposeArguments([string]$Dir, [string[]]$Arguments) {
    $result = @("compose")
    if (Test-Path -LiteralPath (Join-Path $Dir ".env.docker")) {
        $result += @("--env-file", ".env.docker")
    }
    return @($result + $Arguments)
}

function Invoke-Compose([string]$Dir, [string[]]$Arguments, [string]$Operation) {
    $composeArguments = Get-ComposeArguments $Dir $Arguments
    $environmentSnapshot = Get-DatabaseEnvironmentSnapshot
    Clear-DatabaseEnvironment
    Push-Location $Dir
    try {
        & docker @composeArguments
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
        Restore-DatabaseEnvironment $environmentSnapshot
    }
    Assert-NativeExitCode $Operation $exitCode
}

function Get-ComposeOutput([string]$Dir, [string[]]$Arguments, [string]$Operation) {
    $composeArguments = Get-ComposeArguments $Dir $Arguments
    $environmentSnapshot = Get-DatabaseEnvironmentSnapshot
    Clear-DatabaseEnvironment
    Push-Location $Dir
    try {
        $output = & docker @composeArguments
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
        Restore-DatabaseEnvironment $environmentSnapshot
    }
    Assert-NativeExitCode $Operation $exitCode
    return @($output)
}

function Ensure-ComposeDatabase([string]$Dir) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed."
    }
    $environmentSnapshot = Get-DatabaseEnvironmentSnapshot
    Clear-DatabaseEnvironment
    try {
        & docker info *> $null
        $dockerInfoExitCode = $LASTEXITCODE
    } finally {
        Restore-DatabaseEnvironment $environmentSnapshot
    }
    Assert-NativeExitCode "Docker daemon check" $dockerInfoExitCode
    Invoke-Compose $Dir @("up", "-d", "db") "Compose database startup"
}

function Wait-ForComposeDatabase([string]$Dir, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $composeArguments = Get-ComposeArguments $Dir @("exec", "-T", "db", "pg_isready", "-q")
        $environmentSnapshot = Get-DatabaseEnvironmentSnapshot
        Clear-DatabaseEnvironment
        Push-Location $Dir
        try {
            & docker @composeArguments *> $null
            $readyExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
            Restore-DatabaseEnvironment $environmentSnapshot
        }
        if ($readyExitCode -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for the Compose Postgres service."
}

function Get-ComposeDatabaseValue([string]$Dir, [string]$Name) {
    $lines = @(Get-ComposeOutput $Dir @("exec", "-T", "db", "printenv", $Name) "Read Compose $Name")
    if ($lines.Count -lt 1 -or -not ([string]$lines[0])) {
        throw "The effective Compose db service has an empty $Name."
    }
    return ([string]$lines[0]).TrimEnd([char[]]"`r`n")
}

function Get-ComposeDatabaseUrl([string]$Dir) {
    $bindings = @(Get-ComposeOutput $Dir @("port", "db", "5432") "Resolve Compose database port")
    if ($bindings.Count -lt 1) { throw "Compose did not publish the db port." }
    $binding = ([string]$bindings[0]).Trim()
    if ($binding -match "^\[([^\]]+)\]:(\d+)$") {
        $hostName = $Matches[1]
        $databasePort = [int]$Matches[2]
    } elseif ($binding -match "^([^:]+):(\d+)$") {
        $hostName = $Matches[1]
        $databasePort = [int]$Matches[2]
    } else {
        throw "Unsupported Compose db port binding: $binding"
    }
    if ($hostName -notin @("0.0.0.0", "127.0.0.1", "localhost")) {
        throw "Compose db must publish on an IPv4 loopback or wildcard interface because the derived URL uses 127.0.0.1; found $hostName."
    }
    if ($databasePort -lt 1 -or $databasePort -gt 65535) {
        throw "Compose db published an invalid port: $databasePort"
    }

    $user = [Uri]::EscapeDataString((Get-ComposeDatabaseValue $Dir "POSTGRES_USER"))
    $password = [Uri]::EscapeDataString((Get-ComposeDatabaseValue $Dir "POSTGRES_PASSWORD"))
    $database = [Uri]::EscapeDataString((Get-ComposeDatabaseValue $Dir "POSTGRES_DB"))
    return "postgresql://${user}:${password}@127.0.0.1:$databasePort/${database}?schema=public"
}

function Get-ListeningProcessIds([int]$Port) {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        try {
            return @(
                Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
                    Select-Object -ExpandProperty OwningProcess -Unique
            )
        } catch {
            # Fall back to netstat when the NetTCPIP provider is unavailable.
        }
    }
    $owners = New-Object System.Collections.Generic.List[int]
    $netstatLines = @(& netstat.exe -ano -p tcp)
    Assert-NativeExitCode "TCP listener ownership discovery" $LASTEXITCODE
    foreach ($line in $netstatLines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            $owners.Add([int]$Matches[1])
        }
    }
    return @($owners | Select-Object -Unique)
}

function Get-ProcessTreeIds([int]$RootId) {
    if (-not (Get-Command Get-CimInstance -ErrorAction SilentlyContinue)) {
        throw "Get-CimInstance is required to verify managed backend process ownership."
    }
    $processes = @(Get-CimInstance Win32_Process)
    $ids = New-Object "System.Collections.Generic.HashSet[int]"
    [void]$ids.Add($RootId)
    $added = $true
    while ($added) {
        $added = $false
        foreach ($process in $processes) {
            if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
                $added = $true
            }
        }
    }
    return @($ids)
}

function Write-ManagedBackendState([string]$Path, [int]$Id, [string]$StartToken, [int]$Port) {
    $temporary = "$Path.tmp.$PID"
    @{ pid = $Id; startToken = $StartToken; port = $Port } |
        ConvertTo-Json -Compress |
        Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Stop-ManagedBackendOrFail([string]$Dir, [int]$Port) {
    $statePath = Join-Path $Dir ".mvp-site-dev.pid"
    $requestedPortListeners = @(Get-ListeningProcessIds $Port)
    if (-not (Test-Path -LiteralPath $statePath)) {
        if ($requestedPortListeners.Count -gt 0) {
            throw "Port $Port is already used by an unmanaged process. Stop it explicitly before launching mvp-site."
        }
        return
    }

    try {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    } catch {
        throw "The managed owner record is invalid; refusing to remove it or signal any process."
    }
    if ($state.PSObject.Properties.Name -notcontains "pid" -or
        $state.PSObject.Properties.Name -notcontains "startToken" -or
        $state.PSObject.Properties.Name -notcontains "port") {
        throw "The managed owner record is malformed; refusing to remove it or signal any process."
    }

    try {
        $recordedPort = [int]$state.port
    } catch {
        throw "The managed owner record has an invalid port; refusing to remove it or signal any process."
    }
    if ($recordedPort -lt 1 -or $recordedPort -gt 65535) {
        throw "The managed owner record has an invalid port; refusing to remove it or signal any process."
    }

    $recordedPortListeners = if ($recordedPort -eq $Port) {
        @($requestedPortListeners)
    } else {
        @(Get-ListeningProcessIds $recordedPort)
    }

    $managedId = [int]$state.pid
    if (-not (Test-ProcessIdentity $managedId ([string]$state.startToken))) {
        if ($requestedPortListeners.Count -gt 0 -or $recordedPortListeners.Count -gt 0) {
            throw "A requested or recorded backend port is occupied, but the managed process identity is stale."
        }
        Remove-Item -LiteralPath $statePath -Force
        return
    }

    $tree = @(Get-ProcessTreeIds $managedId)
    foreach ($listenerPort in @($Port, $recordedPort) | Select-Object -Unique) {
        $listenersForPort = if ($listenerPort -eq $Port) {
            @($requestedPortListeners)
        } else {
            @($recordedPortListeners)
        }
        foreach ($listenerId in $listenersForPort) {
            if ($tree -notcontains [int]$listenerId) {
                throw "Port $listenerPort is owned by PID $listenerId outside the recorded managed process tree; refusing to signal PID $managedId."
            }
        }
    }

    Write-Host "Stopping verified managed backend process tree $managedId from recorded port $recordedPort..." -ForegroundColor Cyan
    & taskkill.exe /PID $managedId /T /F *> $null
    $taskKillExitCode = $LASTEXITCODE
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        $requestedPortClosed = @(Get-ListeningProcessIds $Port).Count -eq 0
        $recordedPortClosed = $recordedPort -eq $Port -or @(Get-ListeningProcessIds $recordedPort).Count -eq 0
        if (-not (Test-ProcessIdentity $managedId ([string]$state.startToken)) -and
            $requestedPortClosed -and $recordedPortClosed) {
            Remove-Item -LiteralPath $statePath -Force
            return
        }
        Start-Sleep -Milliseconds 250
    }
    Assert-NativeExitCode "Managed backend process-tree stop" $taskKillExitCode
    throw "Managed backend did not release requested port $Port and recorded port $recordedPort."
}

function Start-ManagedBackend([string]$Dir, [string]$Pm, [int]$Port, [string]$DatabaseUrl) {
    $statePath = Join-Path $Dir ".mvp-site-dev.pid"
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $env:ComSpec
    $processInfo.Arguments = "/d /s /c `"$Pm run dev:plain`""
    $processInfo.WorkingDirectory = $Dir
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $false
    $processInfo.EnvironmentVariables["PORT"] = $Port.ToString()
    $processInfo.EnvironmentVariables["DATABASE_URL"] = $DatabaseUrl
    $processInfo.EnvironmentVariables["DATABASE_URL_LIVE"] = $DatabaseUrl

    Write-Host "Starting managed backend on port $Port..." -ForegroundColor Cyan
    $process = [System.Diagnostics.Process]::Start($processInfo)
    if (-not $process) { throw "Could not start the backend process." }
    try {
        $startToken = $process.StartTime.ToUniversalTime().Ticks.ToString()
        Write-ManagedBackendState $statePath $process.Id $startToken $Port
    } catch {
        & taskkill.exe /PID $process.Id /T /F *> $null
        throw
    }
}

function Assert-ManagedBackendListenerOwnership([string]$Dir, [int]$Port) {
    $statePath = Join-Path $Dir ".mvp-site-dev.pid"
    if (-not (Test-Path -LiteralPath $statePath)) {
        throw "The backend became reachable without a trusted managed owner record."
    }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.PSObject.Properties.Name -notcontains "pid" -or
        $state.PSObject.Properties.Name -notcontains "startToken" -or
        $state.PSObject.Properties.Name -notcontains "port" -or
        [int]$state.port -ne $Port) {
        throw "The running backend owner record is malformed."
    }
    $managedId = [int]$state.pid
    if (-not (Test-ProcessIdentity $managedId ([string]$state.startToken))) {
        throw "The backend owner process identity changed during startup."
    }
    $listeners = @(Get-ListeningProcessIds $Port)
    if ($listeners.Count -eq 0) {
        throw "The backend readiness route responded, but no listener remains on port $Port."
    }
    $tree = @(Get-ProcessTreeIds $managedId)
    foreach ($listenerId in $listeners) {
        if ($tree -notcontains [int]$listenerId) {
            throw "Port $Port is owned by PID $listenerId outside the recorded managed process tree."
        }
    }
}

function Test-AppVersionPayload($Payload) {
    $names = @($Payload.PSObject.Properties.Name)
    if ($names -notcontains "updateAvailable" -or $Payload.updateAvailable -isnot [bool]) { return $false }
    if ($names -notcontains "updateRequired" -or $Payload.updateRequired -isnot [bool]) { return $false }
    if ($names -notcontains "latestVersion" -or $names -notcontains "releases") { return $false }

    $releaseIsValid = {
        param($Release)
        if ($null -eq $Release) { return $false }
        $releaseNames = @($Release.PSObject.Properties.Name)
        return ($releaseNames -contains "platform") -and
            $Release.platform -in @("ANDROID", "IOS") -and
            ($releaseNames -contains "versionName") -and $Release.versionName -is [string] -and
            ($releaseNames -contains "buildNumber") -and
            ($Release.buildNumber -is [int] -or $Release.buildNumber -is [long])
    }
    if ($null -ne $Payload.latestVersion -and -not (& $releaseIsValid $Payload.latestVersion)) { return $false }
    foreach ($release in @($Payload.releases)) {
        if (-not (& $releaseIsValid $release)) { return $false }
    }
    return $true
}

function Wait-ForBackendReadiness([int]$Port, [int]$TimeoutSeconds) {
    $url = "http://127.0.0.1:$Port/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0"
    Write-Host "Waiting for database-backed backend readiness at $url ..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                $payload = $response.Content | ConvertFrom-Json
                if (Test-AppVersionPayload $payload) { return }
            }
        } catch {
            # The server may still be starting or migrations may not be visible yet.
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for database-backed backend readiness on port $Port."
}

function Resolve-AdbDevice([string]$Preferred) {
    if ($Preferred) {
        return $Preferred
    }

    $devices = & adb devices
    $adbExitCode = $LASTEXITCODE
    Assert-NativeExitCode "adb device discovery" $adbExitCode

    $deviceLine = $devices | Select-String -Pattern "\\tdevice$" | Select-Object -First 1
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
        $buildExitCode = $LASTEXITCODE
        Assert-NativeExitCode "Android debug build" $buildExitCode
    } finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $apk)) {
        throw "APK not found at $apk (build may have failed)."
    }

    Write-Host "Installing APK to $DeviceSerial ..." -ForegroundColor Cyan
    & adb -s $DeviceSerial install -r $apk
    $installExitCode = $LASTEXITCODE
    Assert-NativeExitCode "APK installation" $installExitCode

    Write-Host "Launching app on $DeviceSerial ..." -ForegroundColor Cyan
    & adb -s $DeviceSerial shell am start -n "com.razumly.mvp/.MainActivity"
    $launchExitCode = $LASTEXITCODE
    Assert-NativeExitCode "Android app launch" $launchExitCode
}

$backendRepo = Resolve-BackendDir $BackendDir
$port = Resolve-BackendPort $BackendPort

Acquire-BackendBootstrapLock $backendRepo
try {
    $packageManager = Get-BackendPackageManager $backendRepo
    Stop-ManagedBackendOrFail $backendRepo $port
    Ensure-ComposeDatabase $backendRepo
    Wait-ForComposeDatabase $backendRepo 90
    $databaseUrl = Get-ComposeDatabaseUrl $backendRepo
    Install-BackendDependencies $backendRepo $packageManager $databaseUrl

    Write-Host "Applying tracked mvp-site migrations..." -ForegroundColor Cyan
    Invoke-PackageManager `
        $backendRepo `
        $packageManager.Name `
        @("run", "migrate:deploy") `
        "Tracked backend migrations" `
        $databaseUrl

    Start-ManagedBackend $backendRepo $packageManager.Name $port $databaseUrl
    try {
        Wait-ForBackendReadiness $port 90
        Assert-ManagedBackendListenerOwnership $backendRepo $port
    } catch {
        Stop-ManagedBackendOrFail $backendRepo $port
        throw
    }
} finally {
    Release-BackendBootstrapLock
}

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
