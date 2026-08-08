[CmdletBinding()]
param(
    [string]$Executable = "",
    [string]$ResourceRoot = "",
    [switch]$UseExecutableResources
)

$ErrorActionPreference = "Stop"

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function New-TestRoot([string]$Label) {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-tauri-startup-guard-{0}-{1}" -f $Label, [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path (Join-Path $root "workspace") -Force | Out-Null
    return $root
}

function New-TauriStartInfo([string]$Root, [int]$Port, [int]$HoldMilliseconds = 0) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.WorkingDirectory = $desktopRoot
    $info.UseShellExecute = $false
    if ($UseExecutableResources) {
        $info.EnvironmentVariables.Remove("ECD_TAURI_RESOURCE_ROOT")
    } else {
        $info.EnvironmentVariables["ECD_TAURI_RESOURCE_ROOT"] = $resourceRoot
    }
    $info.EnvironmentVariables["ECD_TAURI_APP_DATA_ROOT"] = Join-Path $Root "appdata"
    $info.EnvironmentVariables["ECD_TAURI_WORKSPACE"] = Join-Path $Root "workspace"
    $info.EnvironmentVariables["ECD_TAURI_PORT"] = $Port.ToString()
    $info.EnvironmentVariables["ECD_TAURI_HEALTH_TIMEOUT_MS"] = "120000"
    $info.EnvironmentVariables.Remove("ECD_TAURI_TEST_STARTUP_GUARD_HOLD_MS")
    if ($HoldMilliseconds -gt 0) {
        $info.EnvironmentVariables["ECD_TAURI_TEST_STARTUP_GUARD_HOLD_MS"] = $HoldMilliseconds.ToString()
    }
    return $info
}

function Wait-DesktopHealth([System.Diagnostics.Process]$Process, [int]$Port, [int]$TimeoutSeconds = 120) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) { throw "Tauri exited before health with code $($Process.ExitCode)" }
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $Port) -TimeoutSec 2
            if ($health.mode -eq "desktop") { return $health }
        } catch { Start-Sleep -Milliseconds 100 }
    }
    throw "Desktop health did not become ready on port $Port"
}

function Assert-OneListener([int]$Port) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    Assert-True ($listeners.Count -eq 1) "Expected exactly one listener on port $Port, found $($listeners.Count)"
}

function Wait-NoListener([int]$Port) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { return }
        Start-Sleep -Milliseconds 100
    }
    throw "Listener on port $Port survived test cleanup"
}

function Stop-ProcessTree([System.Diagnostics.Process]$Process) {
    if (-not $Process.HasExited) {
        $taskkill = Start-Process -FilePath (Join-Path $env:SystemRoot "System32\taskkill.exe") `
            -ArgumentList @("/PID", $Process.Id.ToString(), "/T", "/F") -Wait -PassThru -NoNewWindow
        if ($taskkill.ExitCode -ne 0 -and -not $Process.HasExited) {
            throw "Could not terminate test process tree $($Process.Id)"
        }
        Assert-True ($Process.WaitForExit(30000)) "Test process $($Process.Id) did not stop"
    }
}

function Wait-StartupGuardOwned([System.Diagnostics.Process]$Process) {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) { throw "Expected guard owner exited with code $($Process.ExitCode)" }
        $handle = [StartupGuardNative]::CreateMutexW([IntPtr]::Zero, $false, "Local\com.espconfigdesigner.desktop.startup-guard")
        Assert-True ($handle -ne [IntPtr]::Zero) "Could not inspect startup guard ownership"
        try {
            $wait = [StartupGuardNative]::WaitForSingleObject($handle, 0)
            if ($wait -eq 0x00000102) { return }
            if ($wait -eq 0 -or $wait -eq 0x00000080) {
                [StartupGuardNative]::ReleaseMutex($handle) | Out-Null
            } else {
                throw ("Unexpected startup guard probe result: 0x{0:x8}" -f $wait)
            }
        } finally {
            [StartupGuardNative]::CloseHandle($handle) | Out-Null
        }
        Start-Sleep -Milliseconds 20
    }
    throw "Process did not acquire the startup guard"
}

function Close-StartupErrorDialog([System.Diagnostics.Process]$Process) {
    $expectedTitle = "ESPConfig Designer could not start"
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) { return }
        $dialog = [StartupGuardNative]::FindVisibleWindowByTitle([uint32]$Process.Id, $expectedTitle)
        if ($dialog -ne [IntPtr]::Zero) {
            Assert-True ([StartupGuardNative]::PostMessageW($dialog, 0x0010, [UIntPtr]::Zero, [IntPtr]::Zero)) "Could not close the controlled startup error dialog"
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Controlled startup error dialog did not appear"
}

if (-not ("StartupGuardNative" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class StartupGuardNative {
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateMutexW(IntPtr attributes, bool initialOwner, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReleaseMutex(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextLengthW(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextW(IntPtr window, StringBuilder title, int maximumCount);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);

    public static IntPtr FindVisibleWindowByTitle(uint expectedProcessId, string expectedTitle) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            if (!IsWindowVisible(window)) {
                return true;
            }
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId != expectedProcessId) {
                return true;
            }
            int titleLength = GetWindowTextLengthW(window);
            if (titleLength != expectedTitle.Length) {
                return true;
            }
            StringBuilder title = new StringBuilder(titleLength + 1);
            if (GetWindowTextW(window, title, title.Capacity) != titleLength) {
                return true;
            }
            if (!String.Equals(title.ToString(), expectedTitle, StringComparison.Ordinal)) {
                return true;
            }
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }
}
"@
}

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Executable) { $Executable = Join-Path $desktopRoot "src-tauri\target\debug\esp-config-designer-desktop.exe" }
$Executable = [System.IO.Path]::GetFullPath($Executable)
if (-not $ResourceRoot) { $ResourceRoot = Join-Path $desktopRoot "resources\ecd-app" }
$resourceRoot = [System.IO.Path]::GetFullPath($ResourceRoot)
Assert-True (Test-Path -LiteralPath $Executable -PathType Leaf) "Tauri executable is missing: $Executable"
if (-not $UseExecutableResources) {
    Assert-True (Test-Path -LiteralPath (Join-Path $resourceRoot "backend\server.py") -PathType Leaf) "Packaged resources are missing: $resourceRoot"
}

$roots = New-Object System.Collections.Generic.List[string]
$processes = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$ports = New-Object System.Collections.Generic.List[int]
$externalMutex = [IntPtr]::Zero
$foreignListener = $null
$cleanupErrors = New-Object System.Collections.Generic.List[string]
$testFailure = $null
try {
    $simultaneousRoot = New-TestRoot "simultaneous"
    $roots.Add($simultaneousRoot)
    $simultaneousPort = Get-FreePort
    $ports.Add($simultaneousPort)
    $heldStart = New-TauriStartInfo $simultaneousRoot $simultaneousPort 3000
    $primary = [System.Diagnostics.Process]::Start($heldStart)
    $processes.Add($primary)
    Wait-StartupGuardOwned $primary
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $simultaneousRoot "appdata"))) "Primary wrote app-data before plugin initialization"
    Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $simultaneousRoot "workspace") -Force).Count -eq 0) "Primary wrote workspace data before plugin initialization"
    $secondary = [System.Diagnostics.Process]::Start($heldStart)
    $processes.Add($secondary)
    Start-Sleep -Milliseconds 750
    Assert-True (-not $primary.HasExited) "Primary exited during the widened startup window"
    Assert-True (-not $secondary.HasExited) "Secondary did not wait on the startup guard"
    Assert-True (@(Get-NetTCPConnection -LocalPort $simultaneousPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) "Backend started before the widened guard was released"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $simultaneousRoot "appdata"))) "Startup wrote app-data while the guard window was widened"
    Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $simultaneousRoot "workspace") -Force).Count -eq 0) "Startup wrote workspace data while the guard window was widened"
    $health = Wait-DesktopHealth $primary $simultaneousPort
    Assert-True ($health.mode -eq "desktop") "Simultaneous startup health mode is not desktop"
    Assert-True ($secondary.WaitForExit(30000)) "Secondary did not exit after primary IPC became ready"
    Assert-True ($secondary.ExitCode -eq 0) "Secondary exited with code $($secondary.ExitCode)"
    Assert-True (-not $primary.HasExited) "Secondary terminated the primary"
    Assert-OneListener $simultaneousPort
    $workspaceRecord = Join-Path $simultaneousRoot "appdata\workspace.json"
    Assert-True (Test-Path -LiteralPath $workspaceRecord -PathType Leaf) "Primary did not persist workspace.json"
    $record = Get-Content -LiteralPath $workspaceRecord -Raw | ConvertFrom-Json
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$record.workspace)) "workspace.json is invalid"
    Assert-True (-not (Test-Path -LiteralPath "$workspaceRecord.tmp")) "Concurrent workspace.json temporary write remains"
    Stop-ProcessTree $primary
    Wait-NoListener $simultaneousPort

    $crashRoot = New-TestRoot "abandoned"
    $roots.Add($crashRoot)
    $crashPort = Get-FreePort
    $ports.Add($crashPort)
    $crashStart = New-TauriStartInfo $crashRoot $crashPort 5000
    $crashedPrimary = [System.Diagnostics.Process]::Start($crashStart)
    $processes.Add($crashedPrimary)
    Wait-StartupGuardOwned $crashedPrimary
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $crashRoot "appdata"))) "Crash primary reached app-data setup before the forced termination"
    $takeover = [System.Diagnostics.Process]::Start($crashStart)
    $processes.Add($takeover)
    Start-Sleep -Milliseconds 750
    Assert-True (-not $takeover.HasExited) "Takeover process did not wait before primary crash"
    Assert-True (@(Get-NetTCPConnection -LocalPort $crashPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) "Crash scenario backend started before guard release"
    Stop-ProcessTree $crashedPrimary
    $crashHealth = Wait-DesktopHealth $takeover $crashPort
    Assert-True ($crashHealth.mode -eq "desktop") "Process did not recover the abandoned startup guard"
    Assert-OneListener $crashPort
    $warm = [System.Diagnostics.Process]::Start((New-TauriStartInfo $crashRoot $crashPort))
    $processes.Add($warm)
    Assert-True ($warm.WaitForExit(30000)) "Warm second launch did not exit"
    Assert-True ($warm.ExitCode -eq 0) "Warm second launch failed with code $($warm.ExitCode)"
    Assert-True (-not $takeover.HasExited) "Warm second launch terminated the recovered primary"
    Assert-OneListener $crashPort
    Stop-ProcessTree $takeover
    Wait-NoListener $crashPort

    $timeoutRoot = New-TestRoot "timeout"
    $roots.Add($timeoutRoot)
    $timeoutPort = Get-FreePort
    $ports.Add($timeoutPort)
    $externalMutex = [StartupGuardNative]::CreateMutexW([IntPtr]::Zero, $true, "Local\com.espconfigdesigner.desktop.startup-guard")
    Assert-True ($externalMutex -ne [IntPtr]::Zero) "Could not create timeout fixture mutex"
    $timedOut = [System.Diagnostics.Process]::Start((New-TauriStartInfo $timeoutRoot $timeoutPort))
    $processes.Add($timedOut)
    Start-Sleep -Seconds 11
    Assert-True (-not $timedOut.HasExited) "Timeout process exited without presenting its controlled error"
    Close-StartupErrorDialog $timedOut
    Assert-True ($timedOut.WaitForExit(10000)) "Timeout process did not exit after closing its error dialog"
    Assert-True ($timedOut.ExitCode -ne 0) "Startup guard timeout failed open"
    Assert-True (@(Get-NetTCPConnection -LocalPort $timeoutPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) "Timed-out process started a backend"
    Assert-True ([StartupGuardNative]::ReleaseMutex($externalMutex)) "Could not release timeout fixture mutex"
    Assert-True ([StartupGuardNative]::CloseHandle($externalMutex)) "Could not close timeout fixture mutex handle"
    $externalMutex = [IntPtr]::Zero
    $afterTimeout = [System.Diagnostics.Process]::Start((New-TauriStartInfo $timeoutRoot $timeoutPort))
    $processes.Add($afterTimeout)
    Wait-DesktopHealth $afterTimeout $timeoutPort | Out-Null
    Assert-OneListener $timeoutPort
    Stop-ProcessTree $afterTimeout
    Wait-NoListener $timeoutPort

    $foreignRoot = New-TestRoot "foreign-port"
    $roots.Add($foreignRoot)
    $foreignPort = Get-FreePort
    $ports.Add($foreignPort)
    $foreignListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $foreignPort)
    $foreignListener.Start()
    $portConflict = [System.Diagnostics.Process]::Start((New-TauriStartInfo $foreignRoot $foreignPort))
    $processes.Add($portConflict)
    Close-StartupErrorDialog $portConflict
    Assert-True ($portConflict.WaitForExit(10000)) "Port-conflict process did not exit"
    Assert-True ($portConflict.ExitCode -ne 0) "Foreign listener was treated as an ECD instance"
    Assert-True ($foreignListener.Server.IsBound) "ECD stopped the foreign listener"
    $foreignListener.Stop()
    $foreignListener = $null
    Wait-NoListener $foreignPort

} catch {
    $testFailure = $_
} finally {
    if ($foreignListener) {
        try {
            $foreignListener.Stop()
        } catch {
            $cleanupErrors.Add("Could not stop the foreign listener: $($_.Exception.Message)")
        }
    }
    if ($externalMutex -ne [IntPtr]::Zero) {
        try {
            Assert-True ([StartupGuardNative]::ReleaseMutex($externalMutex)) "Could not release the external timeout mutex"
        } catch {
            $cleanupErrors.Add("Could not release the external timeout mutex: $($_.Exception.Message)")
        }
        try {
            Assert-True ([StartupGuardNative]::CloseHandle($externalMutex)) "Could not close the external timeout mutex handle"
        } catch {
            $cleanupErrors.Add("Could not close the external timeout mutex handle: $($_.Exception.Message)")
        }
        $externalMutex = [IntPtr]::Zero
    }
    foreach ($process in $processes) {
        try {
            if ($process) { Stop-ProcessTree $process }
        } catch {
            $cleanupErrors.Add("Could not stop a test process: $($_.Exception.Message)")
        }
    }
    foreach ($port in $ports) {
        try {
            Wait-NoListener $port
        } catch {
            $cleanupErrors.Add("Could not clear test listener port $port`: $($_.Exception.Message)")
        }
    }
    foreach ($root in $roots) {
        try {
            if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
        } catch {
            $cleanupErrors.Add("Could not remove test root '$root': $($_.Exception.Message)")
        }
    }
}

if ($testFailure) {
    if ($cleanupErrors.Count -gt 0) {
        Write-Warning ("Cleanup also failed:`n- " + ($cleanupErrors -join "`n- "))
    }
    throw $testFailure
}
if ($cleanupErrors.Count -gt 0) {
    throw ("Simultaneous-start cleanup failed:`n- " + ($cleanupErrors -join "`n- "))
}

Write-Host "tauri simultaneous startup guard: PASS"
