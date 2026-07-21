[CmdletBinding()]
param(
    [string]$Root = "C:\ECDTest",
    [int]$Port = 8099
)

$ErrorActionPreference = "Stop"
$Root = [System.IO.Path]::GetFullPath($Root)
$runtime = Join-Path $Root "runtime"
$appData = Join-Path $Root "appdata"
$workspace = Join-Path $Root "workspace"
$backend = Join-Path $Root "app"
$yaml = Join-Path $workspace "test.yaml"
$launchScript = Join-Path $PSScriptRoot "launch.ps1"
if (-not (Test-Path -LiteralPath $launchScript -PathType Leaf)) {
    throw "Windows launcher is missing: $launchScript"
}
$results = [System.Collections.Generic.List[object]]::new()
$serverJob = $null

function Run-UpdateRecoveryTests {
    $python = Join-Path $runtime "python.exe"
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw "Embedded Python is missing: $python"
    }
    $previousLocation = Get-Location
    try {
        Set-Location -LiteralPath $backend
        & $python -m unittest tests.test_runtime_manifest tests.test_runtime_update -v
        if ($LASTEXITCODE -ne 0) {
            throw "Runtime update/cache recovery tests failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Set-Location -LiteralPath $previousLocation
    }
}

function Start-Backend([bool]$Offline) {
    $script = {
        param($RuntimePath, $AppDataPath, $WorkspacePath, $BackendPath, $LaunchScriptPath, $ServerPort, $IsOffline)
        $env:PATH = "C:\Windows\System32;C:\Windows"
        if ($IsOffline) {
            $proxy = "http://127.0.0.1:9"
            $env:HTTP_PROXY = $proxy
            $env:HTTPS_PROXY = $proxy
            $env:ALL_PROXY = $proxy
            $env:http_proxy = $proxy
            $env:https_proxy = $proxy
            $env:all_proxy = $proxy
        }
        & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -NoProfile -ExecutionPolicy Bypass -File $LaunchScriptPath `
            -RuntimeRoot $RuntimePath -AppDataRoot $AppDataPath -Workspace $WorkspacePath `
            -BackendRoot $BackendPath -Port $ServerPort
    }
    $script:serverJob = Start-Job -ScriptBlock $script -ArgumentList `
        $runtime, $appData, $workspace, $backend, $launchScript, $Port, $Offline
    for ($index = 0; $index -lt 90; $index++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-RestMethod "http://127.0.0.1:$Port/api/health" | Out-Null
            return
        }
        catch {
            if ((Get-Job -Id $script:serverJob.Id).State -eq "Failed") {
                break
            }
        }
    }
    Receive-Job -Id $script:serverJob.Id -Keep 2>&1 | Out-String | Write-Output
    throw "Backend did not become healthy"
}

function Stop-Backend {
    if ($script:serverJob) {
        Stop-Job -Id $script:serverJob.Id -ErrorAction SilentlyContinue
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        Receive-Job -Id $script:serverJob.Id -Keep 2>&1 | Out-String | Write-Output
        $ErrorActionPreference = $previousPreference
        Remove-Job -Id $script:serverJob.Id -Force -ErrorAction SilentlyContinue
        $script:serverJob = $null
        Start-Sleep -Seconds 3
    }
}

function Run-Compile([string]$Label) {
    $body = @{ yaml = "test.yaml"; action = "compile" } | ConvertTo-Json
    $started = Invoke-RestMethod "http://127.0.0.1:$Port/api/install" -Method Post `
        -ContentType "application/json" -Body $body
    do {
        Start-Sleep -Seconds 3
        $status = Invoke-RestMethod "http://127.0.0.1:$Port/api/jobs/$($started.job_id)"
    } while ($status.job.state -in @("queued", "running"))
    $result = [pscustomobject]@{
        label = $Label
        job_id = $started.job_id
        state = $status.job.state
        exit_code = $status.job.exit_code
    }
    $results.Add($result)
    return $result
}

try {
    Run-UpdateRecoveryTests
    $initialHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $yaml).Hash
    Start-Backend $false
    $runtimeInfo = Invoke-RestMethod "http://127.0.0.1:$Port/api/runtime"
    $workspaceInfo = Invoke-RestMethod "http://127.0.0.1:$Port/api/workspace"
    Run-Compile "first-online" | Out-Null
    Run-Compile "cache-replay" | Out-Null
    Stop-Backend

    Start-Backend $false
    Run-Compile "restart-replay" | Out-Null
    Stop-Backend

    Start-Backend $true
    Run-Compile "offline-replay" | Out-Null
    $body = @{ yaml = "test.yaml"; action = "compile" } | ConvertTo-Json
    $cancelStarted = Invoke-RestMethod "http://127.0.0.1:$Port/api/install" -Method Post `
        -ContentType "application/json" -Body $body
    Start-Sleep -Seconds 2
    Invoke-RestMethod "http://127.0.0.1:$Port/api/jobs/$($cancelStarted.job_id)/cancel" `
        -Method Post | Out-Null
    do {
        Start-Sleep -Seconds 2
        $cancelStatus = Invoke-RestMethod "http://127.0.0.1:$Port/api/jobs/$($cancelStarted.job_id)"
    } while ($cancelStatus.job.state -in @("queued", "running"))
    $results.Add([pscustomobject]@{
        label = "cancel"
        job_id = $cancelStarted.job_id
        state = $cancelStatus.job.state
        exit_code = $cancelStatus.job.exit_code
    })
    Stop-Backend

    $remaining = @(Get-Process -Name @("esphome", "pio", "uv", "scons", "cmake", "ninja") `
        -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique)
    $finalHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $yaml).Hash
    $compileFailures = @($results | Where-Object { $_.label -ne "cancel" -and $_.state -ne "success" })
    $cancelFailures = @($results | Where-Object { $_.label -eq "cancel" -and $_.state -ne "canceled" })
    if ($compileFailures.Count -gt 0) {
        throw "Compile gate contains failed jobs: $($compileFailures | ConvertTo-Json -Compress)"
    }
    if ($cancelFailures.Count -gt 0) {
        throw "Cancel gate did not cancel the job: $($cancelFailures | ConvertTo-Json -Compress)"
    }
    if ($initialHash -ne $finalHash) {
        throw "Workspace changed during the clean-machine gate"
    }
    if ($remaining.Count -gt 0) {
        throw "Child processes remained after the clean-machine gate: $($remaining -join ', ')"
    }
    [pscustomobject]@{
        results = @($results)
        runtime = $runtimeInfo
        workspace = $workspaceInfo
        workspace_hash_unchanged = ($initialHash -eq $finalHash)
        cache_outside_workspace = ([IO.Path]::GetFullPath($appData) -ne [IO.Path]::GetFullPath($workspace))
        remaining_processes = @($remaining)
    } | ConvertTo-Json -Depth 10
}
finally {
    Stop-Backend
}
