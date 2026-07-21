[CmdletBinding()]
param(
    [string]$Executable = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) {
        throw $message
    }
}

function Request-TauriClose([System.Diagnostics.Process]$process) {
    try {
        [void][Microsoft.VisualBasic.Interaction]::AppActivate("ESPConfig Designer")
        [System.Windows.Forms.SendKeys]::SendWait("%{F4}")
    } catch {
        [void]$process.CloseMainWindow()
    }
}

function Close-TauriGracefully([System.Diagnostics.Process]$process) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        Request-TauriClose $process
        if ($process.WaitForExit(5000)) {
            return $true
        }
    }
    return $process.HasExited
}

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Executable) {
    $Executable = Join-Path $desktopRoot "src-tauri\target\debug\esp-config-designer-desktop.exe"
}
$Executable = [System.IO.Path]::GetFullPath($Executable)
$resourceRoot = Join-Path $desktopRoot "resources\ecd-app"
$suffix = [guid]::NewGuid().ToString("N")
$appDataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-smoke-appdata-" + $suffix)
$unicodeName = "ECD Smoke Workspace " + [string][char]0x017C + [char]0x00F3 + [char]0x0142 + [char]0x0107 + "-" + $suffix
$workspace = Join-Path ([System.IO.Path]::GetTempPath()) $unicodeName
$port = 18000 + (Get-Random -Minimum 1 -Maximum 400)

if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Tauri executable is missing: $Executable"
}
if (-not (Test-Path -LiteralPath (Join-Path $resourceRoot "backend/server.py") -PathType Leaf)) {
    throw "Packaged backend resource is missing: $resourceRoot"
}
$runtimeManifestPath = Join-Path $resourceRoot "runtime/runtime-manifest.json"
$layoutManifestPath = Join-Path $resourceRoot "resource-layout.json"
$runtimeManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeManifestPath).Hash
$layoutManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $layoutManifestPath).Hash
New-Item -ItemType Directory -Path $workspace -Force | Out-Null

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $Executable
$startInfo.WorkingDirectory = $desktopRoot
$startInfo.UseShellExecute = $false
$startInfo.EnvironmentVariables["ECD_TAURI_RESOURCE_ROOT"] = $resourceRoot
$startInfo.EnvironmentVariables["ECD_TAURI_APP_DATA_ROOT"] = $appDataRoot
$startInfo.EnvironmentVariables["ECD_TAURI_WORKSPACE"] = $workspace
$startInfo.EnvironmentVariables["ECD_TAURI_PORT"] = $port.ToString()
$startInfo.EnvironmentVariables["ECD_TAURI_HEALTH_TIMEOUT_MS"] = "120000"

$process = $null
try {
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    $health = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) {
            throw "Tauri exited before health check with code $($process.ExitCode)"
        }
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $port) -TimeoutSec 2
            if ($health.mode -eq "desktop") { break }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    Assert-True ($health.mode -eq "desktop") "Packaged Tauri backend did not reach desktop health"
    $workspaceResponse = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/workspace" -f $port)
    Assert-True ($workspaceResponse.workspace.ready -eq $true) "Packaged workspace was not ready"
    $schemaResponse = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/api/component-schemas/components/custom/empty.json" -f $port)
    Assert-True ($schemaResponse.StatusCode -eq 200) "Packaged component schema route did not return HTTP 200"
    Assert-True ($schemaResponse.Headers["Content-Type"] -like "application/json*") "Packaged component schema response is not JSON"
    Assert-True (Test-Path -LiteralPath (Join-Path $appDataRoot "workspace.json") -PathType Leaf) "Workspace config was not persisted in app-data"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resourceRoot "workspace.json"))) "Resource root was used for workspace config"
    Assert-True ($runtimeManifestHash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeManifestPath).Hash) "Runtime manifest changed in resource root"
    Assert-True ($layoutManifestHash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $layoutManifestPath).Hash) "Resource layout manifest changed in resource root"

    Assert-True (Close-TauriGracefully $process) "Tauri did not close within the cleanup timeout"
    Write-Host "tauri packaged smoke: PASS"
} finally {
    if ($process -and -not $process.HasExited) {
        Assert-True (Close-TauriGracefully $process) "Tauri remained open after graceful test cleanup"
    }
    if (Test-Path -LiteralPath $appDataRoot) {
        Remove-Item -LiteralPath $appDataRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $workspace) {
        Remove-Item -LiteralPath $workspace -Recurse -Force
    }
}
