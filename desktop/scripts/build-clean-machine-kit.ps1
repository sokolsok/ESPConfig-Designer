[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$SourceSha,
    [switch]$ContractTest
)

$ErrorActionPreference = "Stop"
function Assert-NoReparseAncestors([string]$Path, [string]$Name) {
    $current = $Path
    while (-not (Test-Path -LiteralPath $current)) { $current = Split-Path -Parent $current }
    while ($current) {
        if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "$Name contains a reparse point: $current"
        }
        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }
}

if ($SourceSha -notmatch "^[0-9a-fA-F]{40}$") { throw "SourceSha must be a full commit SHA" }
if (-not [IO.Path]::IsPathRooted($OutputRoot)) { throw "OutputRoot must be an absolute path" }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
if ($OutputRoot.Length -gt [IO.Path]::GetPathRoot($OutputRoot).Length) { $OutputRoot = $OutputRoot.TrimEnd("\") }
if (Test-Path -LiteralPath $OutputRoot) { throw "Clean-machine kit OutputRoot already exists" }
$outputParent = Split-Path -Parent $OutputRoot
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) { throw "Clean-machine kit OutputRoot parent is missing" }
Assert-NoReparseAncestors $outputParent "Clean-machine kit OutputRoot"

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $desktopRoot "..")).Path
$repoPrefix = $repoRoot.TrimEnd("\") + "\"
if ($OutputRoot.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $OutputRoot.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Clean-machine kit OutputRoot must be outside the repository"
}
$snapshotRoot = ""
if ($ContractTest) {
    $sourceStatus = "synthetic-contract-test"
    $inputDesktopRoot = $desktopRoot
} else {
    $actualSourceSha = (& git -C $repoRoot rev-parse --verify "HEAD^{commit}").Trim()
    if ($LASTEXITCODE -ne 0 -or $actualSourceSha -ne $SourceSha) { throw "SourceSha does not match the current committed source" }
    $sourceDrift = & git -C $repoRoot status --porcelain=v1 --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or @($sourceDrift).Count -ne 0) { throw "Clean-machine kit production build requires a clean source tree" }
    $sourceStatus = "clean"
    $snapshotRoot = Join-Path $OutputRoot ".committed-source"
}

New-Item -ItemType Directory -Path $OutputRoot | Out-Null
if (-not $ContractTest) {
    New-Item -ItemType Directory -Path $snapshotRoot | Out-Null
    $snapshotArchive = Join-Path $snapshotRoot "source.tar"
    & git -C $repoRoot archive --format=tar --output=$snapshotArchive $SourceSha -- `
        desktop/platforms/windows/clean-machine-release-gate.ps1 `
        desktop/platforms/windows/artifact-integrity.ps1 `
        desktop/tests/fixtures/clean-machine/compile-only.yaml `
        desktop/tests/fixtures/clean-machine/windows-matrix-policy.json
    if ($LASTEXITCODE -ne 0) { throw "Could not archive the exact committed clean-machine kit inputs" }
    & tar.exe -xf $snapshotArchive -C $snapshotRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not extract the exact committed clean-machine kit inputs" }
    $inputDesktopRoot = Join-Path $snapshotRoot "desktop"
}
$allowlist = @(
    [ordered]@{ source = Join-Path $inputDesktopRoot "platforms\windows\clean-machine-release-gate.ps1"; path = "clean-machine-release-gate.ps1" },
    [ordered]@{ source = Join-Path $inputDesktopRoot "platforms\windows\artifact-integrity.ps1"; path = "artifact-integrity.ps1" },
    [ordered]@{ source = Join-Path $inputDesktopRoot "tests\fixtures\clean-machine\compile-only.yaml"; path = "fixtures/compile-only.yaml" },
    [ordered]@{ source = Join-Path $inputDesktopRoot "tests\fixtures\clean-machine\windows-matrix-policy.json"; path = "windows-matrix-policy.json" }
)
foreach ($entry in $allowlist) {
    if (-not (Test-Path -LiteralPath $entry.source -PathType Leaf)) { throw "Clean-machine kit input is missing: $($entry.source)" }
    if (((Get-Item -LiteralPath $entry.source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Clean-machine kit input is a reparse point: $($entry.source)"
    }
    Assert-NoReparseAncestors $entry.source "Clean-machine kit input"
}
$approvedFixtureSha256 = "95eb66a5ec9aec4e095b138528892f0aa1414cd8c6fe5b045d4cf9ae8411c81f"
$fixtureSource = ($allowlist | Where-Object { $_.path -eq "fixtures/compile-only.yaml" }).source
if ((Get-FileHash -LiteralPath $fixtureSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $approvedFixtureSha256) {
    throw "Synthetic compile-only fixture bytes are not approved"
}

$payloadRoot = Join-Path $OutputRoot "kit"
New-Item -ItemType Directory -Path $payloadRoot | Out-Null
$manifestFiles = @()
foreach ($entry in @($allowlist | Sort-Object { [string]$_['path'] })) {
    $destination = Join-Path $payloadRoot ($entry.path.Replace("/", "\"))
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $entry.source -Destination $destination
    $file = Get-Item -LiteralPath $destination
    $manifestFiles += [ordered]@{
        path = $entry.path
        length = [int64]$file.Length
        sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
if (-not $ContractTest) {
    $finalSourceSha = (& git -C $repoRoot rev-parse --verify "HEAD^{commit}").Trim()
    $finalSourceDrift = & git -C $repoRoot status --porcelain=v1 --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or $finalSourceSha -ne $SourceSha -or @($finalSourceDrift).Count -ne 0) {
        throw "Clean-machine kit source changed while committed inputs were staged"
    }
    Remove-Item -LiteralPath $snapshotRoot -Recurse -Force
}

$aggregateInput = ($manifestFiles | Sort-Object { [string]$_['path'] } | ForEach-Object { "$($_.path)`0$($_.length)`0$($_.sha256)`n" }) -join ""
$aggregateBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($aggregateInput)
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $aggregateSha256 = ([BitConverter]::ToString($hasher.ComputeHash($aggregateBytes))).Replace("-", "").ToLowerInvariant()
} finally {
    $hasher.Dispose()
}
$manifest = [ordered]@{
    schemaVersion = 1
    kind = "ecd-windows-clean-machine-kit"
    sourceCommit = $SourceSha.ToLowerInvariant()
    sourceStatus = $sourceStatus
    powershell = "Windows PowerShell 5.1"
    aggregateSha256 = $aggregateSha256
    fixtureSha256 = ($manifestFiles | Where-Object { $_.path -eq "fixtures/compile-only.yaml" }).sha256
    files = $manifestFiles
}
$utf8 = New-Object Text.UTF8Encoding($false)
$manifestJson = ($manifest | ConvertTo-Json -Depth 10) + "`n"
$payloadManifestPath = Join-Path $payloadRoot "kit-manifest.json"
[IO.File]::WriteAllText($payloadManifestPath, $manifestJson, $utf8)
[IO.File]::WriteAllText((Join-Path $OutputRoot "kit-manifest.json"), $manifestJson, $utf8)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = Join-Path $OutputRoot "ecd-clean-machine-kit.zip"
$archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    $archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        $archiveEntries = @($manifestFiles.path + "kit-manifest.json" | Sort-Object)
        $fixedTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        foreach ($relative in $archiveEntries) {
            $source = Join-Path $payloadRoot ($relative.Replace("/", "\"))
            $zipEntry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::NoCompression)
            $zipEntry.LastWriteTime = $fixedTimestamp
            $zipEntry.ExternalAttributes = 0
            $input = [IO.File]::OpenRead($source)
            $output = $zipEntry.Open()
            try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $archiveStream.Dispose()
}
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $OutputRoot "ecd-clean-machine-kit.zip.sha256"), "$archiveHash  ecd-clean-machine-kit.zip`n", $utf8)
Write-Host "[info] Clean-machine kit SHA-256: $archiveHash"
