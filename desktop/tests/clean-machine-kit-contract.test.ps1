[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Write-JsonFile([string]$Path, [object]$Value) {
    $json = $Value | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($Path, $json + "`n", (New-Object Text.UTF8Encoding($false)))
}

function Invoke-Gate([string[]]$Arguments, [bool]$ShouldPass, [string]$ExpectedError = "") {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -NoProfile -ExecutionPolicy Bypass -File $script:orchestrator @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($ShouldPass) {
        Assert-True ($exitCode -eq 0) "Gate unexpectedly failed: $($output -join "`n")"
    } else {
        Assert-True ($exitCode -ne 0) "Gate unexpectedly accepted an invalid fixture"
        if ($ExpectedError) {
            $normalizedOutput = (($output -join "`n") -replace '\s+', ' ').Trim()
            $normalizedExpectedError = ($ExpectedError -replace '\s+', ' ').Trim()
            Assert-True ($normalizedOutput -like "*$normalizedExpectedError*") "Gate failed for the wrong reason; expected '$ExpectedError': $($output -join "`n")"
        }
    }
}

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$script:orchestrator = Join-Path $desktopRoot "platforms\windows\clean-machine-release-gate.ps1"
$builder = Join-Path $desktopRoot "scripts\build-clean-machine-kit.ps1"
$fixture = Join-Path $PSScriptRoot "fixtures\clean-machine\compile-only.yaml"
$matrixPolicy = Join-Path $PSScriptRoot "fixtures\clean-machine\windows-matrix-policy.json"

foreach ($required in @($script:orchestrator, $builder, $fixture, $matrixPolicy)) {
    Assert-True (Test-Path -LiteralPath $required -PathType Leaf) "Clean-machine kit input is missing: $required"
}

$orchestratorSource = Get-Content -LiteralPath $script:orchestrator -Raw
$builderSource = Get-Content -LiteralPath $builder -Raw
foreach ($requiredContract in @(
    "New-OwnedLifecycleRoot",
    "Assert-OwnedLifecycleRoot",
    "Complete-LifecycleUninstall",
    "Get-AccountContext",
    "GetJobProcessIds",
    "Close-LifecycleJobAndWait"
)) {
    Assert-True ($orchestratorSource.Contains($requiredContract)) "Lifecycle safety contract is missing: $requiredContract"
}
Assert-True ($builderSource.Contains('archive --format=tar')) "Production kit builder must read payload bytes from the exact committed source"
Assert-True ($builderSource.Contains('status --porcelain=v1 --untracked-files=all')) "Production kit builder must recheck source drift after staging"
Assert-True ($orchestratorSource.Contains('$attestation.matrixPolicySha256 -ne $ExpectedMatrixPolicySha256')) "Clean-VM attestation must bind the exact matrix policy"
Assert-True ($orchestratorSource.Contains('$attestation.scenario -ne $AttestationScenario')) "Clean-VM attestations must bind the exact Lifecycle or Startup scenario"
Assert-True ($orchestratorSource.Contains('with code $exitCode (0x$exitCodeHex)')) "Graceful-close failures must report the exact decimal and hexadecimal application exit code"
$pinnedProcessBody = [regex]::Match($orchestratorSource, '(?s)function Get-PinnedProcessById\b.*?(?=\r?\nfunction )').Value
Assert-True ($pinnedProcessBody -match 'GetProcessById\(\$ProcessId\)[\s\S]*?\$null = \$process\.Handle[\s\S]*?return') "Managed process ownership must pin the handle while the process is still suspended"
$prepareOwnedStartupBody = [regex]::Match($orchestratorSource, '(?s)function Prepare-OwnedStartupProcess\b.*?(?=\r?\nfunction )').Value
Assert-True ($prepareOwnedStartupBody.Contains('Get-PinnedProcessById $suspended.ProcessId')) "Suspended Startup processes must pin their managed handle before resume"
$lifecycleStartBody = [regex]::Match($orchestratorSource, '(?s)function Start-LifecycleApplication\b.*?(?=\r?\nfunction )').Value
Assert-True ($lifecycleStartBody.Contains('Get-PinnedProcessById $suspended.ProcessId')) "Suspended Lifecycle processes must pin their managed handle before resume"
$stopExactStartupBody = [regex]::Match($orchestratorSource, '(?s)function Stop-ExactStartupPrimary\b.*?(?=\r?\nfunction )').Value
Assert-True ($stopExactStartupBody.Contains('GetJobProcessIds') -and $stopExactStartupBody.Contains('Get-NetTCPConnection')) "Forced Startup cleanup must observe owned Job PIDs and the exact listener"
Assert-True (-not $stopExactStartupBody.Contains('TerminateJob')) "Forced Startup evidence must not terminate the outer harness Job"
$startupScenarioBody = [regex]::Match($orchestratorSource, '(?s)function Invoke-StartupScenario\b.*?(?=\r?\nfunction Assert-Report)').Value
Assert-True ($startupScenarioBody -match '(?s)\$coldOne = Prepare-OwnedStartupProcess.*?\$coldTwo = Prepare-OwnedStartupProcess.*?Resume-OwnedStartupProcess \$coldOne.*?Resume-OwnedStartupProcess \$coldTwo') "Natural cold burst must prepare two separately owned suspended processes before either resume"
Assert-True ($orchestratorSource.Contains('public static extern bool ShowWindow') -and $orchestratorSource.Contains('public static extern bool IsIconic') -and $startupScenarioBody.Contains('Minimize-ExactStartupWindow $primary')) "Warm focus evidence must minimize the exact primary window"
$waitRestoredWindowBody = [regex]::Match($orchestratorSource, '(?s)function Wait-ExactStartupWindowRestored\b.*?(?=\r?\nfunction )').Value
Assert-True ($waitRestoredWindowBody.Contains('AddSeconds(10)') -and $waitRestoredWindowBody.Contains('IsIconic') -and $waitRestoredWindowBody.Contains('IsWindowVisible') -and $waitRestoredWindowBody.Contains('FindVisibleWindow') -and $waitRestoredWindowBody.Contains('GetForegroundWindow')) "Warm restore/focus evidence must wait boundedly for the exact primary HWND, PID, and foreground ownership"
Assert-True ($waitRestoredWindowBody.Contains('return $false')) "An unobserved automatic warm restore must return an accepted-warning result instead of aborting Startup"
$waitStartupTreesBody = [regex]::Match($orchestratorSource, '(?s)function Wait-StartupDataTreesStable\b.*?(?=\r?\nfunction )').Value
Assert-True ($waitStartupTreesBody.Contains('esp_projects\projects.json') -and $waitStartupTreesBody.Contains('AddSeconds(30)') -and $waitStartupTreesBody.Contains('stableSince') -and $waitStartupTreesBody.Contains('TotalSeconds -ge 2') -and $waitStartupTreesBody.Contains('$Primary.process.HasExited')) "Clean-machine warm baseline must wait boundedly for Dashboard bootstrap and sustained data-tree quiescence"
Assert-True (([regex]::Matches($waitStartupTreesBody, '\$Primary\.process\.HasExited').Count -ge 2) -and ([regex]::Matches($waitStartupTreesBody, 'Test-Path -LiteralPath \$bootstrapPath').Count -ge 2) -and $waitStartupTreesBody.Contains('[DateTime]::UtcNow -ge $deadline')) "Clean-machine warm baseline must revalidate primary, bootstrap marker, and deadline after tree scans"
$finalMarkerIndex = $waitStartupTreesBody.LastIndexOf('if (-not (Test-Path -LiteralPath $bootstrapPath -PathType Leaf))')
$finalPrimaryIndex = $waitStartupTreesBody.LastIndexOf('if ($Primary.process.HasExited)')
$finalDeadlineIndex = $waitStartupTreesBody.LastIndexOf('if ([DateTime]::UtcNow -ge $deadline)')
$stableReturnIndex = $waitStartupTreesBody.IndexOf('return [pscustomobject]')
Assert-True ($finalMarkerIndex -ge 0 -and $finalMarkerIndex -lt $finalPrimaryIndex -and $finalPrimaryIndex -lt $finalDeadlineIndex -and $finalDeadlineIndex -lt $stableReturnIndex) "Clean-machine warm baseline success must revalidate marker, primary, and deadline immediately before returning"
Assert-True ($startupScenarioBody -match '\$warmTrees = Wait-StartupDataTreesStable[\s\S]{0,300}\$warmWorkspaceBefore = \$warmTrees\.workspace[\s\S]{0,100}\$warmAppDataBefore = \$warmTrees\.appData[\s\S]{0,200}\$primaryWindow = Minimize-ExactStartupWindow') "Startup must capture both quiescent data-tree baselines before minimizing the exact primary"
Assert-True ($startupScenarioBody.Contains('$automaticWarmRestoreObserved = Wait-ExactStartupWindowRestored $primary $primaryWindow')) "Warm launch must record its bounded automatic restore observation"
Assert-True ($startupScenarioBody.Contains('accepted_warning') -and $startupScenarioBody.Contains('automatic_warm_restore_focus')) "Startup must report an unobserved automatic restore/focus as an explicit accepted warning"
Assert-True ($startupScenarioBody.Contains('Restore the existing window manually from the Windows taskbar')) "Startup must require manual taskbar recovery when automatic activation is not observed"
Assert-True ($startupScenarioBody.Contains('Assert-TreeIdentity $warmWorkspaceBefore') -and $startupScenarioBody.Contains('Assert-TreeIdentity $warmAppDataBefore')) "Warm launch must preserve the workspace and app-data trees"
Assert-True ($startupScenarioBody.Contains('Warm launch terminated the exact primary') -and $startupScenarioBody.Contains('Warm launch changed the exact backend or listener ownership')) "Warm launch must reverify the exact primary and backend/listener ownership"
Assert-True ($startupScenarioBody.Contains('$startupListeners[0].OwningProcess') -and $startupScenarioBody.Contains('$pythonProcesses[0].ProcessId')) "Startup listener ownership must bind to the exact embedded Python backend PID"
Assert-True ($startupScenarioBody.Contains('Both widened-guard Startup processes must remain alive while the guard is held')) "Widened Startup guard must require both processes to remain alive"
Assert-True ($orchestratorSource.Contains('public static extern IntPtr CreateEventW') -and $orchestratorSource.Contains('ECD_TAURI_TEST_STARTUP_GUARD_RELEASE_EVENT') -and $orchestratorSource.Contains('ECD_TAURI_TEST_STARTUP_GUARD_OWNED_EVENT') -and ([regex]::Matches($startupScenarioBody, '\[CleanMachinePathNative\]::CreateEventW').Count -ge 2)) "Widened Startup guard must use harness-owned release and ownership events"
Assert-True ($startupScenarioBody -match 'WaitForSingleObject\(\$ownedEvent, 5000\)[\s\S]{0,200}Startup guard owner acknowledgement') "Widened Startup guard must receive primary-specific ownership acknowledgement"
Assert-True ($startupScenarioBody.Contains('Workspace tree while Startup guard is held') -and $startupScenarioBody.Contains('App-data tree while Startup guard is held')) "Widened Startup guard must preserve mutable trees while deterministically held"
$guardOwnershipChecks = [regex]::Matches($startupScenarioBody, 'Wait-StartupGuardOwned \$heldPrimary').Count
Assert-True ($guardOwnershipChecks -ge 2 -and $startupScenarioBody -match 'Wait-StartupGuardOwned \$heldPrimary\s*if \(\[DateTime\]::UtcNow -ge \$releaseEventProofDeadline\)[\s\S]{0,250}Stop-ExactStartupPrimary \$heldPrimary') "Widened Startup guard ownership must be reverified immediately before owner termination"
Assert-True ($startupScenarioBody.Contains('[DateTime]::UtcNow.AddSeconds(25)') -and $startupScenarioBody.Contains('release-event ownership proof exceeded its 25-second deadline')) "Widened Startup guard proof must fail before the product's bounded release-event wait can expire"
Assert-True ($stopExactStartupBody.Contains('exited before forced termination evidence')) "Forced Startup cleanup must reject a process that exits before the harness kills it"
Assert-True ($startupScenarioBody.Contains('$timeoutWorkspaceBefore') -and $startupScenarioBody.Contains('$timeoutAppDataBefore') -and $startupScenarioBody.Contains('external Startup guard timeout')) "Startup timeout must preserve workspace and app-data trees"
Assert-True (-not $startupScenarioBody.Contains('/tail')) "Startup reconciliation must not call or parse the job-tail API"
Assert-True ($startupScenarioBody.Contains('Get-StartupFileIdentity $jobLogPath') -and $startupScenarioBody.Contains('Assert-StartupFileIdentity $jobLogBeforeRestart $jobLogPath')) "Startup reconciliation must preserve exact job-log byte identity"
Assert-True ($orchestratorSource.Contains('Owned Startup cleanup root is missing its ownership marker')) "Startup cleanup must fail closed when an ownership marker is missing"
foreach ($forbiddenStartupOverride in @(
    "ECD_TAURI_BACKEND_ROOT", "ECD_TAURI_RUNTIME_ROOT", "ECD_TAURI_WEB_ROOT", "ECD_TAURI_SCHEMA_CATALOG_ROOT",
    "ECD_TAURI_SCHEMA_CATALOG_MANIFEST", "ECD_TAURI_BACKEND_EXECUTABLE", "ECD_TAURI_BACKEND_SCRIPT",
    "ECD_TAURI_APPLICATION_STORE", "ECD_TAURI_BACKEND_BINARY", "ECD_TAURI_WEBVIEW_DEBUG_PORT"
)) {
    Assert-True ($startupScenarioBody.Contains($forbiddenStartupOverride) -or $orchestratorSource.Contains($forbiddenStartupOverride)) "Startup environment does not clear inherited override: $forbiddenStartupOverride"
}
Assert-True ($startupScenarioBody.Contains('Assert-StartupMutexAbsent') -and $orchestratorSource.Contains('LastError() -eq 183')) "Startup controlled mutex cases must reject a pre-existing production mutex"
Assert-True ($orchestratorSource.Contains('resourcePayloadSha256')) "Startup artifact/report contract must bind the complete resource payload"

$exitProbe = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Milliseconds 300; exit 37") -PassThru
try {
    $observedExitProbe = [Diagnostics.Process]::GetProcessById($exitProbe.Id)
    $null = $observedExitProbe.Handle
    $exitProbe.Dispose()
    $exitProbe = $null
    Start-Sleep -Seconds 1
    Assert-True ($observedExitProbe.WaitForExit(5000)) "Pinned fast-exit process did not exit"
    Assert-True ($observedExitProbe.ExitCode -eq 37) "Pinned fast-exit process did not retain its exact exit code"
} finally {
    if ($observedExitProbe -and -not $observedExitProbe.HasExited) { $observedExitProbe.Kill() }
    if ($observedExitProbe) { $observedExitProbe.Dispose() }
    if ($exitProbe) { $exitProbe.Dispose() }
}

$trackedPolicy = Get-Content -LiteralPath $matrixPolicy -Raw | ConvertFrom-Json
$expectedMatrixEntries = @(
    "windows-10-22h2-home-x64|Core|19045.7548|x64",
    "windows-10-22h2-pro-x64|Professional|19045.7548|x64",
    "windows-11-25h2-home-x64|Core|26200.8973|x64",
    "windows-11-25h2-pro-x64|Professional|26200.8973|x64"
)
$actualMatrixEntries = @($trackedPolicy.entries | ForEach-Object {
    "$($_.id)|$($_.editionId)|$($_.build)|$($_.architecture)"
} | Sort-Object)
Assert-True ($actualMatrixEntries.Count -eq $expectedMatrixEntries.Count) "Tracked Windows matrix policy is incomplete"
Assert-True ((@($actualMatrixEntries) -join "`n") -ceq (@($expectedMatrixEntries | Sort-Object) -join "`n")) "Tracked Windows matrix policy entries changed"

$expectedFixtureHash = "95eb66a5ec9aec4e095b138528892f0aa1414cd8c6fe5b045d4cf9ae8411c81f"
$fixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True ($fixtureHash -eq $expectedFixtureHash) "Synthetic compile-only fixture bytes are not approved"

$root = Join-Path ([IO.Path]::GetTempPath()) ("ecd-clean-kit-contract-" + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $artifactRoot = Join-Path $root "artifact"
    New-Item -ItemType Directory -Path $artifactRoot | Out-Null
    $application = Join-Path $artifactRoot "esp-config-designer-desktop.exe"
    $installer = Join-Path $artifactRoot "ESPConfig Designer_1.4.0_x64-setup.exe"
    Add-Type -TypeDefinition 'public static class SyntheticCleanMachineApplication { public static void Main() { string marker = System.Environment.GetEnvironmentVariable("ECD_CONTRACT_LAUNCH_SENTINEL"); if (!string.IsNullOrEmpty(marker)) System.IO.File.AppendAllText(marker, "launched\n"); } }' `
        -OutputAssembly $application -OutputType ConsoleApplication
    Copy-Item -LiteralPath $application -Destination $installer
    $applicationHash = (Get-FileHash -LiteralPath $application -Algorithm SHA256).Hash.ToLowerInvariant()
    $installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceSha = "0123456789abcdef0123456789abcdef01234567"
    foreach ($name in @("inventory.json", "THIRD-PARTY-NOTICES.md")) {
        [IO.File]::WriteAllText((Join-Path $artifactRoot $name), "synthetic`n", (New-Object Text.UTF8Encoding($false)))
    }
    $provenancePath = Join-Path $artifactRoot "provenance.json"
    Write-JsonFile $provenancePath ([ordered]@{
        schemaVersion = 1
        kind = "ecd-windows-unsigned-technical-candidate"
        status = "unsigned technical candidate - not for users"
        product = [ordered]@{ name = "ESPConfig Designer"; version = "1.4.0" }
        source = [ordered]@{ commit = $sourceSha; status = "clean" }
        build = [ordered]@{
            mode = "release"
            command = @("tauri", "build", "--bundles", "nsis")
            tools = [ordered]@{ node = "synthetic"; npm = "synthetic"; rustc = "synthetic"; cargo = "synthetic"; tauri = "synthetic" }
        }
        runtime = [ordered]@{ identity = "runtime:1:synthetic"; manifestSha256 = ("c" * 64); payloadSha256 = ("d" * 64) }
        resources = [ordered]@{ identity = "ecd-tauri-resource-layout:1"; layoutSha256 = ("e" * 64); payloadSha256 = ("f" * 64) }
        supplyChain = [ordered]@{
            inventorySha256 = (Get-FileHash -LiteralPath (Join-Path $artifactRoot "inventory.json") -Algorithm SHA256).Hash.ToLowerInvariant()
            noticesSha256 = (Get-FileHash -LiteralPath (Join-Path $artifactRoot "THIRD-PARTY-NOTICES.md") -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        reproducibility = "controlled inputs; byte-for-byte reproducibility is not claimed"
        signing = "none"
        publication = "none"
        artifacts = @(
            [ordered]@{ role = "application-exe"; file = [IO.Path]::GetFileName($application); sha256 = $applicationHash; signatureStatus = "NotSigned" },
            [ordered]@{ role = "nsis-installer"; file = [IO.Path]::GetFileName($installer); sha256 = $installerHash; signatureStatus = "NotSigned" }
        )
    })
    [IO.File]::WriteAllText((Join-Path $artifactRoot "UNSIGNED-NOT-FOR-USERS.txt"), "synthetic unsigned candidate`n", (New-Object Text.UTF8Encoding($false)))
    $sumFiles = @(
        $application, $installer, $provenancePath,
        (Join-Path $artifactRoot "inventory.json"),
        (Join-Path $artifactRoot "THIRD-PARTY-NOTICES.md"),
        (Join-Path $artifactRoot "UNSIGNED-NOT-FOR-USERS.txt")
    )
    $sums = @($sumFiles | ForEach-Object {
        "$((Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))"
    } | Sort-Object) -join "`n"
    [IO.File]::WriteAllText((Join-Path $artifactRoot "SHA256SUMS"), $sums + "`n", (New-Object Text.UTF8Encoding($false)))
    $artifactArchive = Join-Path $root "artifact.zip"
    [IO.File]::WriteAllBytes($artifactArchive, [byte[]](101..132))

    $unboundKit = Join-Path $root "kit-unbound"
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $unboundOutput = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass `
            -File $builder -OutputRoot $unboundKit -SourceSha $sourceSha 2>&1
        $unboundExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    Assert-True ($unboundExitCode -ne 0 -and ($unboundOutput -join "`n") -like "*SourceSha does not match*") "Production kit build accepted an unbound source SHA"
    Assert-True (-not (Test-Path -LiteralPath $unboundKit)) "Rejected production kit build created output"

    $kitOne = Join-Path $root "kit-one"
    $kitTwo = Join-Path $root "kit-two"
    foreach ($kitRoot in @($kitOne, $kitTwo)) {
        & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass `
            -File $builder -OutputRoot $kitRoot -SourceSha $sourceSha -ContractTest
        Assert-True ($LASTEXITCODE -eq 0) "Clean-machine kit build failed"
    }
    $zipOne = Join-Path $kitOne "ecd-clean-machine-kit.zip"
    $zipTwo = Join-Path $kitTwo "ecd-clean-machine-kit.zip"
    $testKitHash = (Get-FileHash -LiteralPath $zipOne -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-True ($testKitHash -eq (Get-FileHash -LiteralPath $zipTwo -Algorithm SHA256).Hash.ToLowerInvariant()) "Kit archive is not deterministic"
    foreach ($kitRoot in @($kitOne, $kitTwo)) {
        $manifest = Get-Content -LiteralPath (Join-Path $kitRoot "kit-manifest.json") -Raw | ConvertFrom-Json
        Assert-True ($manifest.sourceCommit -eq $sourceSha -and $manifest.sourceStatus -eq "synthetic-contract-test" -and @($manifest.files).Count -eq 4) "Kit manifest identity is incomplete"
        Assert-True (Test-Path -LiteralPath (Join-Path $kitRoot "ecd-clean-machine-kit.zip.sha256") -PathType Leaf) "Kit archive hash sidecar is missing"
    }

    $registerPath = Join-Path $root "artifact-register.json"
    $register = [ordered]@{
        schemaVersion = 1; kind = "ecd-windows-artifact-register"; productVersion = "1.4.0"
        candidateKind = "ecd-windows-unsigned-technical-candidate"; candidateStatus = "unsigned technical candidate - not for users"
        sourceCommit = $sourceSha
        artifact = [ordered]@{ id = "synthetic"; name = "synthetic-candidate"; archiveDigest = ("sha256:" + (Get-FileHash -LiteralPath $artifactArchive -Algorithm SHA256).Hash.ToLowerInvariant()) }
        sha256SumsSha256 = (Get-FileHash -LiteralPath (Join-Path $artifactRoot "SHA256SUMS") -Algorithm SHA256).Hash.ToLowerInvariant()
        provenanceSha256 = (Get-FileHash -LiteralPath $provenancePath -Algorithm SHA256).Hash.ToLowerInvariant()
        installer = [ordered]@{ file = [IO.Path]::GetFileName($installer); sha256 = $installerHash; authenticodeStatus = "NotSigned" }
        application = [ordered]@{ file = [IO.Path]::GetFileName($application); sha256 = $applicationHash; authenticodeStatus = "NotSigned" }
        runtimeIdentity = "runtime:1:synthetic"; resourceIdentity = "ecd-tauri-resource-layout:1"
        runtimeManifestSha256 = ("c" * 64); runtimePayloadSha256 = ("d" * 64); resourceLayoutSha256 = ("e" * 64); resourcePayloadSha256 = ("f" * 64)
        inventorySha256 = (Get-FileHash -LiteralPath (Join-Path $artifactRoot "inventory.json") -Algorithm SHA256).Hash.ToLowerInvariant()
        noticesSha256 = (Get-FileHash -LiteralPath (Join-Path $artifactRoot "THIRD-PARTY-NOTICES.md") -Algorithm SHA256).Hash.ToLowerInvariant()
        fixtureSha256 = $fixtureHash; testKitSourceSha = $sourceSha; testKitSha256 = $testKitHash
    }
    Write-JsonFile $registerPath $register

    $os = Get-CimInstance Win32_OperatingSystem
    $editionId = [string](Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").EditionID
    $testMatrixPath = Join-Path $root "matrix-policy.json"
    Write-JsonFile $testMatrixPath ([ordered]@{
        schemaVersion = 1; kind = "ecd-windows-matrix-policy"; productVersion = "1.4.0"
        entries = @([ordered]@{ id = "contract-host"; editionId = $editionId; build = "$($os.BuildNumber).$((Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").UBR)"; architecture = "x64" })
    })
    $registerHash = (Get-FileHash -LiteralPath $registerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $matrixHash = (Get-FileHash -LiteralPath $testMatrixPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $common = @(
        "-ArtifactRoot", $artifactRoot, "-ArtifactArchive", $artifactArchive, "-Installer", $installer,
        "-ExpectedSourceSha", $sourceSha, "-ExpectedInstallerSha256", $installerHash, "-ExpectedApplicationSha256", $applicationHash,
        "-ArtifactRegister", $registerPath, "-ExpectedArtifactRegisterSha256", $registerHash,
        "-MatrixPolicy", $testMatrixPath, "-ExpectedMatrixPolicySha256", $matrixHash,
        "-TestKitRoot", (Join-Path $kitOne "kit"), "-TestKitArchive", $zipOne,
        "-Scenario", "Preflight", "-ContractTest"
    )

    function New-PassingContractGate([string]$Label) {
        $gate = Join-Path $root ("gate-lifecycle-" + $Label)
        $receipt = Join-Path $gate "preflight-receipt.json"
        Invoke-Gate ($common + @("-GateRoot", $gate, "-ReportPath", $receipt)) $true
        return $gate
    }

    function Get-LifecycleArguments(
        [string]$Gate,
        [string]$Label,
        [string]$InstallRoot = "",
        [string]$WorkspaceRoot = "",
        [string]$AppDataRoot = ""
    ) {
        if (-not $InstallRoot) { $InstallRoot = Join-Path $root ("install-" + $Label) }
        if (-not $WorkspaceRoot) { $WorkspaceRoot = Join-Path $root ("profile-" + $Label + "\Documents\ecd_workspace") }
        if (-not $AppDataRoot) { $AppDataRoot = Join-Path $root ("appdata-" + $Label) }
        foreach ($ownedRoot in @($InstallRoot, $WorkspaceRoot, $AppDataRoot)) {
            $parent = Split-Path -Parent $ownedRoot
            if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        }
        $arguments = @($common)
        $arguments[[Array]::IndexOf($arguments, "-Scenario") + 1] = "Lifecycle"
        return @($arguments + @(
            "-GateRoot", $Gate, "-ReportPath", (Join-Path $Gate "lifecycle.json"),
            "-LifecycleInstallRoot", $InstallRoot,
            "-LifecycleWorkspaceRoot", $WorkspaceRoot,
            "-LifecycleAppDataRoot", $AppDataRoot
        ))
    }

    function Get-StartupArguments(
        [string]$Gate,
        [string]$Label,
        [string]$InstallRoot = "",
        [string]$WorkspaceRoot = "",
        [string]$AppDataRoot = ""
    ) {
        $installRoot = if ($InstallRoot) { $InstallRoot } else { Join-Path $root ("startup-install-" + $Label) }
        $workspaceRoot = if ($WorkspaceRoot) { $WorkspaceRoot } else { Join-Path $root ("startup-workspace-" + $Label) }
        $appDataRoot = if ($AppDataRoot) { $AppDataRoot } else { Join-Path $root ("startup-appdata-" + $Label) }
        foreach ($ownedRoot in @($installRoot, $workspaceRoot, $appDataRoot)) {
            $parent = Split-Path -Parent $ownedRoot
            if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        }
        $arguments = @($common)
        $arguments[[Array]::IndexOf($arguments, "-Scenario") + 1] = "Startup"
        return @($arguments + @(
            "-GateRoot", $Gate, "-ReportPath", (Join-Path $Gate "startup.json"),
            "-StartupInstallRoot", $installRoot,
            "-StartupWorkspaceRoot", $workspaceRoot,
            "-StartupAppDataRoot", $appDataRoot
        ))
    }

    function Set-ConsistentCheckpointBytes([string]$Gate, [byte[]]$Bytes) {
        $checkpointPath = Join-Path $Gate "lifecycle-reboot-checkpoint.json"
        [IO.File]::WriteAllBytes($checkpointPath, $Bytes)
        $statePath = Join-Path $Gate "lifecycle-owned-resources.json"
        $state = [IO.File]::ReadAllText($statePath, (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
        $state.checkpointSha256 = (Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-JsonFile $statePath $state
        $ownerPath = Join-Path $Gate ".ecd-clean-machine-owner.json"
        $owner = [IO.File]::ReadAllText($ownerPath, (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
        $owner.lifecycleStateSha256 = (Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-JsonFile $ownerPath $owner
    }

    $passGate = Join-Path $root "gate-pass"
    $passReport = Join-Path $passGate "preflight-receipt.json"
    Invoke-Gate ($common + @("-GateRoot", $passGate, "-ReportPath", $passReport)) $true
    $report = Get-Content -LiteralPath $passReport -Raw | ConvertFrom-Json
    Assert-True ($report.schemaVersion -eq 1 -and $report.result -eq "pass" -and $report.evidenceClass -eq "contract_test" -and @($report.checks).Count -gt 0) "Preflight report contract is invalid"

    $startupGate = New-PassingContractGate "startup-pass"
    $startupArguments = Get-StartupArguments $startupGate "pass"
    $contractLaunchSentinel = Join-Path $root "contract-process-launched.txt"
    $previousLaunchSentinel = [Environment]::GetEnvironmentVariable("ECD_CONTRACT_LAUNCH_SENTINEL", [EnvironmentVariableTarget]::Process)
    try {
        [Environment]::SetEnvironmentVariable("ECD_CONTRACT_LAUNCH_SENTINEL", $contractLaunchSentinel, [EnvironmentVariableTarget]::Process)
        Invoke-Gate $startupArguments $true
    } finally {
        [Environment]::SetEnvironmentVariable("ECD_CONTRACT_LAUNCH_SENTINEL", $previousLaunchSentinel, [EnvironmentVariableTarget]::Process)
    }
    Assert-True (-not (Test-Path -LiteralPath $contractLaunchSentinel)) "Contract-test Startup launched a synthetic executable or installer"
    $startupReportPath = Join-Path $startupGate "startup.json"
    $startupReport = Get-Content -LiteralPath $startupReportPath -Raw | ConvertFrom-Json
    $requiredStartupChecks = @(
        "artifact_identity", "preflight_receipt", "clean_vm_attestation", "root_ownership", "isolated_roots",
        "installed_application_hash", "installed_resources", "natural_cold_burst", "widened_startup_guard",
        "no_early_writes", "single_primary_backend_listener", "secondary_exit_zero", "manual_window_restore",
        "foreign_listener_8099", "forced_primary_job_cleanup", "abandoned_guard_takeover",
        "interrupted_job_reconciliation", "graceful_close", "startup_guard_timeout", "final_cleanup"
    )
    Assert-True ($startupReport.result -eq "pass" -and $startupReport.evidenceClass -eq "contract_test") "Synthetic Startup did not produce a contract-test PASS"
    Assert-True ($startupReport.cleanVmAttestationSha256 -eq "contract_test" -and $startupReport.hostRunNonce -eq "contract_test") "Contract-test Startup attestation fields are invalid"
    Assert-True (@($startupReport.checks).Count -eq $requiredStartupChecks.Count) "Synthetic Startup report check count is invalid"
    Assert-True (@($startupReport.acceptedWarnings).Count -eq 0) "Synthetic Startup PASS unexpectedly contains an accepted warning"
    Assert-True ($startupReport.outcome -eq "pass" -and $startupReport.blockingChecksPassed -eq 20 -and $startupReport.blockingChecksTotal -eq 20) "Synthetic Startup blocking-result summary is invalid"
    foreach ($requiredCheck in $requiredStartupChecks) {
        Assert-True (@($startupReport.checks | Where-Object { $_.name -eq $requiredCheck -and $_.status -eq "pass" }).Count -eq 1) "Synthetic Startup report is missing required check: $requiredCheck"
    }
    Assert-True (@($startupReport.checks | Where-Object { -not ([string]$_.summary).StartsWith("Contract simulation") }).Count -eq 0) "Contract-test Startup checks overclaim production execution"
    $startupReportArguments = @($common)
    $startupReportArguments[[Array]::IndexOf($startupReportArguments, "-Scenario") + 1] = "Report"
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $startupReportPath, "-ExpectedReportScenario", "Startup")) $true

    $startupStatePath = Join-Path $startupGate "startup-owned-resources.json"
    $startupOwnerPath = Join-Path $startupGate ".ecd-clean-machine-owner.json"
    $startupStateBytes = [IO.File]::ReadAllBytes($startupStatePath)
    $startupOwnerBytes = [IO.File]::ReadAllBytes($startupOwnerPath)

    $acceptedWarningReport = Get-Content -LiteralPath $startupReportPath -Raw | ConvertFrom-Json
    $acceptedWarningReport.acceptedWarnings = @([pscustomobject]@{
        name = "automatic_warm_restore_focus"
        status = "accepted_warning"
        reasonCode = "windows_minimized_activation_not_observed"
        summary = "Automatic restore/focus was not observed; manual taskbar restore passed"
    })
    $acceptedWarningReport.outcome = "pass_with_accepted_warning"
    $acceptedWarningReportPath = Join-Path $startupGate "startup-accepted-warning.json"
    Write-JsonFile $acceptedWarningReportPath $acceptedWarningReport
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $acceptedWarningReportPath, "-ExpectedReportScenario", "Startup")) $false "Startup report does not match"

    $warningStartupState = Get-Content -LiteralPath $startupStatePath -Raw | ConvertFrom-Json
    $warningStartupState.automaticWarmRestoreObserved = $false
    Write-JsonFile $startupStatePath $warningStartupState
    $warningStartupOwner = Get-Content -LiteralPath $startupOwnerPath -Raw | ConvertFrom-Json
    $warningStartupOwner.startupStateSha256 = (Get-FileHash -LiteralPath $startupStatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-JsonFile $startupOwnerPath $warningStartupOwner
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $acceptedWarningReportPath, "-ExpectedReportScenario", "Startup")) $true

    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $startupReportPath, "-ExpectedReportScenario", "Startup")) $false "Startup report does not match"

    $invalidWarningReport = Get-Content -LiteralPath $acceptedWarningReportPath -Raw | ConvertFrom-Json
    $invalidWarningReport.acceptedWarnings[0].name = "duplicate_backend"
    $invalidWarningReportPath = Join-Path $startupGate "startup-invalid-warning.json"
    Write-JsonFile $invalidWarningReportPath $invalidWarningReport
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $invalidWarningReportPath, "-ExpectedReportScenario", "Startup")) $false "accepted warning contract"

    [IO.File]::WriteAllBytes($startupStatePath, $startupStateBytes)
    [IO.File]::WriteAllBytes($startupOwnerPath, $startupOwnerBytes)

    $missingStartupCheck = Get-Content -LiteralPath $startupReportPath -Raw | ConvertFrom-Json
    $missingStartupCheck.checks = @($missingStartupCheck.checks | Where-Object { $_.name -ne "abandoned_guard_takeover" })
    $missingStartupCheckPath = Join-Path $startupGate "startup-missing-check.json"
    Write-JsonFile $missingStartupCheckPath $missingStartupCheck
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $missingStartupCheckPath, "-ExpectedReportScenario", "Startup")) $false "required check"

    $tamperedStartupState = Get-Content -LiteralPath $startupStatePath -Raw | ConvertFrom-Json
    $tamperedStartupState.state = "active"
    Write-JsonFile $startupStatePath $tamperedStartupState
    $tamperedStartupOwner = Get-Content -LiteralPath $startupOwnerPath -Raw | ConvertFrom-Json
    $tamperedStartupOwner.startupStateSha256 = (Get-FileHash -LiteralPath $startupStatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-JsonFile $startupOwnerPath $tamperedStartupOwner
    Invoke-Gate ($startupReportArguments + @("-GateRoot", $startupGate, "-ReportPath", $startupReportPath, "-ExpectedReportScenario", "Startup")) $false "completed bound startup state"
    [IO.File]::WriteAllBytes($startupStatePath, $startupStateBytes)
    [IO.File]::WriteAllBytes($startupOwnerPath, $startupOwnerBytes)

    $unownedStartupGate = New-PassingContractGate "startup-unowned"
    $unownedStartupInstall = Join-Path $root "existing-unowned-startup-install"
    New-Item -ItemType Directory -Path $unownedStartupInstall | Out-Null
    $unownedStartupSentinel = Join-Path $unownedStartupInstall "sentinel.txt"
    [IO.File]::WriteAllText($unownedStartupSentinel, "must survive")
    $unownedStartupArguments = Get-StartupArguments $unownedStartupGate "unowned" $unownedStartupInstall
    Invoke-Gate $unownedStartupArguments $false "new, absent owned roots"
    Assert-True (Test-Path -LiteralPath $unownedStartupSentinel -PathType Leaf) "Startup modified an existing unowned install root"

    $badHashArguments = @($common)
    $badHashArguments[[Array]::IndexOf($badHashArguments, "-ExpectedInstallerSha256") + 1] = ("0" * 64)
    $badHashGate = Join-Path $root "gate-bad-hash"
    Invoke-Gate ($badHashArguments + @("-GateRoot", $badHashGate, "-ReportPath", (Join-Path $badHashGate "preflight-receipt.json"))) $false "hash"

    $badRegisterArguments = @($common)
    $badRegisterArguments[[Array]::IndexOf($badRegisterArguments, "-ExpectedArtifactRegisterSha256") + 1] = ("0" * 64)
    $badRegisterGate = Join-Path $root "gate-bad-register"
    Invoke-Gate ($badRegisterArguments + @("-GateRoot", $badRegisterGate, "-ReportPath", (Join-Path $badRegisterGate "preflight-receipt.json"))) $false "artifact register SHA-256"

    $badMatrixArguments = @($common)
    $badMatrixArguments[[Array]::IndexOf($badMatrixArguments, "-ExpectedMatrixPolicySha256") + 1] = ("0" * 64)
    $badMatrixGate = Join-Path $root "gate-bad-matrix"
    Invoke-Gate ($badMatrixArguments + @("-GateRoot", $badMatrixGate, "-ReportPath", (Join-Path $badMatrixGate "preflight-receipt.json"))) $false "matrix policy SHA-256"

    $changedKitArchive = Join-Path $root "changed-kit.zip"
    Copy-Item -LiteralPath $zipOne -Destination $changedKitArchive
    [IO.File]::AppendAllText($changedKitArchive, "changed")
    $badKitArguments = @($common)
    $badKitArguments[[Array]::IndexOf($badKitArguments, "-TestKitArchive") + 1] = $changedKitArchive
    $badKitGate = Join-Path $root "gate-bad-kit"
    Invoke-Gate ($badKitArguments + @("-GateRoot", $badKitGate, "-ReportPath", (Join-Path $badKitGate "preflight-receipt.json"))) $false "test-kit archive"

    $detachedKit = Join-Path $root "detached-kit"
    Copy-Item -LiteralPath (Join-Path $kitOne "kit") -Destination $detachedKit -Recurse
    [IO.File]::AppendAllText((Join-Path $detachedKit "artifact-integrity.ps1"), "# changed`n")
    $detachedKitArguments = @($common)
    $detachedKitArguments[[Array]::IndexOf($detachedKitArguments, "-TestKitRoot") + 1] = $detachedKit
    $detachedKitGate = Join-Path $root "gate-detached-kit"
    Invoke-Gate ($detachedKitArguments + @("-GateRoot", $detachedKitGate, "-ReportPath", (Join-Path $detachedKitGate "preflight-receipt.json"))) $false "Test-kit file length mismatch: artifact-integrity.ps1"

    $extraInstaller = Join-Path $artifactRoot "stale-setup.exe"
    [IO.File]::WriteAllBytes($extraInstaller, [byte[]](65..80))
    $multipleGate = Join-Path $root "gate-multiple"
    Invoke-Gate ($common + @("-GateRoot", $multipleGate, "-ReportPath", (Join-Path $multipleGate "preflight-receipt.json"))) $false "exactly one"
    Remove-Item -LiteralPath $extraInstaller -Force

    $unownedGate = Join-Path $root "gate-unowned"
    New-Item -ItemType Directory -Path $unownedGate | Out-Null
    [IO.File]::WriteAllText((Join-Path $unownedGate "sentinel.txt"), "must survive")
    Invoke-Gate ($common + @("-GateRoot", $unownedGate, "-ReportPath", (Join-Path $unownedGate "preflight-receipt.json"))) $false "ownership"
    Assert-True (Test-Path -LiteralPath (Join-Path $unownedGate "sentinel.txt") -PathType Leaf) "Unowned root was modified"

    $overlapGate = Join-Path $artifactRoot "overlap"
    Invoke-Gate ($common + @("-GateRoot", $overlapGate, "-ReportPath", (Join-Path $overlapGate "preflight-receipt.json"))) $false "overlap"

    $validProvenance = [IO.File]::ReadAllBytes($provenancePath)
    $validRegister = [IO.File]::ReadAllBytes($registerPath)
    [IO.File]::WriteAllText($provenancePath, "{malformed")
    $register.provenanceSha256 = (Get-FileHash -LiteralPath $provenancePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-JsonFile $registerPath $register
    $malformedArguments = @($common)
    $malformedArguments[[Array]::IndexOf($malformedArguments, "-ExpectedArtifactRegisterSha256") + 1] = (Get-FileHash -LiteralPath $registerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $malformedGate = Join-Path $root "gate-malformed"
    Invoke-Gate ($malformedArguments + @("-GateRoot", $malformedGate, "-ReportPath", (Join-Path $malformedGate "preflight-receipt.json"))) $false "Artifact provenance is malformed JSON"
    [IO.File]::WriteAllBytes($provenancePath, $validProvenance)
    [IO.File]::WriteAllBytes($registerPath, $validRegister)

    $invalidReportPath = Join-Path $passGate "invalid-pass-report.json"
    $invalidReport = Get-Content -LiteralPath $passReport -Raw | ConvertFrom-Json
    $invalidReport.checks = @($invalidReport.checks | Where-Object { $_.name -ne "hashes" })
    Write-JsonFile $invalidReportPath $invalidReport
    $reportArguments = @($common)
    $reportArguments[[Array]::IndexOf($reportArguments, "-Scenario") + 1] = "Report"
    Invoke-Gate ($reportArguments + @("-GateRoot", $passGate, "-ReportPath", $invalidReportPath, "-ExpectedReportScenario", "Preflight")) $false "required check"

    $failedReceiptGate = Join-Path $root "gate-failed-receipt"
    $failedReceiptPath = Join-Path $failedReceiptGate "preflight-receipt.json"
    Invoke-Gate ($common + @("-GateRoot", $failedReceiptGate, "-ReportPath", $failedReceiptPath)) $true
    $failedReceipt = Get-Content -LiteralPath $failedReceiptPath -Raw | ConvertFrom-Json
    $failedReceipt.result = "fail"
    ($failedReceipt.checks | Where-Object { $_.name -eq "hashes" }).status = "fail"
    Write-JsonFile $failedReceiptPath $failedReceipt
    $lifecycleArguments = @($common)
    $lifecycleArguments[[Array]::IndexOf($lifecycleArguments, "-Scenario") + 1] = "Lifecycle"
    Invoke-Gate ($lifecycleArguments + @("-GateRoot", $failedReceiptGate, "-ReportPath", (Join-Path $failedReceiptGate "lifecycle.json"))) $false "passing Preflight receipt"

    $lifecycleInstallRoot = Join-Path $root "lifecycle-install"
    $lifecycleWorkspaceRoot = Join-Path $root "lifecycle workspace"
    $lifecycleAppDataRoot = Join-Path $root "lifecycle appdata"
    $lifecycleReport = Join-Path $passGate "lifecycle.json"
    $lifecycleCommon = @($lifecycleArguments + @(
        "-GateRoot", $passGate, "-ReportPath", $lifecycleReport,
        "-LifecycleInstallRoot", $lifecycleInstallRoot,
        "-LifecycleWorkspaceRoot", $lifecycleWorkspaceRoot,
        "-LifecycleAppDataRoot", $lifecycleAppDataRoot
    ))

    foreach ($expectedHashName in @("-ExpectedInstallerSha256", "-ExpectedApplicationSha256")) {
        $badBeginHashArguments = @($lifecycleCommon)
        $badBeginHashArguments[[Array]::IndexOf($badBeginHashArguments, $expectedHashName) + 1] = ("0" * 64)
        Invoke-Gate ($badBeginHashArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "bad-begin-hash")) $false "Expected hash does not match the artifact register"
    }
    Invoke-Gate ($lifecycleCommon + @("-LifecycleStage", "Begin", "-ContractBootId", "contract-boot-before")) $true
    Assert-True (-not (Test-Path -LiteralPath $lifecycleReport)) "Lifecycle begin wrote a final report before a real reboot boundary"
    Assert-True (Test-Path -LiteralPath (Join-Path $passGate "lifecycle-reboot-checkpoint.json") -PathType Leaf) "Lifecycle begin did not persist its reboot checkpoint"
    Invoke-Gate ($lifecycleCommon + @("-LifecycleStage", "Resume", "-ContractBootId", "contract-boot-after")) $true
    $lifecycleResult = Get-Content -LiteralPath $lifecycleReport -Raw | ConvertFrom-Json
    Assert-True ($lifecycleResult.result -eq "pass" -and $lifecycleResult.evidenceClass -eq "contract_test") "Synthetic Lifecycle did not produce a contract-test PASS"
    Assert-True (@($lifecycleResult.checks | Where-Object { -not ([string]$_.summary).StartsWith("Contract simulation") }).Count -eq 0) "Contract-test Lifecycle checks overclaim production execution"
    Invoke-Gate ($reportArguments + @("-GateRoot", $passGate, "-ReportPath", $lifecycleReport, "-ExpectedReportScenario", "Lifecycle")) $true

    $replayedArguments = @($lifecycleCommon + @("-LifecycleStage", "Resume", "-ContractBootId", "contract-boot-third"))
    Invoke-Gate $replayedArguments $false "stale, replayed"

    $missingLifecycleCheck = Get-Content -LiteralPath $lifecycleReport -Raw | ConvertFrom-Json
    $missingLifecycleCheck.checks = @($missingLifecycleCheck.checks | Where-Object { $_.name -ne "reboot_resume" })
    $missingLifecycleCheckPath = Join-Path $passGate "lifecycle-missing-check.json"
    Write-JsonFile $missingLifecycleCheckPath $missingLifecycleCheck
    Invoke-Gate ($reportArguments + @("-GateRoot", $passGate, "-ReportPath", $missingLifecycleCheckPath, "-ExpectedReportScenario", "Lifecycle")) $false "required check"
    $missingAttestationReport = Get-Content -LiteralPath $lifecycleReport -Raw | ConvertFrom-Json
    $missingAttestationReport.PSObject.Properties.Remove("cleanVmAttestationSha256")
    $missingAttestationPath = Join-Path $passGate "lifecycle-missing-attestation.json"
    Write-JsonFile $missingAttestationPath $missingAttestationReport
    Invoke-Gate ($reportArguments + @("-GateRoot", $passGate, "-ReportPath", $missingAttestationPath, "-ExpectedReportScenario", "Lifecycle")) $false "missing required field"

    $ownershipGate = New-PassingContractGate "ownership"
    $ownershipArguments = Get-LifecycleArguments $ownershipGate "ownership"
    $ownershipMarkerPath = Join-Path $ownershipGate ".ecd-clean-machine-owner.json"
    $ownershipMarkerBytes = [IO.File]::ReadAllBytes($ownershipMarkerPath)
    $ownershipMarker = Get-Content -LiteralPath $ownershipMarkerPath -Raw | ConvertFrom-Json
    $ownershipMarker.runId = "f" * 32
    Write-JsonFile $ownershipMarkerPath $ownershipMarker
    Invoke-Gate ($ownershipArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "ownership-before")) $false "ownership identity is invalid"
    [IO.File]::WriteAllBytes($ownershipMarkerPath, $ownershipMarkerBytes)

    foreach ($overlap in @(
        [ordered]@{ label = "artifact"; install = $artifactRoot; workspace = ""; appdata = "" },
        [ordered]@{ label = "metadata"; install = (Join-Path $ownershipGate "install"); workspace = ""; appdata = "" },
        [ordered]@{ label = "workspace"; install = (Join-Path $root "overlap-workspace"); workspace = (Join-Path $root "overlap-workspace\nested"); appdata = "" },
        [ordered]@{ label = "appdata"; install = (Join-Path $root "overlap-appdata"); workspace = ""; appdata = (Join-Path $root "overlap-appdata\nested") }
    )) {
        $overlapArguments = Get-LifecycleArguments $ownershipGate ("overlap-" + $overlap.label) $overlap.install $overlap.workspace $overlap.appdata
        Invoke-Gate ($overlapArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "overlap-before")) $false "overlap"
    }

    $unownedGate = New-PassingContractGate "unowned-install"
    $unownedInstall = Join-Path $root "existing-unowned-install"
    New-Item -ItemType Directory -Path $unownedInstall | Out-Null
    $unownedSentinel = Join-Path $unownedInstall "sentinel.txt"
    [IO.File]::WriteAllText($unownedSentinel, "must survive")
    $unownedArguments = Get-LifecycleArguments $unownedGate "unowned-install" $unownedInstall
    Invoke-Gate ($unownedArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "unowned-before")) $false "new, absent owned roots"
    Assert-True (Test-Path -LiteralPath $unownedSentinel -PathType Leaf) "Lifecycle modified an existing unowned install root"

    $missingParentGate = New-PassingContractGate "missing-parent"
    $missingParentArguments = Get-LifecycleArguments $missingParentGate "missing-parent"
    $missingParentWorkspace = $missingParentArguments[[Array]::IndexOf($missingParentArguments, "-LifecycleWorkspaceRoot") + 1]
    $missingParentProfile = Split-Path -Parent (Split-Path -Parent $missingParentWorkspace)
    Remove-Item -LiteralPath $missingParentProfile -Recurse -Force
    Invoke-Gate ($missingParentArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "missing-parent-before")) $false "Lifecycle root parent must already exist"
    Assert-True (-not (Test-Path -LiteralPath $missingParentProfile)) "Lifecycle created an unowned parent directory"

    $rootRaceGate = New-PassingContractGate "root-race"
    $rootRaceArguments = Get-LifecycleArguments $rootRaceGate "root-race"
    Invoke-Gate ($rootRaceArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "root-race-before", "-ContractLifecycleFault", "RootCreatedAfterAbsentCheck")) $false "Could not claim new Lifecycle root"
    Assert-True (Test-Path -LiteralPath (Join-Path $root "appdata-root-race\sentinel.txt") -PathType Leaf) "Lifecycle cleanup removed a root it did not create"

    $unicodeOwnedGate = New-PassingContractGate "unowned-unicode"
    $unicodeOwnedArguments = Get-LifecycleArguments $unicodeOwnedGate "unowned-unicode"
    $unicodeOwner = Get-Content -LiteralPath (Join-Path $unicodeOwnedGate ".ecd-clean-machine-owner.json") -Raw | ConvertFrom-Json
    $unicodeOwnedAppData = Join-Path $root "ECD App Data spaces zolc-$([char]0x017C)$([char]0x00F3)$([char]0x0142)$([char]0x0107)-$($unicodeOwner.runId)"
    New-Item -ItemType Directory -Path $unicodeOwnedAppData | Out-Null
    $unicodeSentinel = Join-Path $unicodeOwnedAppData "sentinel.txt"
    [IO.File]::WriteAllText($unicodeSentinel, "must survive")
    Invoke-Gate ($unicodeOwnedArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "unicode-owned-before")) $false "new, absent owned roots"
    Assert-True (Test-Path -LiteralPath $unicodeSentinel -PathType Leaf) "Lifecycle treated a pre-existing Unicode root as owned"

    $staleGate = New-PassingContractGate "stale-installer"
    $staleArguments = Get-LifecycleArguments $staleGate "stale-installer"
    $staleInstaller = Join-Path $artifactRoot "stale-setup.exe"
    [IO.File]::WriteAllBytes($staleInstaller, [byte[]](1..16))
    Invoke-Gate ($staleArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "stale-before")) $false "candidate file set"
    Remove-Item -LiteralPath $staleInstaller -Force

    foreach ($fault in @("ApplicationHashMismatch", "MutableInstallWrite", "ForcedCleanupOnly")) {
        $faultGate = New-PassingContractGate ("begin-" + $fault.ToLowerInvariant())
        $faultArguments = Get-LifecycleArguments $faultGate ("begin-" + $fault.ToLowerInvariant())
        $expectedFault = switch ($fault) {
            "ApplicationHashMismatch" { "installed application SHA-256 mismatch" }
            "MutableInstallWrite" { "Immutable install tree changed" }
            "ForcedCleanupOnly" { "Forced cleanup cannot satisfy graceful close" }
        }
        Invoke-Gate ($faultArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "fault-before", "-ContractLifecycleFault", $fault)) $false $expectedFault
    }


    $directoryWriteGate = New-PassingContractGate "directory-write"
    $directoryWriteArguments = Get-LifecycleArguments $directoryWriteGate "directory-write"
    Invoke-Gate ($directoryWriteArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "directory-write-before", "-ContractLifecycleFault", "MutableInstallDirectoryWrite")) $false "Immutable install tree changed"

    foreach ($faultCase in @(
        [ordered]@{ fault = "UninstallLeavesInstall"; error = "Uninstall did not remove" },
        [ordered]@{ fault = "UninstallDeletesWorkspace"; error = "Tree root is missing" },
        [ordered]@{ fault = "UninstallDeletesAppData"; error = "Tree root is missing" },
        [ordered]@{ fault = "UninstallCorruptsRetainedData"; error = "Workspace tree during uninstall changed" },
        [ordered]@{ fault = "ReinstallLosesMarkers"; error = "App-data tree during reinstall" },
        [ordered]@{ fault = "UninstallRemovesEmptyWorkspaceDirectory"; error = "Workspace tree during uninstall changed" },
        [ordered]@{ fault = "UnicodeRootCreatedBeforeClaim"; error = "Could not claim new Lifecycle root" }
    )) {
        $faultLabel = "resume-" + $faultCase.fault.ToLowerInvariant()
        $faultGate = New-PassingContractGate $faultLabel
        $faultArguments = Get-LifecycleArguments $faultGate $faultLabel
        Invoke-Gate ($faultArguments + @("-LifecycleStage", "Begin", "-ContractBootId", ($faultLabel + "-before"))) $true
        Invoke-Gate ($faultArguments + @("-LifecycleStage", "Resume", "-ContractBootId", ($faultLabel + "-after"), "-ContractLifecycleFault", $faultCase.fault)) $false $faultCase.error
        $failedState = [IO.File]::ReadAllText((Join-Path $faultGate "lifecycle-owned-resources.json"), (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
        Assert-True ($failedState.state -eq "failed_cleaned") "Failed Lifecycle run remained active after owned-root cleanup"
    }


    foreach ($expectedHashName in @("-ExpectedInstallerSha256", "-ExpectedApplicationSha256")) {
        $resumeHashGate = New-PassingContractGate ("resume-hash-" + $expectedHashName.TrimStart('-').ToLowerInvariant())
        $resumeHashArguments = Get-LifecycleArguments $resumeHashGate ("resume-hash-" + $expectedHashName.TrimStart('-').ToLowerInvariant())
        Invoke-Gate ($resumeHashArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "resume-hash-before")) $true
        $resumeHashArguments[[Array]::IndexOf($resumeHashArguments, $expectedHashName) + 1] = ("0" * 64)
        Invoke-Gate ($resumeHashArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "resume-hash-after")) $false "Expected hash does not match the artifact register"
    }

    $checkpointGate = New-PassingContractGate "checkpoint"
    $checkpointArguments = Get-LifecycleArguments $checkpointGate "checkpoint"
    Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "checkpoint-before")) $true
    $checkpointPath = Join-Path $checkpointGate "lifecycle-reboot-checkpoint.json"
    $checkpointBytes = [IO.File]::ReadAllBytes($checkpointPath)
    Remove-Item -LiteralPath $checkpointPath -Force
    Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "checkpoint-after")) $false "checkpoint is missing"
    Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytes
    Set-ConsistentCheckpointBytes $checkpointGate ((New-Object Text.UTF8Encoding($false)).GetBytes("{malformed"))
    Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "checkpoint-after")) $false "malformed JSON"
    Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytes
    $checkpoint = [IO.File]::ReadAllText($checkpointPath, (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
    $checkpoint.createdAtUtc = [DateTimeOffset]::UtcNow.AddDays(-8).ToString("o")
    $checkpointBytesChanged = (New-Object Text.UTF8Encoding($false)).GetBytes(($checkpoint | ConvertTo-Json -Depth 20) + "`n")
    Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytesChanged
    Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "checkpoint-after")) $false "stale, replayed"
    foreach ($binding in @("runId", "sourceCommit", "artifactRegisterSha256", "testKitSha256", "applicationSha256")) {
        Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytes
        $checkpoint = [IO.File]::ReadAllText($checkpointPath, (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
        $checkpoint.$binding = if ($binding -eq "runId") { "0" * 32 } elseif ($binding -eq "sourceCommit") { "0" * 40 } else { "0" * 64 }
        $checkpointBytesChanged = (New-Object Text.UTF8Encoding($false)).GetBytes(($checkpoint | ConvertTo-Json -Depth 20) + "`n")
        Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytesChanged
        Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "checkpoint-after")) $false "stale, replayed"
    }
    Set-ConsistentCheckpointBytes $checkpointGate $checkpointBytes
    Invoke-Gate ($checkpointArguments + @("-LifecycleStage", "Resume", "-ContractBootId", "checkpoint-before")) $false "requires a real system reboot"

    $cleanupSentinel = Join-Path $root "cleanup-unowned-sentinel.txt"
    [IO.File]::WriteAllText($cleanupSentinel, "must survive")
    $cleanupGate = New-PassingContractGate "cleanup-independent"
    $cleanupArguments = Get-LifecycleArguments $cleanupGate "cleanup-independent"
    Invoke-Gate ($cleanupArguments + @("-LifecycleStage", "Begin", "-ContractBootId", "cleanup-before", "-ContractLifecycleFault", "CleanupFirstResourceFailure")) $false "Synthetic first cleanup resource failed"
    Assert-True (Test-Path -LiteralPath $cleanupSentinel -PathType Leaf) "Lifecycle cleanup touched an unowned resource"
    Assert-True (Test-Path -LiteralPath (Join-Path $root "install-cleanup-independent") -PathType Container) "Synthetic first cleanup failure was not exercised"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $root "profile-cleanup-independent\Documents\ecd_workspace"))) "First cleanup failure blocked workspace cleanup"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $root "appdata-cleanup-independent"))) "First cleanup failure blocked app-data cleanup"

    Write-Host "clean-machine kit contract: PASS"
} finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
