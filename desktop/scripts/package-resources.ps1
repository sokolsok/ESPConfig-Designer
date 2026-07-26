[CmdletBinding()]
param(
    [string]$OutputRoot = "",
    [string]$RuntimeRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendSource = Join-Path $repoRoot "esp-config-designer"
$frontendDist = Join-Path $repoRoot "esp-config-designer\frontend\dist"
$windowsPlatformSource = Join-Path $repoRoot "desktop\platforms\windows"

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $PSScriptRoot "..\resources\ecd-app"
}
if (-not $RuntimeRoot) {
    $RuntimeRoot = Join-Path $env:LOCALAPPDATA "ECD\runtime"
}

$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
$backendOutput = Join-Path $OutputRoot "backend"
$runtimeOutput = Join-Path $OutputRoot "runtime"

foreach ($requiredPath in @(
    (Join-Path $backendSource "server.py"),
    (Join-Path $backendSource "desktop_launcher.py"),
    (Join-Path $backendSource "runtime_config.py"),
    (Join-Path $backendSource "runtime_manifest.py"),
    (Join-Path $backendSource "runtime_diagnostics.py"),
    (Join-Path $backendSource "runtime_update.py"),
    (Join-Path $backendSource "seed_esphome"),
    (Join-Path $frontendDist "index.html"),
    (Join-Path $windowsPlatformSource "git-manifest.json"),
    (Join-Path $RuntimeRoot "python.exe"),
    (Join-Path $RuntimeRoot "runtime-manifest.json"),
    (Join-Path $RuntimeRoot "git\LICENSE.txt")
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required packaging input is missing: $requiredPath"
    }
}

if (Test-Path -LiteralPath $OutputRoot) {
    Get-ChildItem -LiteralPath $OutputRoot -Force |
        Where-Object { $_.Name -ne "README.txt" } |
        Remove-Item -Recurse -Force
}
New-Item -ItemType Directory -Path $backendOutput -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeOutput -Force | Out-Null

foreach ($fileName in @("server.py", "desktop_launcher.py", "runtime_config.py", "runtime_manifest.py", "runtime_diagnostics.py", "runtime_update.py")) {
    Copy-Item -LiteralPath (Join-Path $backendSource $fileName) -Destination (Join-Path $backendOutput $fileName)
}
Copy-Item -LiteralPath (Join-Path $backendSource "seed_esphome") -Destination $backendOutput -Recurse
New-Item -ItemType Directory -Path (Join-Path $backendOutput "web") -Force | Out-Null
Copy-Item -Path (Join-Path $frontendDist "*") -Destination (Join-Path $backendOutput "web") -Recurse -Force

Copy-Item -Path (Join-Path $RuntimeRoot "*") -Destination $runtimeOutput -Recurse -Force
Copy-Item -LiteralPath (Join-Path $windowsPlatformSource "git-manifest.json") -Destination (Join-Path $runtimeOutput "git-manifest.json")

foreach ($immutableRoot in @($backendOutput, $runtimeOutput)) {
    Get-ChildItem -LiteralPath $immutableRoot -Recurse -Force -Directory -Filter "__pycache__" |
        Sort-Object FullName -Descending |
        Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $immutableRoot -Recurse -Force -File |
        Where-Object { $_.Extension -in @(".pyc", ".pyo") } |
        Remove-Item -Force
}

$layoutManifest = [ordered]@{
    schemaVersion = 1
    kind = "ecd-tauri-resource-layout"
    backend = "backend"
    webRoot = "backend/web"
    runtime = "runtime"
    mutableDataPolicy = "app-data-only"
    workspacePolicy = "user-selected-outside-app-data"
}
$layoutManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputRoot "resource-layout.json") -Encoding UTF8

Write-Host "[info] Packaged resources: $OutputRoot"
Write-Host "[info] Backend/web root: $(Join-Path $backendOutput 'web')"
Write-Host "[info] Embedded runtime: $runtimeOutput"
