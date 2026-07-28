[CmdletBinding()]
param(
    [string]$Executable = ""
)

$ErrorActionPreference = "Stop"

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) {
        throw $message
    }
}

function Request-TauriClose([System.Diagnostics.Process]$process) {
    $process.Refresh()
    [void]$process.CloseMainWindow()
}

function Close-TauriGracefully([System.Diagnostics.Process]$process) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        Request-TauriClose $process
        if ($process.WaitForExit(5000)) { return $true }
    }
    return $process.HasExited
}

function Wait-Backend([System.Diagnostics.Process]$process, [int]$port) {
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) {
            throw "Tauri exited before health check with code $($process.ExitCode)"
        }
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $port) -TimeoutSec 2
            if ($health.mode -eq "desktop") { return }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    throw "Tauri backend did not become ready"
}

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Executable) {
    $Executable = Join-Path $desktopRoot "src-tauri\target\debug\esp-config-designer-desktop.exe"
}
$Executable = [System.IO.Path]::GetFullPath($Executable)
$resourceRoot = Join-Path $desktopRoot "resources\ecd-app"
$suffix = [guid]::NewGuid().ToString("N")
$profileRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-default-profile-" + $suffix)
$appDataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-default-appdata-" + $suffix)
$expectedWorkspace = Join-Path $profileRoot "Documents\ecd_workspace"
$existingProfileRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-existing-profile-" + $suffix)
$existingAppDataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-existing-appdata-" + $suffix)
$existingWorkspace = Join-Path ([System.IO.Path]::GetTempPath()) ("ECD Existing Workspace żółć-" + $suffix)
$port = 18600 + (Get-Random -Minimum 1 -Maximum 300)

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $Executable
$startInfo.WorkingDirectory = $desktopRoot
$startInfo.UseShellExecute = $false
$startInfo.EnvironmentVariables["ECD_TAURI_RESOURCE_ROOT"] = $resourceRoot
$startInfo.EnvironmentVariables["ECD_TAURI_APP_DATA_ROOT"] = $appDataRoot
$startInfo.EnvironmentVariables["ECD_TAURI_PORT"] = $port.ToString()
$startInfo.EnvironmentVariables["ECD_TAURI_HEALTH_TIMEOUT_MS"] = "120000"
$startInfo.EnvironmentVariables["USERPROFILE"] = $profileRoot
$startInfo.EnvironmentVariables.Remove("ECD_TAURI_WORKSPACE")

$process = $null
try {
    $process = [System.Diagnostics.Process]::Start($startInfo)
    Wait-Backend $process $port
    Assert-True (Test-Path -LiteralPath $expectedWorkspace -PathType Container) "Default workspace was not created"
    foreach ($relativePath in @("esp_projects", "esp_assets\fonts", "esp_assets\images", "esp_assets\audio")) {
        Assert-True (Test-Path -LiteralPath (Join-Path $expectedWorkspace $relativePath) -PathType Container) "Missing default workspace directory: $relativePath"
    }
    $record = Get-Content -LiteralPath (Join-Path $appDataRoot "workspace.json") -Raw | ConvertFrom-Json
    $recordWorkspace = [string]$record.workspace -replace '^\\\\\?\\', ''
    Assert-True ($recordWorkspace -eq [System.IO.Path]::GetFullPath($expectedWorkspace)) "Default workspace record is incorrect"
    Assert-True (Close-TauriGracefully $process) "Tauri did not close after default workspace test"

    $process = [System.Diagnostics.Process]::Start($startInfo)
    Wait-Backend $process $port
    $workspaceResponse = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/workspace" -f $port)
    $reportedWorkspace = [string]$workspaceResponse.workspace.path -replace '^\\\\\?\\', ''
    Assert-True ($reportedWorkspace -eq [System.IO.Path]::GetFullPath($expectedWorkspace)) "Saved default workspace was not reused"
    Assert-True (Close-TauriGracefully $process) "Tauri did not close after default workspace restart"

    New-Item -ItemType Directory -Path $existingAppDataRoot, $existingWorkspace -Force | Out-Null
    $existingRecord = @{ version = 1; workspace = [System.IO.Path]::GetFullPath($existingWorkspace) } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $existingAppDataRoot "workspace.json"),
        $existingRecord,
        (New-Object System.Text.UTF8Encoding($false))
    )
    $startInfo.EnvironmentVariables["ECD_TAURI_APP_DATA_ROOT"] = $existingAppDataRoot
    $startInfo.EnvironmentVariables["USERPROFILE"] = $existingProfileRoot
    $process = [System.Diagnostics.Process]::Start($startInfo)
    Wait-Backend $process $port
    $existingResponse = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/workspace" -f $port)
    $reportedExisting = [string]$existingResponse.workspace.path -replace '^\\\\\?\\', ''
    Assert-True ($reportedExisting -eq [System.IO.Path]::GetFullPath($existingWorkspace)) "Existing saved workspace was replaced"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $existingProfileRoot "Documents\ecd_workspace"))) "Default workspace was created for an existing user"
    Assert-True (Close-TauriGracefully $process) "Tauri did not close after existing workspace test"
    Write-Host "tauri first-start default workspace: PASS"
} finally {
    if ($process -and -not $process.HasExited) {
        Assert-True (Close-TauriGracefully $process) "Tauri remained open after graceful test cleanup"
    }
    if (Test-Path -LiteralPath $appDataRoot) {
        Remove-Item -LiteralPath $appDataRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $profileRoot) {
        Remove-Item -LiteralPath $profileRoot -Recurse -Force
    }
    foreach ($path in @($existingAppDataRoot, $existingProfileRoot, $existingWorkspace)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}
