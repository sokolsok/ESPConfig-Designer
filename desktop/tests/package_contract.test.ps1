param(
    [string]$InstallRoot = "",
    [string]$ExpectedExecutableSha256 = ""
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
$releaseContractTest = Join-Path $PSScriptRoot "release_build_contract.test.mjs"
$workflowContractTest = Join-Path $PSScriptRoot "windows_workflow_contract.test.mjs"
& node --test $releaseContractTest $workflowContractTest
Assert-True ($LASTEXITCODE -eq 0) "Unsigned release build contract failed"
$cleanMachineKitContract = Join-Path $PSScriptRoot "clean-machine-kit-contract.test.ps1"
& "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $cleanMachineKitContract
Assert-True ($LASTEXITCODE -eq 0) "Clean-machine kit contract failed"

$desktopPackage = Get-Content -LiteralPath (Join-Path $desktopRoot "package.json") -Raw | ConvertFrom-Json
$releaseScriptPath = Join-Path $desktopRoot "scripts\build-package-release.mjs"
Assert-True (Test-Path -LiteralPath $releaseScriptPath -PathType Leaf) "Unsigned release build script is missing"
Assert-True ($desktopPackage.scripts.'build:package:release' -eq "node scripts/build-package-release.mjs") "Unsigned release build command must have one repository-owned entry point"
$releaseScriptSource = Get-Content -LiteralPath $releaseScriptPath -Raw
Assert-True ($releaseScriptSource.Contains('build", "--bundles", "nsis"')) "Release build must explicitly use tauri build --bundles nsis"
Assert-True (-not $releaseScriptSource.Contains('build", "--debug"')) "Release build must not pass --debug"
Assert-True (-not $releaseScriptSource.Contains('npm.cmd')) "Release build must not execute the Windows npm command shim through spawnSync"
Assert-True (-not $releaseScriptSource.Contains('tauri.cmd')) "Release build must not execute the Windows Tauri command shim through spawnSync"
$configPath = Join-Path $desktopRoot "src-tauri\tauri.conf.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$configuredCsp = [string]$config.app.security.csp
Assert-True ($configuredCsp -eq "default-src 'none'") "Bundled Tauri assets must remain fail-closed; the loopback UI receives CSP from Flask"
$cargoManifestSource = Get-Content -LiteralPath (Join-Path $desktopRoot "src-tauri\Cargo.toml") -Raw
$tauriMainSource = Get-Content -LiteralPath (Join-Path $desktopRoot "src-tauri\src\main.rs") -Raw
$startupGuardPath = Join-Path $desktopRoot "src-tauri\src\startup_guard.rs"
Assert-True (Test-Path -LiteralPath $startupGuardPath -PathType Leaf) "Windows startup guard module is missing"
$startupGuardSource = Get-Content -LiteralPath $startupGuardPath -Raw
$simultaneousStartTestPath = Join-Path $desktopRoot "tests\tauri-simultaneous-start.test.ps1"
Assert-True (Test-Path -LiteralPath $simultaneousStartTestPath -PathType Leaf) "Simultaneous startup process gate is missing"
$simultaneousStartTestSource = Get-Content -LiteralPath $simultaneousStartTestPath -Raw
$tauriSmokeSource = Get-Content -LiteralPath (Join-Path $desktopRoot "tests\tauri-smoke.test.ps1") -Raw
$webviewCspGateSource = Get-Content -LiteralPath (Join-Path $desktopRoot "tests\webview-csp-gate.mjs") -Raw
Assert-True ($tauriMainSource.Contains('.additional_browser_args(')) "WebView smoke debugging must use Tauri browser arguments on elevated Windows runners"
Assert-True ($tauriMainSource.Contains('.data_directory(')) "WebView smoke must use an isolated programmatic data directory"
Assert-True ($tauriSmokeSource.Contains('ECD_TAURI_WEBVIEW_DEBUG_PORT')) "WebView smoke must pass the scoped Tauri debug port"
Assert-True (-not $tauriSmokeSource.Contains('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS')) "WebView smoke must not rely on WebView2 environment overrides ignored by elevated hosts"
Assert-True (-not $tauriSmokeSource.Contains('WEBVIEW2_USER_DATA_FOLDER')) "WebView smoke must not rely on the WebView2 environment data-directory override"
$initialDocumentReadyIndex = $webviewCspGateSource.IndexOf('await waitForDocument(client)')
$pageNavigateIndex = $webviewCspGateSource.IndexOf('await client.send("Page.navigate"')
Assert-True ($initialDocumentReadyIndex -ge 0 -and $initialDocumentReadyIndex -lt $pageNavigateIndex) "WebView CSP smoke must finish the initial navigation before requesting controlled navigation"
Assert-True (-not $webviewCspGateSource.Contains('client.send("Page.reload"')) "WebView CSP smoke must not rely on Page.reload, which is ignored by the installed hosted WebView"
Assert-True ($cargoManifestSource.Contains('tauri-plugin-single-instance = "=2.4.3"')) "Single-instance plugin must be exactly pinned"
$guardAcquireIndex = $tauriMainSource.IndexOf('StartupGuard::acquire(')
$builderIndex = $tauriMainSource.IndexOf('tauri::Builder::default()')
$singleInstancePluginIndex = $tauriMainSource.IndexOf('.plugin(tauri_plugin_single_instance::init(')
$dialogPluginIndex = $tauriMainSource.IndexOf('.plugin(tauri_plugin_dialog::init())')
$openerPluginIndex = $tauriMainSource.IndexOf('.plugin(tauri_plugin_opener::init())')
$setupIndex = $tauriMainSource.IndexOf('.setup(')
Assert-True ($tauriMainSource.Contains('#[cfg(windows)]`r`nmod startup_guard;') -or $tauriMainSource.Contains("#[cfg(windows)]`nmod startup_guard;")) "Startup guard must remain isolated to Windows"
Assert-True ($guardAcquireIndex -ge 0 -and $guardAcquireIndex -lt $builderIndex) "Startup guard must be acquired before creating the Tauri builder"
Assert-True ($singleInstancePluginIndex -ge 0) "Single-instance plugin is not registered"
Assert-True ($singleInstancePluginIndex -lt $dialogPluginIndex) "Single-instance plugin must precede the dialog plugin"
Assert-True ($singleInstancePluginIndex -lt $openerPluginIndex) "Single-instance plugin must precede the opener plugin"
Assert-True ($singleInstancePluginIndex -lt $setupIndex) "Single-instance plugin must be registered before setup"
$setupBody = $tauriMainSource.Substring($setupIndex, [Math]::Min(500, $tauriMainSource.Length - $setupIndex))
Assert-True ($setupBody -match '\.setup\(move \|app\| \{\s*#\[cfg\(windows\)\]\s*if let Err\(error\) = startup_guard\.release\(\)') "Startup guard must be released as the first setup operation"
Assert-True ($setupBody -match 'startup_guard\s*\.release\(\)[\s\S]{0,300}show_startup_error') "Startup guard release failures must show a native error before setup fails"
Assert-True ($startupGuardSource.Contains('Local\com.espconfigdesigner.desktop.startup-guard')) "Startup guard must use a stable session-local name distinct from the plugin mutex"
Assert-True (-not $startupGuardSource.Contains('com.espconfigdesigner.desktop-sim')) "Startup guard must not reuse the single-instance plugin mutex name"
Assert-True ($startupGuardSource.Contains('WaitForSingleObject')) "Startup guard must use a bounded Windows wait"
Assert-True ($startupGuardSource.Contains('WAIT_TIMEOUT')) "Startup guard must handle timeout explicitly"
Assert-True ($startupGuardSource.Contains('WAIT_ABANDONED')) "Startup guard must recover an abandoned mutex"
Assert-True ($startupGuardSource.Contains('WAIT_FAILED')) "Startup guard must report Windows wait failures"
Assert-True ($startupGuardSource -match 'Duration::from_secs\(10\)') "Startup guard wait must have a stable ten-second bound"
Assert-True ($startupGuardSource -match 'Timeout[\s\S]{0,500}Err\(') "Startup guard timeout must fail closed"
Assert-True (-not $config.PSObject.Properties.Name.Contains('allowMultipleInstances')) "Desktop must not enable multiple instances"
Assert-True ($tauriMainSource -match 'fn handle_second_instance[\s\S]*?activate_main_window') "Single-instance callback must continue to activate the main window"
Assert-True ($desktopPackage.scripts.'test:tauri-simultaneous-start' -eq "powershell -ExecutionPolicy Bypass -File tests/tauri-simultaneous-start.test.ps1") "Simultaneous startup command is missing"
Assert-True ($simultaneousStartTestSource.Contains('ECD_TAURI_TEST_STARTUP_GUARD_HOLD_MS')) "Simultaneous startup gate must widen the guarded window deterministically"
Assert-True ($simultaneousStartTestSource.Contains('Wait-StartupGuardOwned $primary')) "Simultaneous startup gate must prove primary guard ownership before launching secondary"
Assert-True ($simultaneousStartTestSource.Contains('Wait-StartupGuardOwned $crashedPrimary')) "Crash gate must prove primary guard ownership before launching takeover"
Assert-True ($simultaneousStartTestSource.Contains('Process did not recover the abandoned startup guard')) "Simultaneous startup gate must cover primary crash recovery"
Assert-True ($simultaneousStartTestSource.Contains('Startup guard timeout failed open')) "Simultaneous startup gate must cover fail-closed timeout"
Assert-True (-not $simultaneousStartTestSource.Contains('MainWindowHandle')) "Startup error cleanup must not target the plugin IPC window through Process.MainWindowHandle"
Assert-True ($simultaneousStartTestSource.Contains('ESPConfig Designer could not start')) "Startup error cleanup must require the exact startup dialog title"
foreach ($windowApi in @('EnumWindows', 'GetWindowThreadProcessId', 'IsWindowVisible', 'GetWindowTextLengthW', 'GetWindowTextW')) {
    Assert-True ($simultaneousStartTestSource.Contains($windowApi)) "Startup error cleanup is missing precise window API: $windowApi"
}
Assert-True ($simultaneousStartTestSource -match 'GetWindowThreadProcessId[\s\S]{0,500}processId\s*!=\s*expectedProcessId') "Startup error cleanup must reject windows belonging to another PID"
Assert-True ($simultaneousStartTestSource -match 'String\.Equals\([\s\S]{0,300}expectedTitle[\s\S]{0,100}StringComparison\.Ordinal') "Startup error cleanup must compare the complete dialog title exactly"
$closeDialogMatch = [regex]::Match($simultaneousStartTestSource, 'function Close-StartupErrorDialog[\s\S]*?\r?\n\}')
Assert-True ($closeDialogMatch.Success) "Startup error dialog closer is missing"
Assert-True ($closeDialogMatch.Value -match 'if \(\$Process\.HasExited\) \{ return \}') "Startup error dialog wait must stop if the process exits first"
Assert-True ($closeDialogMatch.Value -match 'Assert-True \(\[StartupGuardNative\]::PostMessageW\(') "Startup error cleanup must check the PostMessageW result"
$cleanupErrorsIndex = $simultaneousStartTestSource.IndexOf('$cleanupErrors = New-Object System.Collections.Generic.List[string]')
$mainCatchIndex = $simultaneousStartTestSource.IndexOf('catch {', $simultaneousStartTestSource.IndexOf('try {', $cleanupErrorsIndex))
$finalCleanupIndex = $simultaneousStartTestSource.LastIndexOf('} finally {')
Assert-True ($cleanupErrorsIndex -ge 0) "Simultaneous-start cleanup must collect independent cleanup errors"
Assert-True ($simultaneousStartTestSource.Contains('$testFailure = $null')) "Simultaneous-start gate must reserve the original test failure"
Assert-True ($mainCatchIndex -ge 0 -and $mainCatchIndex -lt $finalCleanupIndex) "Simultaneous-start gate must catch and preserve its primary failure before cleanup"
Assert-True ($simultaneousStartTestSource -match 'catch \{\s*\$testFailure = \$_\s*\}[\s\S]*finally') "Simultaneous-start gate must preserve the original ErrorRecord"
$cleanupBody = $simultaneousStartTestSource.Substring($finalCleanupIndex)
Assert-True ($cleanupBody -match 'try \{[\s\S]{0,300}\$foreignListener\.Stop\(\)[\s\S]{0,300}\} catch \{') "Foreign-listener cleanup must have its own try/catch"
Assert-True ($cleanupBody -match 'try \{[\s\S]{0,300}ReleaseMutex\(\$externalMutex\)[\s\S]{0,300}\} catch \{') "External mutex release must have its own try/catch"
Assert-True ($cleanupBody -match 'try \{[\s\S]{0,300}CloseHandle\(\$externalMutex\)[\s\S]{0,300}\} catch \{') "External mutex handle close must have its own try/catch"
Assert-True ($cleanupBody -match 'foreach \(\$process in \$processes\) \{\s*try \{[\s\S]{0,500}Stop-ProcessTree[\s\S]{0,300}\} catch \{') "Each test process must be cleaned in an independent try/catch"
Assert-True ($cleanupBody -match 'foreach \(\$port in \$ports\) \{\s*try \{[\s\S]{0,300}Wait-NoListener[\s\S]{0,300}\} catch \{') "Each test port must be checked in an independent try/catch"
Assert-True ($cleanupBody -match 'foreach \(\$root in \$roots\) \{\s*try \{[\s\S]{0,500}Remove-Item -LiteralPath \$root[\s\S]{0,300}\} catch \{') "Each test root must be removed in an independent try/catch"
Assert-True ($cleanupBody -match 'if \(\$testFailure\)[\s\S]{0,500}throw \$testFailure') "Cleanup reporting must rethrow the original test failure"
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
    "requirements-runtime.lock",
    "requirements-bootstrap.lock",
    "python-manifest.json",
    "artifact-integrity.ps1",
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
Assert-True ($null -ne $windowsBundle) "Windows bundle configuration is missing"
$nsisConfiguration = $windowsBundle.nsis
Assert-True ($null -ne $nsisConfiguration) "Windows bundle must explicitly configure NSIS"
Assert-True ($nsisConfiguration.installMode -eq "currentUser") "NSIS must remain a per-user installation"
$webviewInstallMode = $windowsBundle.webviewInstallMode
Assert-True ($null -ne $webviewInstallMode) "Windows bundle must explicitly configure WebView2 installation"
Assert-True ($webviewInstallMode.type -eq "downloadBootstrapper") "Windows bundle must use Tauri's online WebView2 bootstrapper"
Assert-True ($webviewInstallMode.silent -eq $true) "WebView2 bootstrapper must run silently under the NSIS installer"
Assert-True ($null -eq $config.plugins.updater) "Desktop package must not configure an auto-updater"
Assert-True ($config.bundle.createUpdaterArtifacts -ne $true) "Desktop package must not create updater artifacts"
Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.certificateThumbprint)) "Development package must not configure a certificate"
Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.signCommand)) "Development package must not configure a signing command"
Assert-True ([string]::IsNullOrWhiteSpace([string]$windowsBundle.timestampUrl)) "Development package must not configure a timestamp service"

$publicDocuments = @(
    (Join-Path $repoRoot "README.md"),
    (Join-Path $repoRoot "CHANGELOG.md"),
    (Join-Path $repoRoot "docs\installation\windows.md"),
    (Join-Path $repoRoot "docs\development\desktop.md"),
    (Join-Path $desktopRoot "README.md"),
    (Join-Path $windowsPlatformRoot "README.md")
)
foreach ($documentPath in $publicDocuments) {
    $documentSource = Get-Content -LiteralPath $documentPath -Raw
    Assert-True (-not $documentSource.Contains("R&D/")) "Public documentation references private R&D material: $documentPath"
    Assert-True (-not $documentSource.Contains("C:\Users\")) "Public documentation contains a machine-local user path: $documentPath"
}

$windowsInstallationGuide = Get-Content -LiteralPath (Join-Path $repoRoot "docs\installation\windows.md") -Raw
$desktopPredecessorPolicy = "Desktop predecessor update applicability for 1.4.0: not applicable."
Assert-True ($windowsInstallationGuide.Contains($desktopPredecessorPolicy)) "Windows installation policy does not explicitly remove a predecessor update from 1.4.0 scope"
$mandatoryFirstReleaseLifecycle = 'Same-version reinstall,\s+uninstall data preservation, and reinstall with retained data remain mandatory\s+for `1\.4\.0`\.'
Assert-True ($windowsInstallationGuide -match $mandatoryFirstReleaseLifecycle) "Windows installation policy weakened mandatory first-release lifecycle coverage"
foreach ($forbiddenPredecessorClaim in @(
    "Manual update from `1.3.3` remains",
    "1.3.3 -> 1.4.0",
    "future public `1.4.0` update"
)) {
    Assert-True (-not $windowsInstallationGuide.Contains($forbiddenPredecessorClaim)) "Windows installation policy reintroduced an invalid predecessor claim: $forbiddenPredecessorClaim"
}
foreach ($requiredPolicy in @(
    "Windows 10 22H2 Home and Pro x64",
    "19045.7548",
    "October 12, 2027",
    "Windows 11 25H2 Home and Pro x64",
    "26200.8973",
    "Windows ARM64",
    "manual update",
    "first supported Windows Desktop release",
    "no supported Desktop predecessor",
    "Future Desktop releases",
    "runtime_update.py",
    "SignPath Foundation",
    "NOT RUN"
)) {
    Assert-True ($windowsInstallationGuide.Contains($requiredPolicy)) "Windows installation policy is missing: $requiredPolicy"
}

$desktopDevelopmentGuide = Get-Content -LiteralPath (Join-Path $repoRoot "docs\development\desktop.md") -Raw
Assert-True ($desktopDevelopmentGuide.Contains("npm --prefix desktop run build:package:release")) "Desktop development guide is missing the unsigned release build command"
Assert-True ($desktopDevelopmentGuide.Contains("unsigned technical candidate - not for users")) "Desktop development guide is missing the unsigned candidate warning"
Assert-True (-not $desktopDevelopmentGuide.Contains("There is no release package command")) "Desktop development guide still denies the release command"

if ($InstallRoot) {
    $resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
    $installedExecutable = Join-Path $resolvedInstallRoot "esp-config-designer-desktop.exe"
    Assert-True (Test-Path -LiteralPath $installedExecutable -PathType Leaf) "Installed Desktop executable is missing"
    $installedSignature = Get-AuthenticodeSignature -LiteralPath $installedExecutable
    Assert-True ($installedSignature.Status -eq "NotSigned") "Installed Desktop executable must be NotSigned"
    if ($ExpectedExecutableSha256) {
        Assert-True ($ExpectedExecutableSha256 -match "^[0-9a-fA-F]{64}$") "Expected installed executable SHA-256 is invalid"
        $installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installedExecutable).Hash
        Assert-True ($installedHash -eq $ExpectedExecutableSha256) "Installed Desktop executable SHA-256 does not match the packaged application executable"
    }
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
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\runtime\python-manifest.json") -PathType Leaf) "Installed Python artifact provenance is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\supply-chain\inventory.json") -PathType Leaf) "Installed supply-chain inventory is missing"
    Assert-True (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\supply-chain\THIRD-PARTY-NOTICES.md") -PathType Leaf) "Installed third-party notices are missing"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app\workspace.json"))) "Workspace config was written to installed resources"
    $bytecodeFiles = @(Get-ChildItem -LiteralPath (Join-Path $resolvedInstallRoot "ecd-app") -Recurse -File -Filter "*.pyc")
    Assert-True ($bytecodeFiles.Count -eq 0) "Python bytecode was written to installed resources"
}

"package contract: PASS"
