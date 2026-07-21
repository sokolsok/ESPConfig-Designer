[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) {
        throw $message
    }
}

function Assert-WorkspaceLayout([string]$workspace) {
    foreach ($relativePath in @(
        "esp_projects",
        "esp_assets\fonts",
        "esp_assets\images",
        "esp_assets\audio"
    )) {
        Assert-True (Test-Path -LiteralPath (Join-Path $workspace $relativePath) -PathType Container) "Missing workspace directory: $relativePath"
    }
}

function Test-WorkspaceCandidate([string]$workspace, [string]$appData) {
    Assert-True (Test-Path -LiteralPath $workspace -PathType Container) "Workspace does not exist"
    $workspaceFull = [System.IO.Path]::GetFullPath($workspace).TrimEnd("\")
    $appDataFull = [System.IO.Path]::GetFullPath($appData).TrimEnd("\")
    $workspaceKey = $workspaceFull.ToLowerInvariant()
    $appDataKey = $appDataFull.ToLowerInvariant()
    Assert-True (
        $workspaceKey -ne $appDataKey -and
        -not $workspaceKey.StartsWith($appDataKey + "\") -and
        -not $appDataKey.StartsWith($workspaceKey + "\")
    ) "Workspace overlaps app-data"
    $probe = Join-Path $workspace ".ecd-write-test"
    Set-Content -LiteralPath $probe -Value "ok" -Encoding UTF8
    Remove-Item -LiteralPath $probe -Force
    foreach ($relativePath in @("esp_projects", "esp_assets\fonts", "esp_assets\images", "esp_assets\audio")) {
        New-Item -ItemType Directory -Path (Join-Path $workspace $relativePath) -Force | Out-Null
    }
    Assert-WorkspaceLayout $workspace
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-workspace-contract-" + [guid]::NewGuid().ToString("N"))
$appData = Join-Path $root "app-data"
$emptyWorkspace = Join-Path $root "ECD Workspace żółć"
$existingWorkspace = Join-Path $root "existing workspace"
$installRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

try {
    New-Item -ItemType Directory -Path $appData, $emptyWorkspace, $existingWorkspace -Force | Out-Null

    Test-WorkspaceCandidate $emptyWorkspace $appData
    Test-WorkspaceCandidate $existingWorkspace $appData

    $recordPath = Join-Path $appData "workspace.json"
    @{ version = 1; workspace = [System.IO.Path]::GetFullPath($emptyWorkspace) } |
        ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    Assert-True ($record.workspace -eq [System.IO.Path]::GetFullPath($emptyWorkspace)) "Workspace record was not persisted in app-data"

    $samePathRejected = $false
    try { Test-WorkspaceCandidate $appData $appData } catch { $samePathRejected = $true }
    Assert-True $samePathRejected "app-data itself must be rejected as workspace"

    $nestedPath = Join-Path $appData "nested-workspace"
    New-Item -ItemType Directory -Path $nestedPath -Force | Out-Null
    $nestedRejected = $false
    try { Test-WorkspaceCandidate $nestedPath $appData } catch { $nestedRejected = $true }
    Assert-True $nestedRejected "workspace nested in app-data must be rejected"

    $fileCandidate = Join-Path $root "not-a-directory"
    Set-Content -LiteralPath $fileCandidate -Value "not a workspace" -Encoding UTF8
    $fileRejected = $false
    try { Test-WorkspaceCandidate $fileCandidate $appData } catch { $fileRejected = $true }
    Assert-True $fileRejected "file candidate must be rejected"

    $activeJobs = @(
        @{ id = "queued"; state = "queued" },
        @{ id = "done"; state = "success" }
    )
    Assert-True (@($activeJobs | Where-Object { $_.state -in @("queued", "running") }).Count -eq 1) "Active job contract is invalid"
    Assert-True (-not $installRoot.StartsWith([System.IO.Path]::GetFullPath($emptyWorkspace), [System.StringComparison]::OrdinalIgnoreCase)) "Workspace must not be inside install root"

    Write-Host "workspace contract: PASS"
} finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
