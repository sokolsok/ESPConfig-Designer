param(
    [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
}

$desktopRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $desktopRoot "src-tauri\tauri.conf.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

Assert-True ($config.bundle.active -eq $true) "Desktop bundle must be active"
$targets = @($config.bundle.targets)
Assert-True ($targets.Count -eq 1 -and $targets[0] -eq "nsis") "NSIS must be the only bundle target"

$resourceSource = "../resources/ecd-app/"
$resourceTarget = "ecd-app/"
$resourceProperty = $config.bundle.resources.PSObject.Properties[$resourceSource]
Assert-True ($null -ne $resourceProperty) "Packaged resources must use an explicit ecd-app target"
Assert-True ($resourceProperty.Value -eq $resourceTarget) "Packaged resources must resolve to resource_dir/ecd-app"

$windowsBundle = $config.bundle.windows
if ($null -ne $windowsBundle) {
    Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.certificateThumbprint)) "Development package must not configure a certificate"
    Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.signCommand)) "Development package must not configure a signing command"
    Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.timestampUrl)) "Development package must not configure a timestamp service"
}

if ($InstallRoot) {
    $resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\server.py") -PathType Leaf) "Installed shared backend is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\web\index.html") -PathType Leaf) "Installed frontend bundle is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\runtime\python.exe") -PathType Leaf) "Installed embedded Python is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\runtime\git\cmd\git.exe") -PathType Leaf) "Installed MinGit is missing"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\workspace.json"))) "Workspace config was written to installed resources"
    $bytecodeFiles = @(Get-ChildItem -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app") -Recurse -File -Filter "*.pyc")
    Assert-True ($bytecodeFiles.Count -eq 0) "Python bytecode was written to installed resources"
}

"package contract: PASS"
