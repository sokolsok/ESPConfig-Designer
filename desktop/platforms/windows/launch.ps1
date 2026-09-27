[CmdletBinding()]
param(
    [string]$RuntimeRoot = "",
    [string]$Workspace = "",
    [string]$AppDataRoot = "",
    [string]$BackendRoot = "",
    [string]$LauncherPath = "",
    [string]$WebRoot = "",
    [string]$SchemaCatalogRoot = "",
    [string]$SchemaCatalogManifest = "",
    [string]$ApplicationStoreRoot = "",
    [int]$Port = 8099,
    [switch]$CheckRuntime
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$usingDefaultBackend = -not $BackendRoot
if (-not $BackendRoot) {
    $BackendRoot = Join-Path $repoRoot "esp-config-designer\backend"
    if (-not $WebRoot) {
        $WebRoot = Join-Path $repoRoot "esp-config-designer\frontend\dist"
    }
}
$BackendRoot = [System.IO.Path]::GetFullPath($BackendRoot)
$WebRoot = [System.IO.Path]::GetFullPath($(if ($WebRoot) { $WebRoot } else { Join-Path $BackendRoot "web" }))
$SchemaCatalogRoot = [System.IO.Path]::GetFullPath($(if ($SchemaCatalogRoot) {
    $SchemaCatalogRoot
} elseif ($usingDefaultBackend) {
    Join-Path $repoRoot "esp-config-designer\shared\schema-catalog"
} else {
    Join-Path $BackendRoot "schema-catalog"
}))
if (-not $LauncherPath) {
    $flatLauncher = Join-Path $BackendRoot "desktop_launcher.py"
    if (Test-Path -LiteralPath $flatLauncher -PathType Leaf) {
        $LauncherPath = $flatLauncher
    } else {
        $LauncherPath = Join-Path $repoRoot "desktop\python\desktop_launcher.py"
    }
}
$launcher = [System.IO.Path]::GetFullPath($LauncherPath)
$defaultSchemaCatalogManifest = Join-Path $BackendRoot "schema-catalog-manifest.json"
if (-not $SchemaCatalogManifest -and (Test-Path -LiteralPath $defaultSchemaCatalogManifest -PathType Leaf)) {
    $SchemaCatalogManifest = $defaultSchemaCatalogManifest
}
if (-not $SchemaCatalogManifest -and ($SchemaCatalogRoot -eq (Join-Path $BackendRoot "schema-catalog"))) {
    throw "Packaged schema catalog manifest is missing: $defaultSchemaCatalogManifest"
}

if (-not $RuntimeRoot) {
    $RuntimeRoot = Join-Path $env:LOCALAPPDATA "ECD\runtime"
}
if (-not $AppDataRoot) {
    $AppDataRoot = Join-Path $env:LOCALAPPDATA "ECD"
}
if (-not $Workspace) {
    $Workspace = Join-Path $env:USERPROFILE "Documents\ecd_workspace"
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
    "-I",
    "-B",
    $launcher,
    "--runtime-root", $RuntimeRoot,
    "--app-data-root", $AppDataRoot,
    "--workspace", $Workspace,
    "--backend-root", $BackendRoot,
    "--web-root", $WebRoot,
    "--schema-catalog-root", $SchemaCatalogRoot,
    "--port", $Port.ToString()
)
if ($CheckRuntime) {
    $launcherArgs += "--check-runtime"
}
if ($ApplicationStoreRoot) {
    $launcherArgs += "--application-store"
    $launcherArgs += $ApplicationStoreRoot
}
if ($SchemaCatalogManifest) {
    $launcherArgs += "--schema-catalog-manifest"
    $launcherArgs += [System.IO.Path]::GetFullPath($SchemaCatalogManifest)
}

Write-Host "[info] Starting ESPConfig Designer desktop runtime"
Write-Host "[info] Runtime root: $RuntimeRoot"
Write-Host "[info] Workspace: $Workspace"
foreach ($name in @("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV")) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}
$env:PYTHONNOUSERSITE = "1"
& $pythonPath @launcherArgs
exit $LASTEXITCODE
