[CmdletBinding()]
param(
    [string]$RuntimeRoot = "",
    [string]$Workspace = "",
    [string]$AppDataRoot = "",
    [string]$BackendRoot = "",
    [string]$WebRoot = "",
    [string]$ApplicationStoreRoot = "",
    [int]$Port = 8099,
    [switch]$CheckRuntime
)

$ErrorActionPreference = "Stop"
if (-not $BackendRoot) {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
    $BackendRoot = Join-Path $repoRoot "esp-config-designer\backend"
    if (-not $WebRoot) {
        $WebRoot = Join-Path $repoRoot "esp-config-designer\frontend\dist"
    }
}
$BackendRoot = [System.IO.Path]::GetFullPath($BackendRoot)
$WebRoot = [System.IO.Path]::GetFullPath($(if ($WebRoot) { $WebRoot } else { Join-Path $BackendRoot "web" }))
$launcher = Join-Path $BackendRoot "desktop_launcher.py"

if (-not $RuntimeRoot) {
    $RuntimeRoot = Join-Path $env:LOCALAPPDATA "ECD\runtime"
}
if (-not $AppDataRoot) {
    $AppDataRoot = Join-Path $env:LOCALAPPDATA "ECD"
}
if (-not $Workspace) {
    $Workspace = Join-Path $env:USERPROFILE "ESPConfig Designer\workspace"
}

$pythonCandidates = @(
    (Join-Path $RuntimeRoot "python.exe"),
    (Join-Path $RuntimeRoot "Scripts\python.exe")
)
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $pythonPath) {
    throw "Embedded Python is missing from '$RuntimeRoot'. Prepare the runtime first; global Python is not used."
}
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "Backend launcher is missing: $launcher"
}

$launcherArgs = @(
    "-B",
    $launcher,
    "--runtime-root", $RuntimeRoot,
    "--app-data-root", $AppDataRoot,
    "--workspace", $Workspace,
    "--backend-root", $BackendRoot,
    "--web-root", $WebRoot,
    "--port", $Port.ToString()
)
if ($CheckRuntime) {
    $launcherArgs += "--check-runtime"
}
if ($ApplicationStoreRoot) {
    $launcherArgs += "--application-store"
    $launcherArgs += $ApplicationStoreRoot
}

Write-Host "[info] Starting ESPConfig Designer desktop runtime"
Write-Host "[info] Runtime root: $RuntimeRoot"
Write-Host "[info] Workspace: $Workspace"
& $pythonPath @launcherArgs
exit $LASTEXITCODE
