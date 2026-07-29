param()

$ErrorActionPreference = "Stop"

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
}

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$windowsRoot = Join-Path $desktopRoot "platforms\windows"
$pythonManifestPath = Join-Path $windowsRoot "python-manifest.json"
$requirementsLockPath = Join-Path $windowsRoot "requirements-runtime.lock"
$inventoryPath = Join-Path $desktopRoot "supply-chain\inventory.json"
$noticesPath = Join-Path $desktopRoot "supply-chain\THIRD-PARTY-NOTICES.md"
$integrityScript = Join-Path $windowsRoot "artifact-integrity.ps1"

foreach ($requiredPath in @($pythonManifestPath, $requirementsLockPath, $inventoryPath, $noticesPath, $integrityScript)) {
    Assert-True (Test-Path -LiteralPath $requiredPath -PathType Leaf) "Supply-chain input is missing: $requiredPath"
}

$pythonManifest = Get-Content -LiteralPath $pythonManifestPath -Raw | ConvertFrom-Json
Assert-True ($pythonManifest.schemaVersion -eq 1) "Python artifact manifest schema version changed"
Assert-True ($pythonManifest.kind -eq "ecd-python-artifact") "Python artifact manifest kind is invalid"
Assert-True ($pythonManifest.product -eq "CPython NuGet x64") "Python artifact product is invalid"
Assert-True ($pythonManifest.version -eq "3.13.9") "Python artifact version changed"
Assert-True ($pythonManifest.architecture -eq "x64") "Python artifact architecture changed"
Assert-True ([string]$pythonManifest.source -eq "https://api.nuget.org/v3-flatcontainer/python/3.13.9/python.3.13.9.nupkg") "Python artifact source changed"
Assert-True ([string]$pythonManifest.sha256 -match "^[0-9a-f]{64}$") "Python artifact SHA-256 is invalid"
Assert-True ([string]$pythonManifest.upstreamSha512 -match "^[0-9a-f]{128}$") "Python upstream SHA-512 is invalid"

$lockLines = @(Get-Content -LiteralPath $requirementsLockPath | Where-Object { $_ -and -not $_.StartsWith("#") -and -not $_.StartsWith("--") -and -not $_.StartsWith(" ") })
Assert-True ($lockLines.Count -eq 98) "Python lock must contain the complete 98-package Windows graph"
foreach ($line in $lockLines) {
    Assert-True ($line -match "^[A-Za-z0-9_.-]+==[^ ;]+ \\$" ) "Python lock entry is not exactly pinned: $line"
}
$lockSource = Get-Content -LiteralPath $requirementsLockPath -Raw
Assert-True (($lockSource | Select-String -Pattern "--hash=sha256:[0-9a-f]{64}" -AllMatches).Matches.Count -eq 98) "Every Python lock entry must have exactly one SHA-256"
$lockHashes = @{}
$allLockLines = @(Get-Content -LiteralPath $requirementsLockPath)
for ($index = 0; $index -lt $allLockLines.Count; $index += 1) {
    if ($allLockLines[$index] -match "^([A-Za-z0-9_.-]+)==([^ ;]+) \\$" ) {
        $requirementLine = $allLockLines[$index]
        Assert-True ($index + 1 -lt $allLockLines.Count -and $allLockLines[$index + 1] -match "^\s+--hash=sha256:([0-9a-f]{64})$") "Python lock hash is missing after $($allLockLines[$index])"
        $lockHashes[$requirementLine] = $Matches[1]
    }
}
foreach ($directRequirement in @(
    "esphome==2026.6.4",
    "platformio==6.1.19",
    "flask==3.1.2",
    "pyserial==3.5",
    "setuptools==82.0.0",
    "wheel==0.47.0"
)) {
    Assert-True ($lockSource -match "(?im)^$([regex]::Escape($directRequirement)) \\$" ) "Direct Python requirement changed or is missing: $directRequirement"
}

. $integrityScript
$artifactRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-artifact-integrity-" + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $artifactRoot | Out-Null
    $artifactPath = Join-Path $artifactRoot "artifact.bin"
    [System.IO.File]::WriteAllBytes($artifactPath, [byte[]](0..31))
    $expectedHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-ArtifactHash -Path $artifactPath -Algorithm "SHA256" -ExpectedHash $expectedHash -Name "test artifact"

    $mismatchRejected = $false
    try {
        Assert-ArtifactHash -Path $artifactPath -Algorithm "SHA256" -ExpectedHash ("0" * 64) -Name "test artifact"
    } catch {
        $mismatchRejected = $_.Exception.Message -like "*SHA-256 mismatch*"
    }
    Assert-True $mismatchRejected "Changed artifact was not rejected"

    $invalidManifestHashRejected = $false
    try {
        Assert-ArtifactHash -Path $artifactPath -Algorithm "SHA256" -ExpectedHash "not-a-digest" -Name "test artifact"
    } catch {
        $invalidManifestHashRejected = $_.Exception.Message -like "*invalid SHA-256*"
    }
    Assert-True $invalidManifestHashRejected "Malformed manifest hash was not rejected"
} finally {
    if (Test-Path -LiteralPath $artifactRoot) {
        Remove-Item -LiteralPath $artifactRoot -Recurse -Force
    }
}

$inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
Assert-True ($inventory.schemaVersion -eq 1 -and $inventory.kind -eq "ecd-release-input-inventory") "Supply-chain inventory contract is invalid"
foreach ($scope in @("python", "npm", "cargo", "native", "github-actions")) {
    Assert-True (@($inventory.scopes) -contains $scope) "Supply-chain inventory scope is missing: $scope"
}
$scopeCounts = @{}
foreach ($scope in @($inventory.scopes)) {
    $scopeCounts[$scope] = @($inventory.components | Where-Object { $_.scope -eq $scope }).Count
}
Assert-True ($scopeCounts.python -eq 98) "Supply-chain inventory Python graph is incomplete"
Assert-True ($scopeCounts.npm -eq 89) "Supply-chain inventory npm graph is incomplete"
Assert-True ($scopeCounts.cargo -eq 481) "Supply-chain inventory Cargo graph is incomplete"
Assert-True ($scopeCounts.native -eq 10) "Supply-chain inventory native inputs are incomplete"
Assert-True ($scopeCounts.'github-actions' -eq 22) "Supply-chain inventory GitHub Actions inputs are incomplete"
foreach ($lockedLine in $lockLines) {
    $parts = $lockedLine.Substring(0, $lockedLine.Length - 2).Split(@("=="), 2, [System.StringSplitOptions]::None)
    $normalizedName = $parts[0].ToLowerInvariant().Replace("_", "-").Replace(".", "-")
    $matches = @($inventory.components | Where-Object {
        $_.scope -eq "python" -and
        $_.name.ToLowerInvariant().Replace("_", "-").Replace(".", "-") -eq $normalizedName -and
        $_.version -eq $parts[1]
    })
    Assert-True ($matches.Count -eq 1) "Supply-chain inventory does not match Python lock entry: $lockedLine"
    Assert-True ($matches[0].integrity.algorithm -eq "SHA-256" -and $matches[0].integrity.value -eq $lockHashes[$lockedLine]) "Supply-chain inventory hash does not match Python lock entry: $lockedLine"
}
foreach ($lockedCargo in @(
    @{ name = "tauri"; version = "2.11.5" },
    @{ name = "tauri-runtime-wry"; version = "2.11.4" },
    @{ name = "wry"; version = "0.55.1" },
    @{ name = "tauri-plugin-single-instance"; version = "2.4.3" }
)) {
    Assert-True (@($inventory.components | Where-Object { $_.scope -eq "cargo" -and $_.name -eq $lockedCargo.name -and $_.version -eq $lockedCargo.version }).Count -eq 1) "Resolved Cargo input changed: $($lockedCargo.name)"
}
$inventorySource = Get-Content -LiteralPath $inventoryPath -Raw
foreach ($forbiddenValue in @("R&D/", "frontend/dist", "desktop/resources/ecd-app", "workspace.json", "devices.json", "secrets.yaml", "C:\\Users\\")) {
    Assert-True (-not $inventorySource.Contains($forbiddenValue)) "Supply-chain inventory contains private, mutable, generated, or machine-local data: $forbiddenValue"
}
foreach ($inventoryComponent in @($inventory.components)) {
    foreach ($provenance in @($inventoryComponent.provenance)) {
        Assert-True (
            $provenance -notmatch "(?i)path\+file://" -and
            $provenance -notmatch "(?i)file:///" -and
            $provenance -notmatch "(?i)(?:^|\s)[A-Z]:[\\/]" -and
            $provenance -notmatch "(?i)(?:^|[\\/])Users[\\/]"
        ) "Supply-chain inventory contains machine-local provenance for $($inventoryComponent.scope)/$($inventoryComponent.name): $provenance"
    }
}
$notices = Get-Content -LiteralPath $noticesPath -Raw
foreach ($heading in @("Python runtime", "Python packages", "Frontend and npm", "Rust and Tauri", "MinGit", "NSIS", "WebView2", "Build and CI toolchains")) {
    Assert-True ($notices.Contains($heading)) "Third-party notices section is missing: $heading"
}
Assert-True ($notices.Contains("| Node.js | 22.14.0 |")) "Third-party notices omit the pinned Node.js build toolchain"
Assert-True (-not $notices.Contains("R&D/")) "Public notices must not reference private R&D documents"

$externalActionPattern = '^\s*-?\s*uses:\s*(?!\./)([^@\s]+)@([^\s#]+)'
$expectedActions = @()
foreach ($workflow in Get-ChildItem -LiteralPath (Join-Path $repoRoot ".github\workflows") -Filter "*.yml" -File) {
    $workflowLines = @(Get-Content -LiteralPath $workflow.FullName)
    for ($lineIndex = 0; $lineIndex -lt $workflowLines.Count; $lineIndex += 1) {
        $line = $workflowLines[$lineIndex]
        if ($line -match $externalActionPattern) {
            $actionName = $Matches[1]
            $actionVersion = $Matches[2]
            Assert-True ($actionVersion -match "^[0-9a-f]{40}$") "External action is not pinned to a full commit SHA in $($workflow.Name): $line"
            $expectedActions += [pscustomobject]@{
                Name = $actionName
                Version = $actionVersion.ToLowerInvariant()
                Provenance = ".github/workflows/$($workflow.Name):$($lineIndex + 1)"
            }
        }
    }
}
Assert-True ($expectedActions.Count -eq $scopeCounts.'github-actions') "GitHub Actions inventory count does not match workflow occurrences"
foreach ($expectedAction in $expectedActions) {
    $actionMatches = @($inventory.components | Where-Object {
        $_.scope -eq "github-actions" -and
        $_.name -eq $expectedAction.Name -and
        $_.version -eq $expectedAction.Version -and
        @($_.provenance).Count -eq 1 -and
        $_.provenance[0] -eq $expectedAction.Provenance
    })
    Assert-True ($actionMatches.Count -eq 1) "GitHub Actions inventory is stale or incomplete: $($expectedAction.Name) at $($expectedAction.Provenance)"
    Assert-True ($notices.Contains("| $($expectedAction.Name) | $($expectedAction.Version) |")) "Third-party notices omit GitHub Action $($expectedAction.Name)@$($expectedAction.Version)"
}

$prepareSource = Get-Content -LiteralPath (Join-Path $windowsRoot "prepare-runtime.ps1") -Raw
Assert-True ($prepareSource.Contains("Assert-ArtifactHash")) "Runtime preparation does not verify downloaded artifacts"
Assert-True ($prepareSource.Contains("--require-hashes")) "Runtime preparation does not enable pip hash mode"
Assert-True (-not $prepareSource.Contains("setuptools==82.0.0 wheel==0.47.0")) "Runtime preparation bypasses the hashed lock for build support packages"

$unsafeOutput = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-runtime-no-clobber-" + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $unsafeOutput | Out-Null
    $sentinel = Join-Path $unsafeOutput "sentinel.txt"
    Set-Content -LiteralPath $sentinel -Value "must survive" -Encoding ASCII
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $prepareOutput = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass `
            -File (Join-Path $windowsRoot "prepare-runtime.ps1") -OutputRoot $unsafeOutput 2>&1
        $prepareExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    Assert-True ($prepareExitCode -ne 0) "Runtime preparation accepted a non-empty OutputRoot"
    Assert-True (($prepareOutput -join "`n") -like "*Output runtime directory is not empty*") "Runtime preparation did not fail at the ownership boundary"
    Assert-True (Test-Path -LiteralPath $sentinel -PathType Leaf) "Runtime preparation clobbered an existing OutputRoot"
} finally {
    if (Test-Path -LiteralPath $unsafeOutput) {
        Remove-Item -LiteralPath $unsafeOutput -Recurse -Force
    }
}

"supply-chain contract: PASS"
