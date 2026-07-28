[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$forbiddenPaths = @(
    "esp-config-designer-frontend",
    "esp-config-designer\frontend\dist",
    "esp-config-designer\frontend\node_modules",
    "desktop\node_modules",
    "desktop\src-tauri\target",
    "desktop\resources\ecd-app\backend",
    "desktop\resources\ecd-app\runtime",
    "desktop\resources\ecd-app\resource-layout.json"
)
foreach ($relativePath in $forbiddenPaths) {
    $path = Join-Path $repoRoot $relativePath
    if (Test-Path -LiteralPath $path) {
        throw "Clean checkout contains generated or legacy input: $relativePath"
    }
}

$resourcesRoot = Join-Path $repoRoot "desktop\resources\ecd-app"
$resourceEntries = @(Get-ChildItem -LiteralPath $resourcesRoot -Force)
if ($resourceEntries.Count -ne 1 -or $resourceEntries[0].Name -ne "README.txt") {
    throw "Clean checkout Desktop resources are not the tracked placeholder-only layout"
}

foreach ($relativePath in @(
    "VERSION",
    "esp-config-designer\backend\server.py",
    "esp-config-designer\frontend\package-lock.json",
    "esp-config-designer\shared\schema-catalog\components_list\components_list.json",
    "desktop\platforms\windows\prepare-runtime.ps1",
    "desktop\package-lock.json"
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
        throw "Clean checkout is missing tracked input: $relativePath"
    }
}

Write-Host "clean checkout source gate: PASS"
