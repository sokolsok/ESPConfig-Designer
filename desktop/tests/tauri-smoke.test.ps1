[CmdletBinding()]
param(
    [string]$Executable = "",
    [string]$ResourceRoot = "",
    [switch]$UseExecutableResources
)

$ErrorActionPreference = "Stop"

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) {
        throw $message
    }
}

function Stop-ProcessTree([System.Diagnostics.Process]$process) {
    if (-not $process.HasExited) {
        $taskkill = Start-Process `
            -FilePath (Join-Path $env:SystemRoot "System32\taskkill.exe") `
            -ArgumentList @("/PID", $process.Id.ToString(), "/T", "/F") `
            -Wait -PassThru -NoNewWindow
        if ($taskkill.ExitCode -ne 0 -and -not $process.HasExited) {
            throw "Could not terminate Tauri process tree (taskkill exit $($taskkill.ExitCode))"
        }
        Assert-True ($process.WaitForExit(30000)) "Tauri did not stop within the cleanup timeout"
    }
}

function Stop-TauriProcess([System.Diagnostics.Process]$process, [int]$port) {
    Stop-ProcessTree $process

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Tauri backend port remained open after process cleanup"
}

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Executable) {
    $Executable = Join-Path $desktopRoot "src-tauri\target\debug\esp-config-designer-desktop.exe"
}
$Executable = [System.IO.Path]::GetFullPath($Executable)
if (-not $ResourceRoot) {
    $ResourceRoot = Join-Path $desktopRoot "resources\ecd-app"
}
$resourceRoot = [System.IO.Path]::GetFullPath($ResourceRoot)
$suffix = [guid]::NewGuid().ToString("N")
$appDataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-smoke-appdata-" + $suffix)
$unicodeName = "ECD Smoke Workspace " + [string][char]0x017C + [char]0x00F3 + [char]0x0142 + [char]0x0107 + "-" + $suffix
$workspace = Join-Path ([System.IO.Path]::GetTempPath()) $unicodeName
$hostilePythonRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-hostile-python-" + $suffix)
$hostileUserBase = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-hostile-userbase-" + $suffix)
$hostileUserSite = Join-Path $hostileUserBase "Python313\site-packages"
$webviewDataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-webview-data-" + $suffix)
$port = 18000 + (Get-Random -Minimum 1 -Maximum 400)
$debugListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$debugListener.Start()
$debugPort = ([System.Net.IPEndPoint]$debugListener.LocalEndpoint).Port
$debugListener.Stop()

if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Tauri executable is missing: $Executable"
}
if (-not (Test-Path -LiteralPath (Join-Path $resourceRoot "backend/server.py") -PathType Leaf)) {
    throw "Packaged backend resource is missing: $resourceRoot"
}
$runtimeManifestPath = Join-Path $resourceRoot "runtime/runtime-manifest.json"
$layoutManifestPath = Join-Path $resourceRoot "resource-layout.json"
$catalogPath = Join-Path $resourceRoot "backend/schema-catalog/components_list/components_list.json"
$runtimeManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeManifestPath).Hash
$layoutManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $layoutManifestPath).Hash
$catalogHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $catalogPath).Hash
New-Item -ItemType Directory -Path $workspace -Force | Out-Null
New-Item -ItemType Directory -Path $hostilePythonRoot, $hostileUserSite -Force | Out-Null
$firmwareRoot = Join-Path $appDataRoot "b\csp-probe"
$jobRoot = Join-Path $appDataRoot "j"
New-Item -ItemType Directory -Path $firmwareRoot, $jobRoot -Force | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $firmwareRoot "firmware.bin"), [byte[]](0, 1, 2, 3))
$jobRecord = @{
    id = "csp-probe"
    state = "success"
    created_at = "2026-07-29T00:00:00Z"
    started_at = "2026-07-29T00:00:01Z"
    ended_at = "2026-07-29T00:00:02Z"
    exit_code = 0
    error_summary = ""
    yaml = "csp-probe.yaml"
    action = "compile"
    device = "csp-probe"
    serial_port = ""
} | ConvertTo-Json
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $jobRoot "csp-probe.json"), $jobRecord, $utf8WithoutBom)
[System.IO.File]::WriteAllText((Join-Path $jobRoot "csp-probe.log"), "synthetic CSP smoke job`n", $utf8WithoutBom)
foreach ($moduleName in @("desktop_runtime", "runtime_contract", "runtime_manifest", "runtime_update")) {
    "raise RuntimeError('hostile Python import used')" | Set-Content -LiteralPath (Join-Path $hostilePythonRoot "$moduleName.py") -Encoding ASCII
    "raise RuntimeError('hostile user-site import used')" | Set-Content -LiteralPath (Join-Path $hostileUserSite "$moduleName.py") -Encoding ASCII
}

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $Executable
$startInfo.WorkingDirectory = $desktopRoot
$startInfo.UseShellExecute = $false
if (-not $UseExecutableResources) {
    $startInfo.EnvironmentVariables["ECD_TAURI_RESOURCE_ROOT"] = $resourceRoot
} else {
    $startInfo.EnvironmentVariables.Remove("ECD_TAURI_RESOURCE_ROOT")
}
$startInfo.EnvironmentVariables["ECD_TAURI_APP_DATA_ROOT"] = $appDataRoot
$startInfo.EnvironmentVariables["ECD_TAURI_WORKSPACE"] = $workspace
$startInfo.EnvironmentVariables["ECD_TAURI_PORT"] = $port.ToString()
$startInfo.EnvironmentVariables["ECD_TAURI_HEALTH_TIMEOUT_MS"] = "120000"
$startInfo.EnvironmentVariables["PYTHONPATH"] = $hostilePythonRoot
$startInfo.EnvironmentVariables["PYTHONUSERBASE"] = $hostileUserBase
$startInfo.EnvironmentVariables["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--remote-debugging-port=$debugPort"
$startInfo.EnvironmentVariables["WEBVIEW2_USER_DATA_FOLDER"] = $webviewDataRoot

$process = $null
$secondProcess = $null
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
    $uiResponse = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/" -f $port)
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$uiResponse.Headers["Content-Security-Policy"])) "Desktop UI response has no CSP header"

    & node (Join-Path $PSScriptRoot "webview-csp-gate.mjs") --debug-port $debugPort --backend-port $port
    if ($LASTEXITCODE -ne 0) {
        throw "WebView CSP gate failed with exit code $LASTEXITCODE"
    }

    $secondProcess = [System.Diagnostics.Process]::Start($startInfo)
    Assert-True ($secondProcess.WaitForExit(30000)) "Second application instance did not exit"
    Assert-True ($secondProcess.ExitCode -eq 0) "Second application instance failed with code $($secondProcess.ExitCode)"
    Assert-True (-not $process.HasExited) "Second application instance terminated the primary instance"
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    Assert-True ($listeners.Count -eq 1) "Single-instance launch left $($listeners.Count) backend listeners"
    $healthAfterSecondLaunch = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $port) -TimeoutSec 2
    Assert-True ($healthAfterSecondLaunch.mode -eq "desktop") "Primary backend failed after the second launch"

    $workspaceResponse = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/workspace" -f $port)
    Assert-True ($workspaceResponse.workspace.ready -eq $true) "Packaged workspace was not ready"
    $schemaResponse = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/api/component-schemas/components/custom/empty.json" -f $port)
    Assert-True ($schemaResponse.StatusCode -eq 200) "Packaged component schema route did not return HTTP 200"
    Assert-True ($schemaResponse.Headers["Content-Type"] -like "application/json*") "Packaged component schema response is not JSON"
    $catalogResponse = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/component-catalog" -f $port)
    Assert-True ($catalogResponse.status -eq "ok") "Packaged component catalog API response is invalid"
    Assert-True (@($catalogResponse.catalog.categories).Count -gt 0) "Packaged component catalog API is empty"
    foreach ($relativePath in @(
        "components_list/components_list.json",
        "schemas/components/custom/empty.json"
    )) {
        $staticResponse = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/{1}" -f $port, $relativePath)
        Assert-True ($staticResponse.StatusCode -eq 200) "Packaged static catalog path did not return HTTP 200: $relativePath"
        Assert-True ($staticResponse.Headers["Content-Type"] -like "application/json*") "Packaged static catalog path is not JSON: $relativePath"
    }
    Assert-True (Test-Path -LiteralPath (Join-Path $appDataRoot "workspace.json") -PathType Leaf) "Workspace config was not persisted in app-data"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $resourceRoot "workspace.json"))) "Resource root was used for workspace config"
    Assert-True ($runtimeManifestHash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeManifestPath).Hash) "Runtime manifest changed in resource root"
    Assert-True ($layoutManifestHash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $layoutManifestPath).Hash) "Resource layout manifest changed in resource root"
    Assert-True ($catalogHash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $catalogPath).Hash) "Schema catalog changed in resource root"

    Stop-TauriProcess $process $port
    Write-Host "tauri packaged smoke: PASS"
} finally {
    if ($secondProcess -and -not $secondProcess.HasExited) {
        Stop-ProcessTree $secondProcess
    }
    if ($process -and -not $process.HasExited) {
        Stop-TauriProcess $process $port
    }
    if (Test-Path -LiteralPath $appDataRoot) {
        Remove-Item -LiteralPath $appDataRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $workspace) {
        Remove-Item -LiteralPath $workspace -Recurse -Force
    }
    foreach ($path in @($hostilePythonRoot, $hostileUserBase, $webviewDataRoot)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}
