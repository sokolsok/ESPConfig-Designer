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
$repoRoot = Split-Path -Parent $desktopRoot
$configPath = Join-Path $desktopRoot "src-tauri\tauri.conf.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$externalLinksCapabilityPath = Join-Path $desktopRoot "src-tauri\capabilities\external-links.json"
Assert-True (Test-Path -LiteralPath $externalLinksCapabilityPath -PathType Leaf) "External-link capability is missing"
$externalLinksCapability = Get-Content -LiteralPath $externalLinksCapabilityPath -Raw | ConvertFrom-Json
$externalLinkOrigins = @($externalLinksCapability.remote.urls)
Assert-True ($externalLinkOrigins.Count -eq 1 -and $externalLinkOrigins[0] -eq "http://127.0.0.1:*") "External-link capability must be limited to the Desktop loopback origin"
$externalLinkPermissions = @($externalLinksCapability.permissions)
Assert-True ($externalLinkPermissions.Count -eq 1) "External-link capability must contain one scoped permission"
$externalLinkPermission = $externalLinkPermissions[0]
Assert-True ($externalLinkPermission.identifier -eq "opener:allow-open-url") "External-link capability must only allow opening URLs"
$externalLinkScopes = @($externalLinkPermission.allow | ForEach-Object { $_.url } | Sort-Object)
Assert-True ($externalLinkScopes.Count -eq 2) "External-link capability must contain two URL scopes"
Assert-True ($externalLinkScopes[0] -eq "http://*" -and $externalLinkScopes[1] -eq "https://*") "External-link capability must be limited to HTTP and HTTPS"

$applicationRoot = Join-Path $repoRoot "esp-config-designer"
$backendSource = Join-Path $applicationRoot "backend"
$schemaCatalogSource = Join-Path $applicationRoot "shared\schema-catalog"
foreach ($relativePath in @(
    "server.py",
    "runtime_contract.py",
    "runtime_manifest.py",
    "runtime_diagnostics.py",
    "seed_esphome\secrets.yaml",
    "tests\test_runtime_contract.py"
)) {
    Assert-True (Test-Path -LiteralPath (Join-Path $backendSource $relativePath)) "Canonical backend source is missing: $relativePath"
}
$desktopPythonSource = Join-Path $desktopRoot "python"
foreach ($fileName in @("desktop_launcher.py", "desktop_runtime.py", "application_payload.py", "runtime_update.py")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $desktopPythonSource $fileName) -PathType Leaf) "Desktop Python adapter is missing: $fileName"
}
foreach ($fileName in @("test_desktop_runtime.py", "test_runtime_update.py")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $desktopRoot "tests\python\$fileName") -PathType Leaf) "Desktop Python test is missing: $fileName"
}
foreach ($desktopFile in @("desktop_launcher.py", "desktop_runtime.py", "application_payload.py", "runtime_update.py")) {
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $backendSource $desktopFile) -PathType Leaf)) "Desktop adapter remains under the shared backend: $desktopFile"
}
Assert-True (Test-Path -LiteralPath (Join-Path $schemaCatalogSource "components_list\components_list.json") -PathType Leaf) "Canonical schema catalog is missing"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $applicationRoot "frontend\public") -PathType Container)) "Tracked frontend catalog source remains"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $backendSource "runtime_config.py") -PathType Leaf)) "Mixed runtime_config.py remains under the shared backend"
foreach ($legacyFile in @("server.py", "desktop_launcher.py", "desktop_runtime.py", "application_payload.py", "runtime_config.py", "runtime_contract.py", "runtime_manifest.py", "runtime_diagnostics.py", "runtime_update.py")) {
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $applicationRoot $legacyFile) -PathType Leaf)) "Legacy backend source remains at application root: $legacyFile"
}

$windowsPlatformRoot = Join-Path $desktopRoot "platforms\windows"
$legacyWindowsRoot = Join-Path (Join-Path $repoRoot "esp-config-designer") "windows"
foreach ($fileName in @(
    "prepare-runtime.ps1",
    "launch.ps1",
    "clean-machine-gate.ps1",
    "requirements-runtime.txt",
    "git-manifest.json",
    "README.md"
)) {
    Assert-True (Test-Path -LiteralPath (Join-Path $windowsPlatformRoot $fileName) -PathType Leaf) "Windows platform tool is missing: $fileName"
}
Assert-True (-not (Test-Path -LiteralPath $legacyWindowsRoot -PathType Container)) "Windows platform tools remain under the shared backend"

foreach ($includeReadme in @($false, $true)) {
    $unsafeOutput = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-unsafe-package-output-" + [guid]::NewGuid().ToString("N"))
    try {
        New-Item -ItemType Directory -Path $unsafeOutput | Out-Null
        $sentinel = Join-Path $unsafeOutput "user-data.txt"
        Set-Content -LiteralPath $sentinel -Value "must survive" -Encoding ASCII
        if ($includeReadme) {
            Set-Content -LiteralPath (Join-Path $unsafeOutput "README.txt") `
                -Value "Generated by scripts/package-resources.ps1. Development placeholder only." -Encoding ASCII
        }
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $packageOutput = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass `
                -File (Join-Path $desktopRoot "scripts\package-resources.ps1") `
                -OutputRoot $unsafeOutput -RuntimeRoot (Join-Path $unsafeOutput "missing-runtime") 2>&1
            $unsafeExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        Assert-True ($unsafeExitCode -ne 0) "Package script accepted a non-generated non-empty OutputRoot"
        Assert-True (($packageOutput -join "`n") -like "*Refusing to clean a non-generated packaging output*") "Package script failed before checking OutputRoot ownership"
        Assert-True (Test-Path -LiteralPath $sentinel -PathType Leaf) "Package script deleted data from an unsafe OutputRoot"
    } finally {
        if (Test-Path -LiteralPath $unsafeOutput) {
            Remove-Item -LiteralPath $unsafeOutput -Recurse -Force
        }
    }
}

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
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "esp-config-designer-desktop.exe") -PathType Leaf) "Installed Desktop executable is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\server.py") -PathType Leaf) "Installed shared backend is missing"
    foreach ($fileName in @("desktop_launcher.py", "desktop_runtime.py", "application_payload.py", "runtime_contract.py", "runtime_manifest.py", "runtime_diagnostics.py", "runtime_update.py")) {
        Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\$fileName") -PathType Leaf) "Installed flat backend module is missing: $fileName"
    }
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\backend") -PathType Container)) "Installed resources contain backend/backend"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\tests") -PathType Container)) "Installed resources contain tests"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\runtime_config.py") -PathType Leaf)) "Installed resources contain obsolete runtime_config.py"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\web\index.html") -PathType Leaf) "Installed frontend bundle is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\schema-catalog\components_list\components_list.json") -PathType Leaf) "Installed schema catalog is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\schema-catalog-manifest.json") -PathType Leaf) "Installed schema catalog manifest is missing"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\backend\schema-catalog\schema-catalog") -PathType Container)) "Installed resources contain nested schema-catalog"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\runtime\python.exe") -PathType Leaf) "Installed embedded Python is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\runtime\git\cmd\git.exe") -PathType Leaf) "Installed MinGit is missing"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\workspace.json"))) "Workspace config was written to installed resources"
    $bytecodeFiles = @(Get-ChildItem -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app") -Recurse -File -Filter "*.pyc")
    Assert-True ($bytecodeFiles.Count -eq 0) "Python bytecode was written to installed resources"
}

"package contract: PASS"
