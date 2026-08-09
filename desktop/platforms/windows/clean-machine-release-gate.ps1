[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ArtifactRoot,
    [Parameter(Mandatory = $true)][string]$ArtifactArchive,
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceSha,
    [Parameter(Mandatory = $true)][string]$ExpectedInstallerSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedApplicationSha256,
    [Parameter(Mandatory = $true)][string]$ArtifactRegister,
    [Parameter(Mandatory = $true)][string]$ExpectedArtifactRegisterSha256,
    [Parameter(Mandatory = $true)][string]$MatrixPolicy,
    [Parameter(Mandatory = $true)][string]$ExpectedMatrixPolicySha256,
    [Parameter(Mandatory = $true)][string]$TestKitRoot,
    [Parameter(Mandatory = $true)][string]$TestKitArchive,
    [Parameter(Mandatory = $true)]
    [ValidateSet("Preflight", "Lifecycle", "Startup", "FirmwareOnline", "FirmwareOffline", "Capabilities", "Report")]
    [string]$Scenario,
    [Parameter(Mandatory = $true)][string]$GateRoot,
    [Parameter(Mandatory = $true)][string]$ReportPath,
    [ValidateSet("", "Preflight", "Lifecycle", "Startup", "FirmwareOnline", "FirmwareOffline", "Capabilities")]
    [string]$ExpectedReportScenario = "",
    [string]$LifecycleInstallRoot = "",
    [string]$LifecycleWorkspaceRoot = "",
    [string]$LifecycleAppDataRoot = "",
    [ValidateSet("", "Begin", "Resume")][string]$LifecycleStage = "",
    [string]$ContractBootId = "",
    [string]$CleanVmAttestation = "",
    [string]$ExpectedCleanVmAttestationSha256 = "",
    [ValidateSet(
        "", "ApplicationHashMismatch", "MutableInstallWrite", "UninstallLeavesInstall",
        "UninstallDeletesWorkspace", "UninstallDeletesAppData", "UninstallCorruptsRetainedData", "ReinstallLosesMarkers", "ForcedCleanupOnly",
        "CleanupFirstResourceFailure", "RootCreatedAfterAbsentCheck", "MutableInstallDirectoryWrite",
        "UninstallRemovesEmptyWorkspaceDirectory", "UnicodeRootCreatedBeforeClaim"
    )][string]$ContractLifecycleFault = "",
    [switch]$ContractTest
)

$ErrorActionPreference = "Stop"
trap {
    Write-Error ("Clean-machine gate failed at line {0}: {1}" -f $_.InvocationInfo.ScriptLineNumber, $_.Exception.ToString())
    exit 1
}
$ownerMarkerName = ".ecd-clean-machine-owner.json"
$lifecycleRootMarkerName = ".ecd-lifecycle-root-owner.json"
$sha256Pattern = "^[0-9a-fA-F]{64}$"
$sourceShaPattern = "^[0-9a-fA-F]{40}$"
$statusValues = @("pass", "fail", "not_run")

if (-not ("CleanMachinePathNative" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CleanMachinePathNative {
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(IntPtr file, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint informationLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint informationLength, out uint returnLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(string applicationName, string commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);
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
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation {
        public BasicLimitInformation BasicLimitInformation; public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo {
        public uint Cb; public string Reserved, Desktop, Title; public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, Reserved2; public IntPtr ReservedPointer, StandardInput, StandardOutput, StandardError;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    public sealed class SuspendedProcess {
        public IntPtr ProcessHandle; public IntPtr ThreadHandle; public int ProcessId;
    }
    public static string FinalPath(string path) {
        IntPtr handle = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
        if (handle == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try {
            StringBuilder value = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandleW(handle, value, (uint)value.Capacity, 0);
            if (length == 0 || length >= value.Capacity) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            string result = value.ToString();
            if (result.StartsWith(@"\\?\UNC\", StringComparison.Ordinal)) return @"\\" + result.Substring(8);
            if (result.StartsWith(@"\\?\", StringComparison.Ordinal)) return result.Substring(4);
            return result;
        } finally { CloseHandle(handle); }
    }
    public static IntPtr FindVisibleWindow(uint expectedProcessId, string expectedTitle) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            if (!IsWindowVisible(window)) return true;
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processId != expectedProcessId) return true;
            int length = GetWindowTextLengthW(window);
            if (length != expectedTitle.Length) return true;
            StringBuilder title = new StringBuilder(length + 1);
            if (GetWindowTextW(window, title, title.Capacity) != length) return true;
            if (!String.Equals(title.ToString(), expectedTitle, StringComparison.Ordinal)) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }
    public static IntPtr CreateKillOnCloseJob() {
        IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        ExtendedLimitInformation limits = new ExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = 0x2000;
        int size = Marshal.SizeOf(typeof(ExtendedLimitInformation));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(job, 9, buffer, (uint)size)) {
                int error = Marshal.GetLastWin32Error(); CloseHandle(job);
                throw new System.ComponentModel.Win32Exception(error);
            }
        } finally { Marshal.FreeHGlobal(buffer); }
        return job;
    }
    public static void AssignToJob(IntPtr job, IntPtr process) {
        if (!AssignProcessToJobObject(job, process)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    public static int[] GetJobProcessIds(IntPtr job) {
        int capacity = 64;
        while (true) {
            int size = 8 + (IntPtr.Size * capacity);
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                uint returned;
                if (!QueryInformationJobObject(job, 3, buffer, (uint)size, out returned)) {
                    int error = Marshal.GetLastWin32Error();
                    if (error == 122 || error == 234) { capacity *= 2; continue; }
                    throw new System.ComponentModel.Win32Exception(error);
                }
                int count = Marshal.ReadInt32(buffer, 4);
                int[] result = new int[count];
                for (int index = 0; index < count; index++) {
                    result[index] = checked((int)Marshal.ReadIntPtr(buffer, 8 + (index * IntPtr.Size)).ToInt64());
                }
                return result;
            } finally { Marshal.FreeHGlobal(buffer); }
        }
    }
    public static void TerminateJob(IntPtr job) {
        if (!TerminateJobObject(job, 1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    public static SuspendedProcess CreateSuspendedProcess(string application, string currentDirectory) {
        StartupInfo startup = new StartupInfo(); startup.Cb = (uint)Marshal.SizeOf(typeof(StartupInfo));
        ProcessInformation information;
        if (!CreateProcessW(application, null, IntPtr.Zero, IntPtr.Zero, false, 0x00000004, IntPtr.Zero, currentDirectory, ref startup, out information)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        return new SuspendedProcess { ProcessHandle = information.Process, ThreadHandle = information.Thread, ProcessId = (int)information.ProcessId };
    }
    public static void ResumeSuspendedProcess(SuspendedProcess process) {
        if (ResumeThread(process.ThreadHandle) == 0xffffffff) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    public static bool TerminateSuspendedProcess(SuspendedProcess process) { return TerminateProcess(process.ProcessHandle, 1); }
    public static void CloseSuspendedProcessHandles(SuspendedProcess process) {
        if (process.ThreadHandle != IntPtr.Zero) { CloseHandle(process.ThreadHandle); process.ThreadHandle = IntPtr.Zero; }
        if (process.ProcessHandle != IntPtr.Zero) { CloseHandle(process.ProcessHandle); process.ProcessHandle = IntPtr.Zero; }
    }
    public static bool CloseOwnedHandle(IntPtr handle) { return CloseHandle(handle); }
}
"@
}

function Assert-AbsolutePath([string]$Path, [string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path)) {
        throw "$Name must be an absolute path"
    }
    $fullPath = [IO.Path]::GetFullPath($Path)
    foreach ($component in $fullPath.Substring([IO.Path]::GetPathRoot($fullPath).Length).Split('\')) {
        if ($component.EndsWith(" ") -or $component.EndsWith(".")) { throw "$Name contains a Windows-ambiguous path component" }
        if ($component.Contains(":") -or $component -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$') {
            throw "$Name contains an unsafe Windows path component"
        }
    }
    if ($fullPath.Length -gt [IO.Path]::GetPathRoot($fullPath).Length) { $fullPath = $fullPath.TrimEnd("\") }
    return $fullPath
}

function Get-PhysicalPath([string]$Path) {
    $fullPath = Assert-AbsolutePath $Path "path"
    $suffix = New-Object Collections.Generic.List[string]
    $current = $fullPath
    while (-not (Test-Path -LiteralPath $current)) {
        $suffix.Insert(0, (Split-Path -Leaf $current))
        $current = Split-Path -Parent $current
        if (-not $current) { throw "Path has no resolvable parent" }
    }
    $physical = [CleanMachinePathNative]::FinalPath($current)
    foreach ($component in $suffix) { $physical = Join-Path $physical $component }
    return (Assert-AbsolutePath $physical "path")
}

function Assert-NoReparsePath([string]$Path, [string]$Name) {
    $current = $Path
    while (-not (Test-Path -LiteralPath $current)) {
        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) { throw "$Name has no existing parent" }
        $current = $parent
    }
    while ($current) {
        $item = Get-Item -LiteralPath $current -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "$Name contains a reparse point: $current"
        }
        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }
}

function Test-PathOverlap([string]$First, [string]$Second) {
    $firstKey = Get-PhysicalPath $First
    $secondKey = Get-PhysicalPath $Second
    $firstKey = $firstKey.ToLowerInvariant()
    $secondKey = $secondKey.ToLowerInvariant()
    $firstPrefix = if ($firstKey.EndsWith("\")) { $firstKey } else { $firstKey + "\" }
    $secondPrefix = if ($secondKey.EndsWith("\")) { $secondKey } else { $secondKey + "\" }
    return $firstKey -eq $secondKey -or $firstKey.StartsWith($secondPrefix) -or $secondKey.StartsWith($firstPrefix)
}

function Assert-DescendantPath([string]$Child, [string]$Parent, [string]$Name) {
    $childKey = (Assert-AbsolutePath $Child $Name).ToLowerInvariant()
    $parentKey = (Assert-AbsolutePath $Parent "GateRoot").ToLowerInvariant()
    $parentPrefix = if ($parentKey.EndsWith("\")) { $parentKey } else { $parentKey + "\" }
    if (-not $childKey.StartsWith($parentPrefix)) { throw "$Name must be inside GateRoot" }
}

function Write-NewJsonFile([string]$Path, [object]$Value) {
    if (Test-Path -LiteralPath $Path) { throw "ReportPath already exists" }
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    Assert-NoReparsePath $parent "ReportPath parent"
    $temporary = Join-Path $parent (".ecd-report-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 20) + "`n", (New-Object Text.UTF8Encoding($false)))
        [IO.File]::Move($temporary, $Path)
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Test-ExactStatus([string]$Value) {
    return @($statusValues | Where-Object { [string]::Equals($_, $Value, [StringComparison]::Ordinal) }).Count -eq 1
}

function Read-JsonObject([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name is missing: $Path" }
    try {
        $value = [IO.File]::ReadAllText($Path, (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
    } catch {
        throw "$Name is malformed JSON"
    }
    if ($null -eq $value) { throw "$Name is empty" }
    return $value
}

function Assert-Hash([string]$Path, [string]$Expected, [string]$Name) {
    if ($Expected -notmatch $sha256Pattern) { throw "$Name expected hash is invalid" }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name is missing: $Path" }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        throw "$Name SHA-256 mismatch: expected $($Expected.ToLowerInvariant()), found $actual"
    }
    return $actual
}

function Assert-Sha256Sums([string]$Root, [string]$ExpectedManifestHash) {
    $manifestPath = Join-Path $Root "SHA256SUMS"
    Assert-Hash $manifestPath $ExpectedManifestHash "SHA256SUMS" | Out-Null
    $lines = @(Get-Content -LiteralPath $manifestPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($line in $lines) {
        if ($line -notmatch '^([0-9a-fA-F]{64})  ([^\\/]+)$') { throw "SHA256SUMS contains a malformed entry" }
        $name = $Matches[2]
        if (-not $seen.Add($name)) { throw "SHA256SUMS contains a duplicate entry: $name" }
        Assert-Hash (Join-Path $Root $name) $Matches[1] "SHA256SUMS entry $name" | Out-Null
    }
    $files = @(Get-ChildItem -LiteralPath $Root -File | Where-Object { $_.Name -ne "SHA256SUMS" })
    if ($files.Count -ne $seen.Count) { throw "SHA256SUMS does not cover the complete artifact file set" }
    foreach ($file in $files) {
        if (-not $seen.Contains($file.Name)) { throw "SHA256SUMS omits $($file.Name)" }
    }
}

function Get-AggregateHash([object[]]$Files) {
    $inputText = (@($Files | Sort-Object { [string]$_.path } | ForEach-Object { "$($_.path)`0$($_.length)`0$($_.sha256)`n" }) -join "")
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($inputText)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() } finally { $hasher.Dispose() }
}

function Assert-TestKit([string]$Root, [string]$Archive, [object]$Register) {
    Assert-Hash $Archive $Register.testKitSha256 "test-kit archive" | Out-Null
    $manifestPath = Join-Path $Root "kit-manifest.json"
    $manifest = Read-JsonObject $manifestPath "Test-kit manifest"
    $expectedStatus = if ($ContractTest) { "synthetic-contract-test" } else { "clean" }
    if ($manifest.schemaVersion -ne 1 -or $manifest.kind -ne "ecd-windows-clean-machine-kit" -or
        $manifest.sourceCommit -ne $ExpectedSourceSha -or $manifest.sourceStatus -ne $expectedStatus) {
        throw "Test-kit manifest source identity is invalid"
    }
    $files = @($manifest.files)
    $canonicalFiles = @("artifact-integrity.ps1", "clean-machine-release-gate.ps1", "fixtures/compile-only.yaml", "windows-matrix-policy.json")
    if ($files.Count -eq 0 -or $manifest.aggregateSha256 -notmatch $sha256Pattern -or
        $manifest.fixtureSha256 -ne $Register.fixtureSha256 -or
        $manifest.fixtureSha256 -ne "95eb66a5ec9aec4e095b138528892f0aa1414cd8c6fe5b045d4cf9ae8411c81f" -or
        $files.Count -ne $canonicalFiles.Count -or
        @($files | Where-Object { $canonicalFiles -cnotcontains $_.path }).Count -gt 0) {
        throw "Test-kit manifest is incomplete"
    }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $files) {
        if ([string]$file.path -notmatch '^[^:\\]+(?:/[^:\\]+)*$' -or [string]$file.sha256 -notmatch $sha256Pattern -or
            [int64]$file.length -lt 0 -or -not $seen.Add([string]$file.path)) {
            throw "Test-kit manifest contains an invalid file entry"
        }
        $path = Join-Path $Root ([string]$file.path).Replace("/", "\")
        Assert-NoReparsePath $path "Test-kit file $($file.path)"
        Assert-NoAlternateStreams $path "Test-kit file $($file.path)"
        if ((Get-Item -LiteralPath $path).Length -ne [int64]$file.length) { throw "Test-kit file length mismatch: $($file.path)" }
        Assert-Hash $path $file.sha256 "test-kit file $($file.path)" | Out-Null
    }
    if (-not $ContractTest) {
        $registeredMatrix = @($files | Where-Object { $_.path -eq "windows-matrix-policy.json" })
        if ($registeredMatrix.Count -ne 1 -or $registeredMatrix[0].sha256 -ne $ExpectedMatrixPolicySha256.ToLowerInvariant()) {
            throw "Production matrix policy does not match the exact test-kit policy bytes"
        }
    }
    $actualFiles = @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | ForEach-Object {
        $_.FullName.Substring($Root.Length + 1).Replace("\", "/")
    })
    $expectedFiles = @($seen) + "kit-manifest.json"
    if (@($actualFiles | Where-Object { $expectedFiles -notcontains $_ }).Count -gt 0 -or
        @($expectedFiles | Where-Object { $actualFiles -notcontains $_ }).Count -gt 0) {
        throw "Test-kit extracted file set does not match its manifest"
    }
    if ((Get-AggregateHash $files) -ne $manifest.aggregateSha256) { throw "Test-kit aggregate hash mismatch" }
    Assert-NoReparsePath $manifestPath "Test-kit manifest"
    Assert-NoAlternateStreams $manifestPath "Test-kit manifest"
    $actualDirectories = @(Get-ChildItem -LiteralPath $Root -Directory -Recurse -Force | ForEach-Object {
        $_.FullName.Substring($Root.Length + 1).Replace("\", "/")
    })
    if ($actualDirectories.Count -ne 1 -or $actualDirectories[0] -ne "fixtures") { throw "Test-kit directory set is invalid" }
    Add-Type -AssemblyName System.IO.Compression
    $stream = [IO.File]::OpenRead($Archive)
    try {
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
        try {
            $zipNames = @($zip.Entries | ForEach-Object { $_.FullName })
            if ($zipNames.Count -ne $expectedFiles.Count -or
                @($zipNames | Where-Object { $expectedFiles -cnotcontains $_ }).Count -gt 0 -or
                @($expectedFiles | Where-Object { $zipNames -cnotcontains $_ }).Count -gt 0) {
                throw "Test-kit archive file set does not match the extracted kit"
            }
            $zipSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
            $zipFolded = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
            foreach ($entry in $zip.Entries) {
                if ($entry.FullName.Contains("\") -or $entry.FullName.Contains(":") -or $entry.FullName.StartsWith("/") -or
                    @($entry.FullName.Split('/') | Where-Object { $_ -eq ".." -or $_ -eq "." }).Count -gt 0 -or
                    -not $zipSeen.Add($entry.FullName) -or -not $zipFolded.Add($entry.FullName) -or [string]::IsNullOrWhiteSpace($entry.Name)) {
                    throw "Test-kit archive contains an unsafe path"
                }
                $external = [uint32](([int64]$entry.ExternalAttributes) -band 0xffffffffL)
                $unixType = (($external -shr 16) -band 0xFFFF) -band 0xF000
                if (($external -band 0x0400) -ne 0 -or $unixType -eq 0xA000 -or
                    ($unixType -ne 0 -and $unixType -ne 0x8000)) {
                    throw "Test-kit archive contains a link, reparse, or special entry"
                }
                $extractedPath = Join-Path $Root $entry.FullName.Replace("/", "\")
                $entryStream = $entry.Open()
                $hasher = [Security.Cryptography.SHA256]::Create()
                try { $entryHash = ([BitConverter]::ToString($hasher.ComputeHash($entryStream))).Replace("-", "").ToLowerInvariant() } finally { $hasher.Dispose(); $entryStream.Dispose() }
                if ($entryHash -ne (Get-FileHash -LiteralPath $extractedPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
                    throw "Test-kit archive entry differs from the extracted kit: $($entry.FullName)"
                }
            }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
    $runningScriptHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $registeredScript = @($files | Where-Object { $_.path -eq "clean-machine-release-gate.ps1" })
    if ($registeredScript.Count -ne 1 -or $registeredScript[0].sha256 -ne $runningScriptHash) {
        throw "Running orchestrator does not match the verified test kit"
    }
}

function Assert-NoAlternateStreams([string]$Path, [string]$Name) {
    $streams = @(Get-Item -LiteralPath $Path -Stream * -ErrorAction Stop)
    if (Test-Path -LiteralPath $Path -PathType Container) {
        if (@($streams | Where-Object { $_.Stream -ne ':$DATA' }).Count -gt 0) { throw "$Name contains alternate data streams" }
        return
    }
    if ($streams.Count -ne 1 -or $streams[0].Stream -ne ':$DATA') { throw "$Name contains alternate data streams" }
}

function Get-ObservedPlatform {
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $processors = @(Get-CimInstance Win32_Processor)
    $windows = Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion"
    $systemType = [string]$computer.SystemType
    if ($systemType -match '(?i)ARM') { throw "Windows ARM64 is outside the clean-machine matrix" }
    if ($processors.Count -eq 0 -or @($processors | Where-Object { $_.AddressWidth -ne 64 }).Count -gt 0 -or
        $systemType -notmatch '(?i)x64') {
        throw "Only native Windows x64 is supported by this clean-machine kit"
    }
    $architecture = "x64"
    return [ordered]@{
        caption = [string]$os.Caption
        editionId = [string]$windows.EditionID
        version = [string]$os.Version
        build = "$($os.BuildNumber).$($windows.UBR)"
        architecture = $architecture
    }
}

function Assert-MatrixPolicy([object]$Policy, [string]$ProductVersion, [object]$Observed) {
    if ($Policy.schemaVersion -ne 1 -or $Policy.kind -ne "ecd-windows-matrix-policy" -or $Policy.productVersion -ne $ProductVersion) {
        throw "Matrix policy identity is invalid"
    }
    $entries = @($Policy.entries)
    if ($entries.Count -eq 0) { throw "Matrix policy has no entries" }
    $entryIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $entryTuples = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($entry in $entries) {
        $tuple = "$([string]$entry.editionId)`0$([string]$entry.build)`0$([string]$entry.architecture)"
        if ([string]::IsNullOrWhiteSpace([string]$entry.id) -or
            [string]$entry.editionId -notin @("Core", "Professional") -or
            [string]$entry.build -notmatch '^\d+\.\d+$' -or [string]$entry.architecture -ne "x64" -or
            -not $entryIds.Add([string]$entry.id) -or -not $entryTuples.Add($tuple)) {
            throw "Matrix policy contains an invalid or duplicate entry"
        }
    }
    $matches = @($entries | Where-Object {
        $_.editionId -eq $Observed.editionId -and
        $_.build -eq $Observed.build -and
        $_.architecture -eq $Observed.architecture
    })
    if ($matches.Count -ne 1) { throw "Observed OS/edition/build/architecture is not an exact matrix policy entry" }
    return [string]$matches[0].id
}

function Assert-ArtifactRegister([object]$Register) {
    if ($Register.schemaVersion -ne 1 -or $Register.kind -ne "ecd-windows-artifact-register") {
        throw "Artifact register identity is invalid"
    }
    if ($Register.sourceCommit -notmatch $sourceShaPattern -or $Register.sourceCommit -ne $ExpectedSourceSha) {
        throw "Artifact register source SHA mismatch"
    }
    if ($Register.candidateKind -ne "ecd-windows-unsigned-technical-candidate" -or
        $Register.candidateStatus -ne "unsigned technical candidate - not for users") {
        throw "Artifact register candidate identity is invalid"
    }
    if ([string]$Register.artifact.id -eq "" -or [string]$Register.artifact.name -eq "" -or
        [string]$Register.artifact.archiveDigest -notmatch '^sha256:[0-9a-fA-F]{64}$') {
        throw "Artifact register hosted artifact identity is invalid"
    }
    foreach ($value in @(
        $Register.sha256SumsSha256, $Register.provenanceSha256,
        $Register.installer.sha256, $Register.application.sha256,
        $Register.inventorySha256, $Register.noticesSha256,
        $Register.fixtureSha256, $Register.testKitSha256,
        $Register.runtimeManifestSha256, $Register.runtimePayloadSha256, $Register.resourceLayoutSha256
    )) {
        if ([string]$value -notmatch $sha256Pattern) { throw "Artifact register contains an invalid SHA-256" }
    }
    if ($Register.testKitSourceSha -ne $ExpectedSourceSha -or
        [string]::IsNullOrWhiteSpace([string]$Register.runtimeIdentity) -or
        [string]::IsNullOrWhiteSpace([string]$Register.resourceIdentity)) {
        throw "Artifact register runtime/resource/test-kit identity is incomplete"
    }
}

function Assert-Provenance([object]$Provenance, [object]$Register) {
    if ($Provenance.schemaVersion -ne 1 -or $Provenance.kind -ne $Register.candidateKind -or
        $Provenance.status -ne $Register.candidateStatus) {
        throw "Artifact provenance identity is invalid"
    }
    if ($Provenance.product.name -ne "ESPConfig Designer" -or $Provenance.product.version -ne $Register.productVersion -or
        $Provenance.source.commit -ne $ExpectedSourceSha -or $Provenance.source.status -ne "clean") {
        throw "Artifact provenance source is invalid"
    }
    $command = @($Provenance.build.command)
    if ($Provenance.build.mode -ne "release" -or $command.Count -ne 4 -or
        ($command -join " ") -ne "tauri build --bundles nsis" -or
        $Provenance.signing -ne "none" -or $Provenance.publication -ne "none") {
        throw "Artifact provenance release/signing/publication contract is invalid"
    }
    $application = @($Provenance.artifacts | Where-Object { $_.role -eq "application-exe" })
    $installer = @($Provenance.artifacts | Where-Object { $_.role -eq "nsis-installer" })
    if (@($Provenance.artifacts).Count -ne 2 -or $application.Count -ne 1 -or $installer.Count -ne 1) { throw "Artifact provenance artifact cardinality is invalid" }
    if ($application[0].file -ne $Register.application.file -or $application[0].sha256 -ne $Register.application.sha256 -or
        $application[0].signatureStatus -ne $Register.application.authenticodeStatus -or
        $installer[0].file -ne $Register.installer.file -or $installer[0].sha256 -ne $Register.installer.sha256 -or
        $installer[0].signatureStatus -ne $Register.installer.authenticodeStatus) {
        throw "Artifact provenance artifact claim does not match the register"
    }
    if ($Provenance.runtime.identity -ne $Register.runtimeIdentity -or
        $Provenance.runtime.manifestSha256 -ne $Register.runtimeManifestSha256 -or
        $Provenance.runtime.payloadSha256 -ne $Register.runtimePayloadSha256 -or
        $Provenance.resources.identity -ne $Register.resourceIdentity -or
        $Provenance.resources.layoutSha256 -ne $Register.resourceLayoutSha256 -or
        $Provenance.supplyChain.inventorySha256 -ne $Register.inventorySha256 -or
        $Provenance.supplyChain.noticesSha256 -ne $Register.noticesSha256 -or
        $Provenance.reproducibility -ne "controlled inputs; byte-for-byte reproducibility is not claimed") {
        throw "Artifact provenance runtime/resource/supply-chain identity does not match the register"
    }
    foreach ($tool in @("node", "npm", "rustc", "cargo", "tauri")) {
        if ([string]::IsNullOrWhiteSpace([string]$Provenance.build.tools.$tool)) { throw "Artifact provenance tool identity is incomplete" }
    }
}

function Assert-OwnedGateRoot(
    [string]$Root,
    [string]$SourceCommit,
    [string]$ArtifactRegisterSha256,
    [string]$TestKitSha256
) {
    $markerPath = Join-Path $Root $ownerMarkerName
    if (Test-Path -LiteralPath $Root) {
        if (-not (Test-Path -LiteralPath $Root -PathType Container) -or
            -not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
            throw "GateRoot exists without an ownership marker"
        }
        $marker = Read-JsonObject $markerPath "GateRoot ownership marker"
        Assert-NoReparsePath $markerPath "GateRoot ownership marker"
        Assert-NoAlternateStreams $markerPath "GateRoot ownership marker"
        if ($marker.schemaVersion -ne 1 -or $marker.kind -ne "ecd-clean-machine-gate-root" -or
            $marker.root -ne $Root -or [string]$marker.runId -notmatch '^[0-9a-f]{32}$' -or
            $marker.sourceCommit -ne $SourceCommit -or
            $marker.artifactRegisterSha256 -ne $ArtifactRegisterSha256 -or
            $marker.testKitSha256 -ne $TestKitSha256) {
            throw "GateRoot ownership marker is invalid"
        }
        if ($marker.PSObject.Properties.Name -contains "lifecycleStateSha256") {
            Assert-Hash (Join-Path $Root "lifecycle-owned-resources.json") ([string]$marker.lifecycleStateSha256) "Lifecycle owned-resource state" | Out-Null
        }
        return [string]$marker.runId
    }
    New-Item -ItemType Directory -Path $Root | Out-Null
    $runId = [guid]::NewGuid().ToString("N")
    $marker = [ordered]@{
        schemaVersion = 1
        kind = "ecd-clean-machine-gate-root"
        root = $Root
        runId = $runId
        sourceCommit = $SourceCommit
        artifactRegisterSha256 = $ArtifactRegisterSha256
        testKitSha256 = $TestKitSha256
    }
    [IO.File]::WriteAllText($markerPath, ($marker | ConvertTo-Json -Compress) + "`n", (New-Object Text.UTF8Encoding($false)))
    return $runId
}

function Get-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-AccountContext {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $administratorsSid = "S-1-5-32-544"
    $isAdministratorMember = @($identity.Groups | Where-Object { $_.Value -eq $administratorsSid }).Count -gt 0
    $sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    return [ordered]@{
        isElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        isAdministratorMember = $isAdministratorMember
        isInteractive = [Environment]::UserInteractive -and $sessionId -ne 0
        accountType = if ($isAdministratorMember) { "administrator-member" } else { "standard-user" }
    }
}

function Get-WebView2Version {
    foreach ($path in @(
        "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )) {
        if (Test-Path -LiteralPath $path) {
            $version = [string](Get-ItemProperty -LiteralPath $path).pv
            if ($version) { return $version }
        }
    }
    return "absent"
}

function Write-JsonAtomic([string]$Path, [object]$Value) {
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "JSON output parent is missing" }
    Assert-NoReparsePath $parent "JSON output parent"
    $temporary = Join-Path $parent (".ecd-state-" + [guid]::NewGuid().ToString("N") + ".tmp")
    $backup = Join-Path $parent (".ecd-state-" + [guid]::NewGuid().ToString("N") + ".bak")
    try {
        [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 20) + "`n", (New-Object Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $Path) {
            [IO.File]::Replace($temporary, $Path, $backup)
            Remove-Item -LiteralPath $backup -Force
        } else {
            [IO.File]::Move($temporary, $Path)
        }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    }
}

function Get-BootIdentity {
    if ($ContractTest) {
        if ([string]::IsNullOrWhiteSpace($ContractBootId)) { throw "ContractBootId is required for a contract-test Lifecycle" }
        return "contract:$ContractBootId"
    }
    if ($ContractBootId) { throw "ContractBootId is forbidden for production evidence" }
    $lastBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString("o")
    $machineGuid = [string](Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Cryptography").MachineGuid
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes("$machineGuid`0$lastBoot")
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() } finally { $hasher.Dispose() }
}

function Get-TreeIdentity([string]$Root) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "Tree root is missing: $Root" }
    Assert-NoReparsePath $Root "Tree root"
    Assert-NoAlternateStreams $Root "Tree root"
    $entries = New-Object Collections.Generic.List[object]
    foreach ($directory in @(Get-ChildItem -LiteralPath $Root -Directory -Recurse -Force | Sort-Object FullName)) {
        Assert-NoReparsePath $directory.FullName "Tree directory"
        Assert-NoAlternateStreams $directory.FullName "Tree directory"
        $entries.Add([ordered]@{
            type = "directory"
            path = $directory.FullName.Substring($Root.Length + 1).Replace("\", "/")
            length = [int64]0
            sha256 = ""
        })
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | Sort-Object FullName)) {
        Assert-NoReparsePath $file.FullName "Tree file"
        Assert-NoAlternateStreams $file.FullName "Tree file"
        $entries.Add([ordered]@{
            type = "file"
            path = $file.FullName.Substring($Root.Length + 1).Replace("\", "/")
            length = [int64]$file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    }
    $entryArray = $entries.ToArray()
    $inputText = (@($entryArray | Sort-Object { "$($_.type)`0$($_.path)" } | ForEach-Object {
        "$($_.type)`0$($_.path)`0$($_.length)`0$($_.sha256)`n"
    }) -join "")
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($inputText)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $aggregate = ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant() } finally { $hasher.Dispose() }
    return [ordered]@{ fileCount = $entryArray.Count; aggregateSha256 = $aggregate; files = $entryArray }
}

function New-OwnedLifecycleRoot([string]$Root, [string]$Category, [string]$RunId, [string]$Nonce) {
    $parent = Split-Path -Parent $Root
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "Lifecycle root parent must already exist: $Category"
    }
    try {
        New-Item -ItemType Directory -Path $Root -ErrorAction Stop | Out-Null
    } catch {
        throw "Could not claim new Lifecycle root '$Category': $($_.Exception.Message)"
    }
    $markerPath = Join-Path $Root $lifecycleRootMarkerName
    $marker = [ordered]@{
        schemaVersion = 1
        kind = "ecd-lifecycle-root-owner"
        root = $Root
        category = $Category
        runId = $RunId
        nonce = $Nonce
    }
    try {
        $stream = [IO.File]::Open($markerPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($marker | ConvertTo-Json -Compress) + "`n")
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
        } finally { $stream.Dispose() }
    } catch {
        throw "Could not mark new Lifecycle root '$Category': $($_.Exception.Message)"
    }
}

function Assert-OwnedLifecycleRoot([string]$Root, [string]$Category, [string]$RunId, [string]$Nonce) {
    $markerPath = Join-Path $Root $lifecycleRootMarkerName
    $marker = Read-JsonObject $markerPath "Lifecycle root ownership marker"
    Assert-NoReparsePath $markerPath "Lifecycle root ownership marker"
    Assert-NoAlternateStreams $markerPath "Lifecycle root ownership marker"
    if ($marker.schemaVersion -ne 1 -or $marker.kind -ne "ecd-lifecycle-root-owner" -or
        $marker.root -ne $Root -or $marker.category -ne $Category -or
        $marker.runId -ne $RunId -or $marker.nonce -ne $Nonce) {
        throw "Lifecycle root ownership marker is invalid: $Category"
    }
}

function Assert-TreeIdentity([object]$Expected, [string]$Root, [string]$Name) {
    $actual = Get-TreeIdentity $Root
    if ($actual.fileCount -ne $Expected.fileCount -or $actual.aggregateSha256 -ne $Expected.aggregateSha256) {
        throw "$Name changed"
    }
}

function Assert-LifecycleRoots {
    foreach ($entry in @(
        @("LifecycleInstallRoot", $LifecycleInstallRoot),
        @("LifecycleWorkspaceRoot", $LifecycleWorkspaceRoot),
        @("LifecycleAppDataRoot", $LifecycleAppDataRoot)
    )) {
        if ([string]::IsNullOrWhiteSpace([string]$entry[1])) { throw "$($entry[0]) is required for Lifecycle" }
    }
    $script:LifecycleInstallRoot = Assert-AbsolutePath $LifecycleInstallRoot "LifecycleInstallRoot"
    $script:LifecycleWorkspaceRoot = Assert-AbsolutePath $LifecycleWorkspaceRoot "LifecycleWorkspaceRoot"
    $script:LifecycleAppDataRoot = Assert-AbsolutePath $LifecycleAppDataRoot "LifecycleAppDataRoot"
    foreach ($entry in @(
        @("LifecycleInstallRoot", $script:LifecycleInstallRoot),
        @("LifecycleWorkspaceRoot", $script:LifecycleWorkspaceRoot),
        @("LifecycleAppDataRoot", $script:LifecycleAppDataRoot),
        @("LifecycleUnicodeWorkspaceRoot", $script:LifecycleUnicodeWorkspaceRoot),
        @("LifecycleUnicodeAppDataRoot", $script:LifecycleUnicodeAppDataRoot)
    )) { Assert-NoReparsePath $entry[1] $entry[0] }
    $roots = @(
        $ArtifactRoot, $GateRoot, $script:LifecycleInstallRoot, $script:LifecycleWorkspaceRoot,
        $script:LifecycleAppDataRoot, $script:LifecycleUnicodeWorkspaceRoot, $script:LifecycleUnicodeAppDataRoot
    )
    for ($left = 0; $left -lt $roots.Count; $left++) {
        for ($right = $left + 1; $right -lt $roots.Count; $right++) {
            if (Test-PathOverlap $roots[$left] $roots[$right]) { throw "Lifecycle roots overlap" }
        }
    }
    if ((Test-PathOverlap $ReportPath $script:LifecycleInstallRoot) -or
        (Test-PathOverlap $ReportPath $script:LifecycleWorkspaceRoot) -or
        (Test-PathOverlap $ReportPath $script:LifecycleAppDataRoot)) {
        throw "Lifecycle root overlaps GateRoot metadata"
    }
}

function Assert-LifecycleArtifactSet([object]$Register) {
    Assert-NoReparsePath $ArtifactRoot "ArtifactRoot"
    $allowedArtifactFiles = @(
        [string]$Register.application.file, [string]$Register.installer.file,
        "inventory.json", "provenance.json", "SHA256SUMS", "THIRD-PARTY-NOTICES.md", "UNSIGNED-NOT-FOR-USERS.txt"
    )
    $directories = @(Get-ChildItem -LiteralPath $ArtifactRoot -Directory -Force)
    $actualArtifactFiles = @(Get-ChildItem -LiteralPath $ArtifactRoot -File -Force)
    if ($directories.Count -ne 0 -or $actualArtifactFiles.Count -ne $allowedArtifactFiles.Count -or
        @($actualArtifactFiles | Where-Object { $allowedArtifactFiles -notcontains $_.Name }).Count -gt 0) {
        throw "Lifecycle candidate file set does not match the exact allowlist"
    }
    foreach ($file in $actualArtifactFiles) {
        Assert-NoReparsePath $file.FullName "Lifecycle artifact file $($file.Name)"
        Assert-NoAlternateStreams $file.FullName "Lifecycle artifact file $($file.Name)"
    }
    $installers = @(Get-ChildItem -LiteralPath $ArtifactRoot -File -Filter "*-setup.exe")
    if ($installers.Count -ne 1 -or $installers[0].FullName -ne $Installer -or $installers[0].Name -ne [string]$Register.installer.file) {
        throw "Lifecycle requires exactly one current registered installer"
    }
    $applications = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Where-Object { $_.Name -eq [string]$Register.application.file })
    if ($applications.Count -ne 1) { throw "Lifecycle candidate application selection is invalid" }
    Assert-Hash $Installer $Register.installer.sha256 "installer" | Out-Null
    Assert-Hash $applications[0].FullName $Register.application.sha256 "application" | Out-Null
    Assert-Sha256Sums $ArtifactRoot $Register.sha256SumsSha256
    $provenancePath = Join-Path $ArtifactRoot "provenance.json"
    Assert-Hash $provenancePath $Register.provenanceSha256 "provenance" | Out-Null
    Assert-Provenance (Read-JsonObject $provenancePath "Artifact provenance") $Register
    Assert-Hash (Join-Path $ArtifactRoot "inventory.json") $Register.inventorySha256 "inventory" | Out-Null
    Assert-Hash (Join-Path $ArtifactRoot "THIRD-PARTY-NOTICES.md") $Register.noticesSha256 "notices" | Out-Null
    if ((Get-AuthenticodeSignature -LiteralPath $Installer).Status -ne "NotSigned" -or
        (Get-AuthenticodeSignature -LiteralPath $applications[0].FullName).Status -ne "NotSigned") {
        throw "Lifecycle requires the registered unsigned NotSigned artifact set"
    }
}

function Assert-CleanVmAttestation([object]$Register, [string]$MatrixEntry) {
    if ($ContractTest) {
        if ($CleanVmAttestation -or $ExpectedCleanVmAttestationSha256) { throw "CleanVmAttestation is forbidden in contract-test mode" }
        return [ordered]@{ sha256 = "contract_test"; runNonce = "contract_test" }
    }
    if ([string]::IsNullOrWhiteSpace($CleanVmAttestation) -or $ExpectedCleanVmAttestationSha256 -notmatch $sha256Pattern) {
        throw "Production Lifecycle requires an authenticated clean-VM attestation and expected SHA-256"
    }
    $path = Assert-AbsolutePath $CleanVmAttestation "CleanVmAttestation"
    if ((Test-PathOverlap $path $GateRoot) -or (Test-PathOverlap $path $script:LifecycleInstallRoot) -or
        (Test-PathOverlap $path $script:LifecycleWorkspaceRoot) -or (Test-PathOverlap $path $script:LifecycleAppDataRoot)) {
        throw "CleanVmAttestation must be outside Lifecycle-owned roots"
    }
    Assert-NoReparsePath $path "CleanVmAttestation"
    Assert-NoAlternateStreams $path "CleanVmAttestation"
    $hash = Assert-Hash $path $ExpectedCleanVmAttestationSha256 "clean-VM attestation"
    $attestation = Read-JsonObject $path "Clean-VM attestation"
    if ($attestation.schemaVersion -ne 1 -or $attestation.kind -ne "ecd-clean-vm-attestation" -or
        $attestation.sourceCommit -ne $Register.sourceCommit -or
        $attestation.artifactRegisterSha256 -ne $ExpectedArtifactRegisterSha256 -or
        $attestation.testKitSha256 -ne $Register.testKitSha256 -or
        $attestation.matrixPolicySha256 -ne $ExpectedMatrixPolicySha256 -or
        $attestation.matrixEntryId -ne $MatrixEntry -or $attestation.cleanSnapshot -ne $true -or
        $attestation.nonElevatedUser -ne $true -or [string]$attestation.runNonce -notmatch '^[0-9a-fA-F]{64}$') {
        throw "Clean-VM attestation identity is invalid"
    }
    return [ordered]@{ sha256 = $hash; runNonce = ([string]$attestation.runNonce).ToLowerInvariant() }
}

function Write-LifecycleOwnedState([string]$Path, [object]$State) {
    Write-JsonAtomic $Path $State
    $markerPath = Join-Path $GateRoot $ownerMarkerName
    $marker = Read-JsonObject $markerPath "GateRoot ownership marker"
    $stateHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($marker.PSObject.Properties.Name -contains "lifecycleStateSha256") {
        $marker.lifecycleStateSha256 = $stateHash
    } else {
        $marker | Add-Member -NotePropertyName lifecycleStateSha256 -NotePropertyValue $stateHash
    }
    Write-JsonAtomic $markerPath $marker
}

function Write-SyntheticMarker([string]$Root, [string]$Name, [string]$RunId) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { New-Item -ItemType Directory -Path $Root -Force | Out-Null }
    $path = Join-Path $Root $Name
    [IO.File]::WriteAllText($path, "ecd-clean-machine:$RunId`n", (New-Object Text.UTF8Encoding($false)))
    return $path
}

function New-RetainedDataTree([string]$Root, [string]$RunId) {
    $retainedRoot = Join-Path $Root ".ecd-lifecycle-retained"
    New-Item -ItemType Directory -Path (Join-Path $retainedRoot "nested"), (Join-Path $retainedRoot "empty") -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $retainedRoot "identity.txt"), "run:$RunId`n", (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllBytes((Join-Path $retainedRoot "nested\payload.bin"), [byte[]](0, 17, 34, 51, 68, 85, 102, 119, 136, 153))
    return [ordered]@{ root = $retainedRoot; identity = Get-TreeIdentity $retainedRoot }
}

function Assert-RetainedDataTree([object]$Retained, [string]$Name) {
    Assert-TreeIdentity $Retained.identity $Retained.root $Name
}

function Assert-SyntheticMarker([string]$Path, [string]$RunId) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or [IO.File]::ReadAllText($Path) -ne "ecd-clean-machine:$RunId`n") {
        throw "Lifecycle synthetic marker was not retained"
    }
}

function Invoke-Nsis([string]$Executable, [string[]]$Arguments, [string]$Name) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "$Name failed with exit code $($process.ExitCode)" }
}

function Get-FreeLifecyclePort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Start-LifecycleApplication([string]$Executable, [string]$Workspace, [string]$AppData, [bool]$DefaultWorkspace) {
    $port = Get-FreeLifecyclePort
    $environment = [ordered]@{
        ECD_TAURI_APP_DATA_ROOT = $AppData
        ECD_TAURI_PORT = $port.ToString()
        ECD_TAURI_HEALTH_TIMEOUT_MS = "120000"
        USERPROFILE = [Environment]::GetEnvironmentVariable("USERPROFILE", [EnvironmentVariableTarget]::Process)
        ECD_TAURI_WORKSPACE = $null
    }
    if ($DefaultWorkspace) {
        if ((Split-Path -Leaf $Workspace) -ne "ecd_workspace" -or (Split-Path -Leaf (Split-Path -Parent $Workspace)) -ne "Documents") {
            throw "Default LifecycleWorkspaceRoot must end with Documents\ecd_workspace"
        }
        $environment.USERPROFILE = Split-Path -Parent (Split-Path -Parent $Workspace)
    } else {
        $environment.ECD_TAURI_WORKSPACE = $Workspace
    }
    $previousEnvironment = @{}
    foreach ($name in $environment.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
    }
    $jobHandle = [IntPtr]::Zero
    $suspended = $null
    try {
        $jobHandle = [CleanMachinePathNative]::CreateKillOnCloseJob()
        foreach ($name in $environment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $environment[$name], [EnvironmentVariableTarget]::Process)
        }
        $suspended = [CleanMachinePathNative]::CreateSuspendedProcess($Executable, $script:LifecycleInstallRoot)
        [CleanMachinePathNative]::AssignToJob($jobHandle, $suspended.ProcessHandle)
        $process = [Diagnostics.Process]::GetProcessById($suspended.ProcessId)
        [CleanMachinePathNative]::ResumeSuspendedProcess($suspended)
    } catch {
        $startError = $_.Exception.Message
        if ($suspended -and -not [CleanMachinePathNative]::TerminateSuspendedProcess($suspended)) {
            $startError += "; suspended-process termination also failed"
        }
        if ($jobHandle -ne [IntPtr]::Zero) { [CleanMachinePathNative]::CloseOwnedHandle($jobHandle) | Out-Null }
        throw "Could not start the Lifecycle application in its cleanup Job Object: $startError"
    } finally {
        foreach ($name in $previousEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], [EnvironmentVariableTarget]::Process)
        }
        if ($suspended) { [CleanMachinePathNative]::CloseSuspendedProcessHandles($suspended) }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) {
            [CleanMachinePathNative]::CloseOwnedHandle($jobHandle) | Out-Null
            throw "Installed application exited before desktop health with code $($process.ExitCode)"
        }
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $port) -TimeoutSec 2
            if ($health.mode -eq "desktop") { return [ordered]@{ process = $process; port = $port; jobHandle = $jobHandle } }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    [CleanMachinePathNative]::CloseOwnedHandle($jobHandle) | Out-Null
    throw "Installed application did not reach desktop health"
}

function Stop-LifecycleApplicationGracefully([object]$OwnedProcess) {
    $process = $OwnedProcess.process
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $window = [IntPtr]::Zero
    while ([DateTime]::UtcNow -lt $deadline -and -not $process.HasExited) {
        $window = [CleanMachinePathNative]::FindVisibleWindow([uint32]$process.Id, "ESPConfig Designer")
        if ($window -ne [IntPtr]::Zero) { break }
        Start-Sleep -Milliseconds 100
    }
    if ($window -eq [IntPtr]::Zero -or -not [CleanMachinePathNative]::PostMessageW($window, 0x0010, [UIntPtr]::Zero, [IntPtr]::Zero)) {
        throw "A real interactive application window was unavailable for graceful close"
    }
    if (-not $process.WaitForExit(30000)) { throw "Application did not exit after its real window was closed" }
    if ($process.ExitCode -ne 0) { throw "Application exited nonzero after its real window was closed" }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (@(Get-NetTCPConnection -LocalPort $OwnedProcess.port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
            if ($OwnedProcess.jobHandle -ne [IntPtr]::Zero) {
                Close-LifecycleJobAndWait $OwnedProcess
            }
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Application listener survived graceful close"
}

function Close-LifecycleJobAndWait([object]$OwnedProcess, [bool]$Force = $false) {
    if ($OwnedProcess.jobHandle -eq [IntPtr]::Zero) { return }
    $jobHandle = $OwnedProcess.jobHandle
    try {
        if ($Force) { [CleanMachinePathNative]::TerminateJob($jobHandle) }
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        while ([DateTime]::UtcNow -lt $deadline) {
            if (@([CleanMachinePathNative]::GetJobProcessIds($jobHandle)).Count -eq 0) { return }
            Start-Sleep -Milliseconds 100
        }
        throw "Owned Lifecycle Job Object processes survived cleanup"
    } finally {
        if (-not [CleanMachinePathNative]::CloseOwnedHandle($jobHandle)) { throw "Could not close the Lifecycle cleanup Job Object" }
        $OwnedProcess.jobHandle = [IntPtr]::Zero
    }
}

function Stop-OwnedLifecycleProcess([object]$OwnedProcess) {
    if ($null -eq $OwnedProcess -or $null -eq $OwnedProcess.process) { return }
    if ($OwnedProcess.jobHandle -ne [IntPtr]::Zero) {
        Close-LifecycleJobAndWait $OwnedProcess $true
        $OwnedProcess.process.WaitForExit(30000) | Out-Null
        return
    }
    if ($OwnedProcess.process.HasExited) { return }
    $actual = Get-Process -Id $OwnedProcess.process.Id -ErrorAction SilentlyContinue
    if ($null -eq $actual -or $actual.StartTime.ToUniversalTime() -ne $OwnedProcess.process.StartTime.ToUniversalTime()) {
        throw "Refusing to clean a process whose identity is no longer owned"
    }
    $taskkill = Start-Process -FilePath (Join-Path $env:SystemRoot "System32\taskkill.exe") -ArgumentList @("/PID", $actual.Id.ToString(), "/T", "/F") -Wait -PassThru -NoNewWindow
    if ($taskkill.ExitCode -ne 0 -and -not $OwnedProcess.process.HasExited) { throw "Could not clean the owned Lifecycle process" }
}

function New-LifecycleReport(
    [object]$Register,
    [object]$Observed,
    [string]$MatrixEntry,
    [string]$RunId,
    [string]$RegisterHash,
    [string]$MatrixHash,
    [DateTime]$StartedAt,
    [object[]]$Checks,
    [string]$CleanVmAttestationSha256,
    [string]$HostRunNonce
) {
    return [ordered]@{
        schemaVersion = 1; scenario = "Lifecycle"; startedAtUtc = $StartedAt.ToString("o"); endedAtUtc = [DateTime]::UtcNow.ToString("o")
        result = "pass"; sourceCommit = $Register.sourceCommit; productVersion = $Register.productVersion
        candidateKind = $Register.candidateKind; candidateStatus = $Register.candidateStatus
        artifactId = [string]$Register.artifact.id; artifactName = [string]$Register.artifact.name; archiveDigest = [string]$Register.artifact.archiveDigest
        sha256SumsSha256 = $Register.sha256SumsSha256; provenanceSha256 = $Register.provenanceSha256
        installerSha256 = $Register.installer.sha256; applicationSha256 = $Register.application.sha256
        runtimeIdentity = $Register.runtimeIdentity; resourceIdentity = $Register.resourceIdentity
        runtimeManifestSha256 = $Register.runtimeManifestSha256; runtimePayloadSha256 = $Register.runtimePayloadSha256; resourceLayoutSha256 = $Register.resourceLayoutSha256
        inventorySha256 = $Register.inventorySha256; noticesSha256 = $Register.noticesSha256; fixtureSha256 = $Register.fixtureSha256
        testKitSourceSha = $Register.testKitSourceSha; testKitSha256 = $Register.testKitSha256
        artifactRegisterSha256 = $RegisterHash; matrixPolicySha256 = $MatrixHash
        authenticodeStatus = "NotSigned"; osCaption = $Observed.caption; osEdition = $Observed.editionId; osVersion = $Observed.version
        osBuild = $Observed.build; architecture = $Observed.architecture; accountType = "standard-user"; isElevated = Get-IsElevated
        webView2Version = Get-WebView2Version; networkState = $script:LifecycleNetworkState; workspaceRootCategory = "gate-owned"; appDataRootCategory = "gate-owned"
        matrixEntryId = $MatrixEntry; evidenceClass = if ($ContractTest) { "contract_test" } else { "production" }; gateRunId = $RunId
        cleanVmAttestationSha256 = $CleanVmAttestationSha256; hostRunNonce = $HostRunNonce
        checks = $Checks
    }
}

function Invoke-LifecycleScenario(
    [object]$Register,
    [object]$Observed,
    [string]$MatrixEntry,
    [string]$RunId,
    [string]$RegisterHash,
    [string]$MatrixHash
) {
    if (-not $LifecycleStage) { throw "LifecycleStage Begin or Resume is required" }
    if (-not $ContractTest -and $ContractLifecycleFault) { throw "ContractLifecycleFault is forbidden for production evidence" }
    $accountContext = Get-AccountContext
    if (-not $ContractTest -and ($accountContext.isElevated -or $accountContext.isAdministratorMember -or -not $accountContext.isInteractive)) {
        throw "Lifecycle must run in an interactive session as a non-administrator standard user"
    }
    $script:LifecycleUnicodeWorkspaceRoot = Join-Path (Split-Path -Parent (Assert-AbsolutePath $LifecycleWorkspaceRoot "LifecycleWorkspaceRoot")) "ECD Workspace spaces zolc-$([char]0x017C)$([char]0x00F3)$([char]0x0142)$([char]0x0107)-$RunId"
    $script:LifecycleUnicodeAppDataRoot = Join-Path (Split-Path -Parent (Assert-AbsolutePath $LifecycleAppDataRoot "LifecycleAppDataRoot")) "ECD App Data spaces zolc-$([char]0x017C)$([char]0x00F3)$([char]0x0142)$([char]0x0107)-$RunId"
    Assert-LifecycleRoots
    Assert-LifecycleArtifactSet $Register
    $cleanVm = Assert-CleanVmAttestation $Register $MatrixEntry
    $startedAt = [DateTime]::UtcNow
    $statePath = Join-Path $GateRoot "lifecycle-owned-resources.json"
    $checkpointPath = Join-Path $GateRoot "lifecycle-reboot-checkpoint.json"
    $workspaceMarkerName = ".ecd-lifecycle-workspace-marker"
    $appDataMarkerName = ".ecd-lifecycle-appdata-marker"
    $installedExecutable = Join-Path $script:LifecycleInstallRoot ([string]$Register.application.file)
    $unicodeWorkspace = $script:LifecycleUnicodeWorkspaceRoot
    $unicodeAppData = $script:LifecycleUnicodeAppDataRoot
    $ownedProcess = $null
    $cleanupErrors = New-Object Collections.Generic.List[string]
    $scenarioFailure = $null
    $resumeClaimed = $false
    try {
        if ($LifecycleStage -eq "Begin") {
            if ((Test-Path -LiteralPath $statePath) -or (Test-Path -LiteralPath $checkpointPath) -or
                (Test-Path -LiteralPath $script:LifecycleInstallRoot) -or
                (Test-Path -LiteralPath $script:LifecycleWorkspaceRoot) -or
                (Test-Path -LiteralPath $script:LifecycleAppDataRoot) -or
                (Test-Path -LiteralPath $unicodeWorkspace) -or (Test-Path -LiteralPath $unicodeAppData)) {
                throw "Lifecycle Begin requires new, absent owned roots and state"
            }
            $resourceNonce = [guid]::NewGuid().ToString("N")
            $state = [ordered]@{
                schemaVersion = 1; kind = "ecd-lifecycle-owned-resources"; state = "active"
                runId = $RunId; sourceCommit = $Register.sourceCommit; artifactRegisterSha256 = $RegisterHash
                testKitSha256 = $Register.testKitSha256; matrixPolicySha256 = $MatrixHash; nonce = $resourceNonce
                installRoot = $script:LifecycleInstallRoot; workspaceRoot = $script:LifecycleWorkspaceRoot; appDataRoot = $script:LifecycleAppDataRoot
                unicodeWorkspaceRoot = $unicodeWorkspace; unicodeAppDataRoot = $unicodeAppData
                cleanVmAttestationSha256 = $cleanVm.sha256; hostRunNonce = $cleanVm.runNonce
                webView2BeforeInstall = Get-WebView2Version
            }
            Write-LifecycleOwnedState $statePath $state
            if ($ContractLifecycleFault -eq "RootCreatedAfterAbsentCheck") {
                New-Item -ItemType Directory -Path $script:LifecycleAppDataRoot | Out-Null
                [IO.File]::WriteAllText((Join-Path $script:LifecycleAppDataRoot "sentinel.txt"), "must survive")
            }
            New-OwnedLifecycleRoot $script:LifecycleInstallRoot "install" $RunId $resourceNonce
            New-OwnedLifecycleRoot $script:LifecycleWorkspaceRoot "workspace" $RunId $resourceNonce
            New-OwnedLifecycleRoot $script:LifecycleAppDataRoot "app-data" $RunId $resourceNonce
            if ($ContractTest) {
                Copy-Item -LiteralPath (Join-Path $ArtifactRoot ([string]$Register.application.file)) -Destination $installedExecutable
                [IO.File]::WriteAllText((Join-Path $script:LifecycleInstallRoot "uninstall.exe"), "synthetic")
                if ($ContractLifecycleFault -eq "ApplicationHashMismatch") { [IO.File]::AppendAllText($installedExecutable, "changed") }
            } else {
                Invoke-Nsis $Installer @("/S", "/D=$script:LifecycleInstallRoot") "Silent per-user install"
            }
            Assert-OwnedLifecycleRoot $script:LifecycleInstallRoot "install" $RunId $resourceNonce
            Assert-OwnedLifecycleRoot $script:LifecycleWorkspaceRoot "workspace" $RunId $resourceNonce
            Assert-OwnedLifecycleRoot $script:LifecycleAppDataRoot "app-data" $RunId $resourceNonce
            Assert-Hash $installedExecutable $Register.application.sha256 "installed application" | Out-Null
            $installIdentity = Get-TreeIdentity $script:LifecycleInstallRoot
            if ($ContractTest) {
                if ($ContractLifecycleFault -eq "ForcedCleanupOnly") { throw "Forced cleanup cannot satisfy graceful close" }
            } else {
                $ownedProcess = Start-LifecycleApplication $installedExecutable $script:LifecycleWorkspaceRoot $script:LifecycleAppDataRoot $true
                $workspace = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/workspace" -f $ownedProcess.port) -TimeoutSec 2
                if ($workspace.workspace.ready -ne $true) { throw "Default workspace is not ready" }
                if (-not [string]::Equals(
                    (Get-PhysicalPath ([string]$workspace.workspace.path)),
                    (Get-PhysicalPath $script:LifecycleWorkspaceRoot),
                    [StringComparison]::OrdinalIgnoreCase
                )) {
                    throw "Application did not use the gate-owned default workspace"
                }
                if (-not (Test-Path -LiteralPath (Join-Path $script:LifecycleAppDataRoot "workspace.json") -PathType Leaf)) {
                    throw "Application did not use the gate-owned app-data root"
                }
                Stop-LifecycleApplicationGracefully $ownedProcess
                $ownedProcess = $null
            }
            $workspaceMarker = Write-SyntheticMarker $script:LifecycleWorkspaceRoot $workspaceMarkerName $RunId
            $appDataMarker = Write-SyntheticMarker $script:LifecycleAppDataRoot $appDataMarkerName $RunId
            $workspaceRetained = New-RetainedDataTree $script:LifecycleWorkspaceRoot $RunId
            $appDataRetained = New-RetainedDataTree $script:LifecycleAppDataRoot $RunId
            $state | Add-Member -NotePropertyName workspaceRetainedSha256 -NotePropertyValue $workspaceRetained.identity.aggregateSha256
            $state | Add-Member -NotePropertyName appDataRetainedSha256 -NotePropertyValue $appDataRetained.identity.aggregateSha256
            $state | Add-Member -NotePropertyName workspaceRetainedEntryCount -NotePropertyValue $workspaceRetained.identity.fileCount
            $state | Add-Member -NotePropertyName appDataRetainedEntryCount -NotePropertyValue $appDataRetained.identity.fileCount
            Write-LifecycleOwnedState $statePath $state
            if ($ContractLifecycleFault -eq "MutableInstallWrite") { [IO.File]::WriteAllText((Join-Path $script:LifecycleInstallRoot "mutable.tmp"), "changed") }
            if ($ContractLifecycleFault -eq "MutableInstallDirectoryWrite") { New-Item -ItemType Directory -Path (Join-Path $script:LifecycleInstallRoot "mutable-empty") | Out-Null }
            Assert-TreeIdentity $installIdentity $script:LifecycleInstallRoot "Immutable install tree"
            if (-not $ContractTest) {
                $ownedProcess = Start-LifecycleApplication $installedExecutable $script:LifecycleWorkspaceRoot $script:LifecycleAppDataRoot $true
                Stop-LifecycleApplicationGracefully $ownedProcess
                $ownedProcess = $null
                Assert-TreeIdentity $installIdentity $script:LifecycleInstallRoot "Restarted application install tree"
            }
            Assert-SyntheticMarker $workspaceMarker $RunId
            Assert-SyntheticMarker $appDataMarker $RunId
            Assert-RetainedDataTree $workspaceRetained "Workspace retained-data tree after restart"
            Assert-RetainedDataTree $appDataRetained "App-data retained-data tree after restart"
            $workspaceBeforeSameVersionReinstall = Get-TreeIdentity $script:LifecycleWorkspaceRoot
            $appDataBeforeSameVersionReinstall = Get-TreeIdentity $script:LifecycleAppDataRoot
            if (-not $ContractTest) { Invoke-Nsis $Installer @("/S", "/D=$script:LifecycleInstallRoot") "Same-version reinstall" }
            if ($ContractLifecycleFault -eq "ReinstallLosesMarkers") { Remove-Item -LiteralPath $workspaceMarker -Force }
            Assert-TreeIdentity $workspaceBeforeSameVersionReinstall $script:LifecycleWorkspaceRoot "Workspace tree during same-version reinstall"
            Assert-TreeIdentity $appDataBeforeSameVersionReinstall $script:LifecycleAppDataRoot "App-data tree during same-version reinstall"
            Assert-SyntheticMarker $workspaceMarker $RunId
            Assert-SyntheticMarker $appDataMarker $RunId
            Assert-RetainedDataTree $workspaceRetained "Workspace retained-data tree after same-version reinstall"
            Assert-RetainedDataTree $appDataRetained "App-data retained-data tree after same-version reinstall"
            Assert-Hash $installedExecutable $Register.application.sha256 "reinstalled application" | Out-Null
            Assert-TreeIdentity $installIdentity $script:LifecycleInstallRoot "Same-version reinstalled install tree"
            $checkpoint = [ordered]@{
                schemaVersion = 1; kind = "ecd-lifecycle-reboot-checkpoint"; state = "awaiting_reboot"
                createdAtUtc = [DateTime]::UtcNow.ToString("o"); runId = $RunId; sourceCommit = $Register.sourceCommit
                artifactRegisterSha256 = $RegisterHash; testKitSha256 = $Register.testKitSha256
                matrixPolicySha256 = $MatrixHash
                installerSha256 = $Register.installer.sha256; applicationSha256 = $Register.application.sha256
                nonce = $resourceNonce; installRoot = $script:LifecycleInstallRoot; workspaceRoot = $script:LifecycleWorkspaceRoot
                appDataRoot = $script:LifecycleAppDataRoot; bootIdentityBefore = Get-BootIdentity
                installTreeSha256 = $installIdentity.aggregateSha256
                cleanVmAttestationSha256 = $cleanVm.sha256; hostRunNonce = $cleanVm.runNonce
                workspaceRetainedSha256 = $workspaceRetained.identity.aggregateSha256
                appDataRetainedSha256 = $appDataRetained.identity.aggregateSha256
                workspaceRetainedEntryCount = $workspaceRetained.identity.fileCount
                appDataRetainedEntryCount = $appDataRetained.identity.fileCount
            }
            Write-JsonAtomic $checkpointPath $checkpoint
            $state | Add-Member -NotePropertyName checkpointSha256 -NotePropertyValue ((Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant())
            Write-LifecycleOwnedState $statePath $state
            Write-Host "[info] Lifecycle checkpoint persisted; perform a real system reboot and resume the same run"
            if ($ContractLifecycleFault -eq "CleanupFirstResourceFailure") { throw "Synthetic first cleanup resource failed" }
            return
        }

        if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw "Lifecycle owned-resource state is missing" }
        if (-not (Test-Path -LiteralPath $checkpointPath -PathType Leaf)) { throw "Lifecycle reboot checkpoint is missing" }
        Assert-NoReparsePath $statePath "Lifecycle owned-resource state"
        Assert-NoAlternateStreams $statePath "Lifecycle owned-resource state"
        $state = Read-JsonObject $statePath "Lifecycle owned-resource state"
        if ([string]$state.checkpointSha256 -notmatch $sha256Pattern) { throw "Lifecycle owned-resource state is forged or mismatched" }
        Assert-NoReparsePath $checkpointPath "Lifecycle reboot checkpoint"
        Assert-NoAlternateStreams $checkpointPath "Lifecycle reboot checkpoint"
        Assert-Hash $checkpointPath $state.checkpointSha256 "Lifecycle reboot checkpoint" | Out-Null
        $checkpoint = Read-JsonObject $checkpointPath "Lifecycle reboot checkpoint"
        if ($state.state -eq "completed" -or $checkpoint.state -eq "completed" -or $checkpoint.state -eq "resume_claimed") {
            throw "Lifecycle reboot checkpoint is stale, replayed, forged, or mismatched"
        }
        if ($state.schemaVersion -ne 1 -or $state.kind -ne "ecd-lifecycle-owned-resources" -or $state.state -ne "active" -or
            [string]$state.nonce -notmatch '^[0-9a-f]{32}$') {
            throw "Lifecycle owned-resource state is forged or mismatched"
        }
        foreach ($binding in @(
            @("runId", $RunId), @("sourceCommit", [string]$Register.sourceCommit),
            @("artifactRegisterSha256", $RegisterHash), @("testKitSha256", [string]$Register.testKitSha256),
            @("matrixPolicySha256", $MatrixHash),
            @("installRoot", $script:LifecycleInstallRoot), @("workspaceRoot", $script:LifecycleWorkspaceRoot),
            @("appDataRoot", $script:LifecycleAppDataRoot), @("unicodeWorkspaceRoot", $unicodeWorkspace),
            @("unicodeAppDataRoot", $unicodeAppData), @("cleanVmAttestationSha256", [string]$cleanVm.sha256),
            @("hostRunNonce", [string]$cleanVm.runNonce)
        )) {
            if ([string]$state.($binding[0]) -ne [string]$binding[1]) { throw "Lifecycle owned-resource state binding is mismatched: $($binding[0])" }
        }
        $createdAt = [DateTimeOffset]::MinValue
        if ($checkpoint.schemaVersion -ne 1 -or $checkpoint.kind -ne "ecd-lifecycle-reboot-checkpoint" -or
            $checkpoint.state -ne "awaiting_reboot" -or
            -not [DateTimeOffset]::TryParse([string]$checkpoint.createdAtUtc, [ref]$createdAt) -or
            $createdAt.Offset -ne [TimeSpan]::Zero -or $createdAt -gt [DateTimeOffset]::UtcNow -or
            $createdAt -lt [DateTimeOffset]::UtcNow.AddDays(-7) -or
            $checkpoint.runId -ne $RunId -or $checkpoint.sourceCommit -ne $Register.sourceCommit -or
            $checkpoint.artifactRegisterSha256 -ne $RegisterHash -or $checkpoint.testKitSha256 -ne $Register.testKitSha256 -or
            $checkpoint.matrixPolicySha256 -ne $MatrixHash -or
            $checkpoint.installerSha256 -ne $Register.installer.sha256 -or $checkpoint.applicationSha256 -ne $Register.application.sha256 -or
            $checkpoint.nonce -ne $state.nonce -or $checkpoint.installRoot -ne $state.installRoot -or
            $checkpoint.workspaceRoot -ne $state.workspaceRoot -or $checkpoint.appDataRoot -ne $state.appDataRoot -or
            $checkpoint.cleanVmAttestationSha256 -ne $state.cleanVmAttestationSha256 -or
            $checkpoint.hostRunNonce -ne $state.hostRunNonce -or
            $checkpoint.workspaceRetainedSha256 -ne $state.workspaceRetainedSha256 -or
            $checkpoint.appDataRetainedSha256 -ne $state.appDataRetainedSha256 -or
            $checkpoint.workspaceRetainedEntryCount -ne $state.workspaceRetainedEntryCount -or
            $checkpoint.appDataRetainedEntryCount -ne $state.appDataRetainedEntryCount) {
            throw "Lifecycle reboot checkpoint is stale, replayed, forged, or mismatched"
        }
        $bootIdentityAfter = Get-BootIdentity
        if ($bootIdentityAfter -eq $checkpoint.bootIdentityBefore) { throw "Lifecycle resume requires a real system reboot" }
        $checkpoint.state = "resume_claimed"
        $checkpoint | Add-Member -NotePropertyName resumedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString("o"))
        $checkpoint | Add-Member -NotePropertyName bootIdentityAfter -NotePropertyValue $bootIdentityAfter
        Write-JsonAtomic $checkpointPath $checkpoint
        $state.checkpointSha256 = (Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-LifecycleOwnedState $statePath $state
        $resumeClaimed = $true
        Assert-Hash $installedExecutable $Register.application.sha256 "post-reboot installed application" | Out-Null
        $postRebootInstallIdentity = Get-TreeIdentity $script:LifecycleInstallRoot
        if ($postRebootInstallIdentity.aggregateSha256 -ne $checkpoint.installTreeSha256) { throw "Post-reboot immutable install tree changed" }
        Assert-SyntheticMarker (Join-Path $script:LifecycleWorkspaceRoot $workspaceMarkerName) $RunId
        Assert-SyntheticMarker (Join-Path $script:LifecycleAppDataRoot $appDataMarkerName) $RunId
        $workspaceRetained = [ordered]@{ root = Join-Path $script:LifecycleWorkspaceRoot ".ecd-lifecycle-retained"; identity = [ordered]@{ fileCount = $state.workspaceRetainedEntryCount; aggregateSha256 = $state.workspaceRetainedSha256 } }
        $appDataRetained = [ordered]@{ root = Join-Path $script:LifecycleAppDataRoot ".ecd-lifecycle-retained"; identity = [ordered]@{ fileCount = $state.appDataRetainedEntryCount; aggregateSha256 = $state.appDataRetainedSha256 } }
        Assert-RetainedDataTree $workspaceRetained "Workspace retained-data tree after reboot"
        Assert-RetainedDataTree $appDataRetained "App-data retained-data tree after reboot"
        if (-not $ContractTest) {
            $ownedProcess = Start-LifecycleApplication $installedExecutable $script:LifecycleWorkspaceRoot $script:LifecycleAppDataRoot $true
            Stop-LifecycleApplicationGracefully $ownedProcess
            $ownedProcess = $null
            Assert-TreeIdentity $postRebootInstallIdentity $script:LifecycleInstallRoot "Post-reboot application start install tree"
            $uninstaller = Join-Path $script:LifecycleInstallRoot "uninstall.exe"
            if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw "Registered installation has no uninstaller" }
            $workspaceBeforeUninstall = Get-TreeIdentity $script:LifecycleWorkspaceRoot
            $appDataBeforeUninstall = Get-TreeIdentity $script:LifecycleAppDataRoot
            Invoke-Nsis $uninstaller @("/S") "Uninstall"
        } else {
            $workspaceBeforeUninstall = Get-TreeIdentity $script:LifecycleWorkspaceRoot
            $appDataBeforeUninstall = Get-TreeIdentity $script:LifecycleAppDataRoot
            if ($ContractLifecycleFault -ne "UninstallLeavesInstall") { Remove-Item -LiteralPath $script:LifecycleInstallRoot -Recurse -Force }
        }
        if ($ContractLifecycleFault -eq "UninstallDeletesWorkspace") { Remove-Item -LiteralPath $script:LifecycleWorkspaceRoot -Recurse -Force }
        if ($ContractLifecycleFault -eq "UninstallDeletesAppData") { Remove-Item -LiteralPath $script:LifecycleAppDataRoot -Recurse -Force }
        if ($ContractLifecycleFault -eq "UninstallCorruptsRetainedData") {
            Remove-Item -LiteralPath (Join-Path $script:LifecycleWorkspaceRoot ".ecd-lifecycle-retained\nested\payload.bin") -Force
        }
        if ($ContractLifecycleFault -eq "UninstallRemovesEmptyWorkspaceDirectory") {
            Remove-Item -LiteralPath (Join-Path $script:LifecycleWorkspaceRoot ".ecd-lifecycle-retained\empty") -Force
        }
        if (Test-Path -LiteralPath $script:LifecycleInstallRoot) { throw "Uninstall did not remove the install root" }
        Assert-TreeIdentity $workspaceBeforeUninstall $script:LifecycleWorkspaceRoot "Workspace tree during uninstall"
        Assert-TreeIdentity $appDataBeforeUninstall $script:LifecycleAppDataRoot "App-data tree during uninstall"
        Assert-SyntheticMarker (Join-Path $script:LifecycleWorkspaceRoot $workspaceMarkerName) $RunId
        Assert-SyntheticMarker (Join-Path $script:LifecycleAppDataRoot $appDataMarkerName) $RunId
        Assert-RetainedDataTree $workspaceRetained "Workspace retained-data tree after uninstall"
        Assert-RetainedDataTree $appDataRetained "App-data retained-data tree after uninstall"
        $workspaceBeforeReinstall = Get-TreeIdentity $script:LifecycleWorkspaceRoot
        $appDataBeforeReinstall = Get-TreeIdentity $script:LifecycleAppDataRoot
        New-OwnedLifecycleRoot $script:LifecycleInstallRoot "install" $RunId ([string]$state.nonce)
        if ($ContractTest) {
            Copy-Item -LiteralPath (Join-Path $ArtifactRoot ([string]$Register.application.file)) -Destination $installedExecutable
            [IO.File]::WriteAllText((Join-Path $script:LifecycleInstallRoot "uninstall.exe"), "synthetic")
        } else {
            Invoke-Nsis $Installer @("/S", "/D=$script:LifecycleInstallRoot") "Reinstall after uninstall"
        }
        Assert-OwnedLifecycleRoot $script:LifecycleInstallRoot "install" $RunId ([string]$state.nonce)
        if ($ContractLifecycleFault -eq "ReinstallLosesMarkers") { Remove-Item -LiteralPath (Join-Path $script:LifecycleAppDataRoot $appDataMarkerName) -Force }
        Assert-TreeIdentity $workspaceBeforeReinstall $script:LifecycleWorkspaceRoot "Workspace tree during reinstall after uninstall"
        Assert-TreeIdentity $appDataBeforeReinstall $script:LifecycleAppDataRoot "App-data tree during reinstall after uninstall"
        Assert-Hash $installedExecutable $Register.application.sha256 "reinstalled application" | Out-Null
        Assert-SyntheticMarker (Join-Path $script:LifecycleWorkspaceRoot $workspaceMarkerName) $RunId
        Assert-SyntheticMarker (Join-Path $script:LifecycleAppDataRoot $appDataMarkerName) $RunId
        Assert-RetainedDataTree $workspaceRetained "Workspace retained-data tree after reinstall"
        Assert-RetainedDataTree $appDataRetained "App-data retained-data tree after reinstall"
        if ((Test-PathOverlap $unicodeWorkspace $unicodeAppData) -or
            (Test-PathOverlap $unicodeWorkspace $script:LifecycleInstallRoot) -or
            (Test-PathOverlap $unicodeAppData $script:LifecycleInstallRoot)) {
            throw "Unicode Lifecycle roots overlap"
        }
        if ($ContractLifecycleFault -eq "UnicodeRootCreatedBeforeClaim") {
            New-Item -ItemType Directory -Path $unicodeWorkspace | Out-Null
            [IO.File]::WriteAllText((Join-Path $unicodeWorkspace "sentinel.txt"), "must survive")
        }
        New-OwnedLifecycleRoot $unicodeWorkspace "unicode-workspace" $RunId ([string]$state.nonce)
        New-OwnedLifecycleRoot $unicodeAppData "unicode-app-data" $RunId ([string]$state.nonce)
        $unicodeWorkspaceMarker = Write-SyntheticMarker $unicodeWorkspace $workspaceMarkerName $RunId
        $unicodeAppDataMarker = Write-SyntheticMarker $unicodeAppData $appDataMarkerName $RunId
        $unicodeInstallIdentity = Get-TreeIdentity $script:LifecycleInstallRoot
        if (-not $ContractTest) {
            $ownedProcess = Start-LifecycleApplication $installedExecutable $unicodeWorkspace $unicodeAppData $false
            Stop-LifecycleApplicationGracefully $ownedProcess
            $ownedProcess = $null
            Assert-TreeIdentity $unicodeInstallIdentity $script:LifecycleInstallRoot "Unicode application start install tree"
        }
        Assert-SyntheticMarker $unicodeWorkspaceMarker $RunId
        Assert-SyntheticMarker $unicodeAppDataMarker $RunId
        $workspaceBeforeFinalUninstall = Get-TreeIdentity $script:LifecycleWorkspaceRoot
        $appDataBeforeFinalUninstall = Get-TreeIdentity $script:LifecycleAppDataRoot
        $unicodeWorkspaceBeforeFinalUninstall = Get-TreeIdentity $unicodeWorkspace
        $unicodeAppDataBeforeFinalUninstall = Get-TreeIdentity $unicodeAppData
        if ($ContractTest) {
            Remove-Item -LiteralPath $script:LifecycleInstallRoot -Recurse -Force
        } else {
            Invoke-Nsis (Join-Path $script:LifecycleInstallRoot "uninstall.exe") @("/S") "Final uninstall"
        }
        if (Test-Path -LiteralPath $script:LifecycleInstallRoot) { throw "Final cleanup left the install root" }
        Assert-TreeIdentity $workspaceBeforeFinalUninstall $script:LifecycleWorkspaceRoot "Workspace tree during final uninstall"
        Assert-TreeIdentity $appDataBeforeFinalUninstall $script:LifecycleAppDataRoot "App-data tree during final uninstall"
        Assert-TreeIdentity $unicodeWorkspaceBeforeFinalUninstall $unicodeWorkspace "Unicode workspace tree during final uninstall"
        Assert-TreeIdentity $unicodeAppDataBeforeFinalUninstall $unicodeAppData "Unicode app-data tree during final uninstall"
        foreach ($marker in @(
            (Join-Path $script:LifecycleWorkspaceRoot $workspaceMarkerName), (Join-Path $script:LifecycleAppDataRoot $appDataMarkerName),
            $unicodeWorkspaceMarker, $unicodeAppDataMarker
        )) { Assert-SyntheticMarker $marker $RunId }
        $script:LifecycleNetworkState = if ($ContractTest) {
            "contract_test_not_observed"
        } elseif ($state.webView2BeforeInstall -eq "absent") {
            "webview2_absent_install_succeeded_network_not_observed"
        } else {
            "not_required_webview2_present"
        }
        $checkEvidence = if ($ContractTest) { "Contract simulation" } else { "Production execution" }
        $checks = @(
            [ordered]@{ name = "artifact_identity"; status = "pass"; summary = "$checkEvidence reverified registered hashes, provenance, and NotSigned state" },
            [ordered]@{ name = "preflight_receipt"; status = "pass"; summary = "$checkEvidence verified the receipt binding for this run and artifact set" },
            [ordered]@{ name = "root_ownership"; status = "pass"; summary = "$checkEvidence verified Lifecycle root ownership" },
            [ordered]@{ name = "isolated_roots"; status = "pass"; summary = "$checkEvidence verified disjoint install, metadata, workspace, app-data, and artifact roots" },
            [ordered]@{ name = "silent_per_user_install"; status = "pass"; summary = "$checkEvidence exercised the isolated per-user install contract" },
            [ordered]@{ name = "installed_application_hash"; status = "pass"; summary = "$checkEvidence verified the installed application hash contract" },
            [ordered]@{ name = "immutable_install_tree"; status = "pass"; summary = "$checkEvidence verified immutable install-tree checks" },
            [ordered]@{ name = "desktop_health"; status = "pass"; summary = "$checkEvidence exercised required desktop-health handling" },
            [ordered]@{ name = "default_workspace"; status = "pass"; summary = "$checkEvidence exercised gate-owned default workspace handling" },
            [ordered]@{ name = "graceful_close"; status = "pass"; summary = "$checkEvidence exercised real-window close requirements without treating forced cleanup as evidence" },
            [ordered]@{ name = "marker_restart"; status = "pass"; summary = "$checkEvidence verified marker retention across restart" },
            [ordered]@{ name = "same_version_reinstall"; status = "pass"; summary = "$checkEvidence exercised same-version reinstall data retention" },
            [ordered]@{ name = "reboot_resume"; status = "pass"; summary = "$checkEvidence exercised changed-boot same-run Resume binding" },
            [ordered]@{ name = "uninstall_removed_install"; status = "pass"; summary = "$checkEvidence exercised complete install-root removal" },
            [ordered]@{ name = "uninstall_preserved_data"; status = "pass"; summary = "$checkEvidence exercised workspace and app-data preservation" },
            [ordered]@{ name = "reinstall_retained_data"; status = "pass"; summary = "$checkEvidence exercised retained-data reuse" },
            [ordered]@{ name = "unicode_paths"; status = "pass"; summary = "$checkEvidence exercised separate spaces and Unicode roots" },
            [ordered]@{ name = "final_cleanup"; status = "pass"; summary = "$checkEvidence exercised independent owned process, listener, and install cleanup" }
        )
        $checkpoint.state = "completed"
        $checkpoint | Add-Member -NotePropertyName completedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString("o"))
        Write-JsonAtomic $checkpointPath $checkpoint
        $state.checkpointSha256 = (Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $state.state = "completed"
        Write-LifecycleOwnedState $statePath $state
        $report = New-LifecycleReport $Register $Observed $MatrixEntry $RunId $RegisterHash $MatrixHash $startedAt $checks ([string]$state.cleanVmAttestationSha256) ([string]$state.hostRunNonce)
        Assert-Report ([pscustomobject]$report) $Register $Observed $MatrixEntry $RunId
        Write-NewJsonFile $ReportPath $report
        Write-Host "[info] Lifecycle scenario: PASS"
    } catch {
        $scenarioFailure = $_
    } finally {
        $cleanupPort = if ($ownedProcess) { [int]$ownedProcess.port } else { 0 }
        if ($ownedProcess) {
            try { Stop-OwnedLifecycleProcess $ownedProcess } catch { $cleanupErrors.Add($_.Exception.Message) }
        }
        if ($cleanupPort -gt 0) {
            try {
                $deadline = [DateTime]::UtcNow.AddSeconds(30)
                while ([DateTime]::UtcNow -lt $deadline -and
                    @(Get-NetTCPConnection -LocalPort $cleanupPort -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
                    Start-Sleep -Milliseconds 100
                }
                if (@(Get-NetTCPConnection -LocalPort $cleanupPort -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
                    throw "Owned Lifecycle listener survived cleanup"
                }
            } catch { $cleanupErrors.Add($_.Exception.Message) }
        }
        if ($scenarioFailure -and ($LifecycleStage -eq "Begin" -or $resumeClaimed) -and
            (Test-Path -LiteralPath $statePath -PathType Leaf)) {
            try {
                $cleanupState = Read-JsonObject $statePath "Lifecycle cleanup ownership state"
                if ($cleanupState.runId -ne $RunId -or $cleanupState.sourceCommit -ne $Register.sourceCommit -or
                    $cleanupState.artifactRegisterSha256 -ne $RegisterHash -or $cleanupState.testKitSha256 -ne $Register.testKitSha256 -or
                    $cleanupState.matrixPolicySha256 -ne $MatrixHash -or
                    $cleanupState.installRoot -ne $script:LifecycleInstallRoot -or $cleanupState.workspaceRoot -ne $script:LifecycleWorkspaceRoot -or
                    $cleanupState.appDataRoot -ne $script:LifecycleAppDataRoot -or $cleanupState.unicodeWorkspaceRoot -ne $unicodeWorkspace -or
                    $cleanupState.unicodeAppDataRoot -ne $unicodeAppData -or [string]$cleanupState.nonce -notmatch '^[0-9a-f]{32}$') {
                    throw "Lifecycle cleanup ownership state is invalid"
                }
                $cleanupRoots = @(
                    [pscustomobject]@{ root = $script:LifecycleInstallRoot; category = "install" }
                    [pscustomobject]@{ root = $unicodeWorkspace; category = "unicode-workspace" }
                    [pscustomobject]@{ root = $unicodeAppData; category = "unicode-app-data" }
                    [pscustomobject]@{ root = $script:LifecycleWorkspaceRoot; category = "workspace" }
                    [pscustomobject]@{ root = $script:LifecycleAppDataRoot; category = "app-data" }
                )
                for ($cleanupIndex = 0; $cleanupIndex -lt $cleanupRoots.Count; $cleanupIndex++) {
                    $cleanupRoot = [string]$cleanupRoots[$cleanupIndex].root
                    $cleanupCategory = [string]$cleanupRoots[$cleanupIndex].category
                    try {
                        if ($cleanupIndex -eq 0 -and $ContractLifecycleFault -eq "CleanupFirstResourceFailure") {
                            throw "Synthetic first cleanup resource failed"
                        }
                        if (Test-Path -LiteralPath $cleanupRoot) {
                            Assert-NoReparsePath $cleanupRoot "Owned Lifecycle cleanup root"
                            $cleanupMarker = Join-Path $cleanupRoot $lifecycleRootMarkerName
                            if (-not (Test-Path -LiteralPath $cleanupMarker -PathType Leaf)) { continue }
                            Assert-OwnedLifecycleRoot $cleanupRoot $cleanupCategory $RunId ([string]$cleanupState.nonce)
                            Remove-Item -LiteralPath $cleanupRoot -Recurse -Force
                        }
                    } catch { $cleanupErrors.Add("Could not clean owned root '$cleanupRoot': $($_.Exception.Message)") }
                }
                $failedState = if ($cleanupErrors.Count -eq 0) { "failed_cleaned" } else { "failed_cleanup_incomplete" }
                if (Test-Path -LiteralPath $checkpointPath -PathType Leaf) {
                    try {
                        $failedCheckpoint = Read-JsonObject $checkpointPath "Lifecycle reboot checkpoint"
                        $failedCheckpoint.state = $failedState
                        if ($failedCheckpoint.PSObject.Properties.Name -contains "failedAtUtc") {
                            $failedCheckpoint.failedAtUtc = [DateTime]::UtcNow.ToString("o")
                        } else {
                            $failedCheckpoint | Add-Member -NotePropertyName failedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString("o"))
                        }
                        Write-JsonAtomic $checkpointPath $failedCheckpoint
                        if ($cleanupState.PSObject.Properties.Name -contains "checkpointSha256") {
                            $cleanupState.checkpointSha256 = (Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
                        }
                    } catch { $cleanupErrors.Add("Could not finalize failed Lifecycle checkpoint: $($_.Exception.Message)") }
                }
                $cleanupState.state = if ($cleanupErrors.Count -eq 0) { "failed_cleaned" } else { "failed_cleanup_incomplete" }
                if ($cleanupState.PSObject.Properties.Name -contains "failedAtUtc") {
                    $cleanupState.failedAtUtc = [DateTime]::UtcNow.ToString("o")
                } else {
                    $cleanupState | Add-Member -NotePropertyName failedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString("o"))
                }
                Write-LifecycleOwnedState $statePath $cleanupState
            } catch {
                $cleanupErrors.Add("Could not validate Lifecycle cleanup ownership: $($_.Exception.Message)")
            }
        }
    }
    if ($scenarioFailure) {
        if ($cleanupErrors.Count -gt 0) { Write-Warning ("Lifecycle cleanup also failed:`n- " + ($cleanupErrors -join "`n- ")) }
        throw $scenarioFailure
    }
    if ($cleanupErrors.Count -gt 0) { throw ("Lifecycle cleanup failed:`n- " + ($cleanupErrors -join "`n- ")) }
}

function Assert-Report([object]$Report, [object]$Register, [object]$Observed, [string]$MatrixEntry, [string]$ExpectedRunId = "") {
    if ($Report.schemaVersion -ne 1 -or $Report.scenario -notin @("Preflight", "Lifecycle", "Startup", "FirmwareOnline", "FirmwareOffline", "Capabilities")) {
        throw "Report schema identity is invalid"
    }
    if ($ExpectedReportScenario -and $Report.scenario -ne $ExpectedReportScenario) { throw "Report scenario does not match the expected scenario" }
    if (-not (Test-ExactStatus ([string]$Report.result))) { throw "Report result status is invalid" }
    foreach ($property in @(
        "startedAtUtc", "endedAtUtc", "sourceCommit", "productVersion", "candidateKind", "candidateStatus",
        "artifactId", "artifactName", "archiveDigest", "sha256SumsSha256", "provenanceSha256", "installerSha256",
        "applicationSha256", "runtimeIdentity", "resourceIdentity", "inventorySha256", "noticesSha256", "fixtureSha256",
        "runtimeManifestSha256", "runtimePayloadSha256", "resourceLayoutSha256", "testKitSourceSha", "testKitSha256",
        "artifactRegisterSha256", "matrixPolicySha256", "authenticodeStatus", "osCaption", "osEdition", "osVersion", "osBuild",
        "architecture", "accountType", "isElevated", "webView2Version", "networkState", "workspaceRootCategory",
        "appDataRootCategory", "matrixEntryId", "evidenceClass", "gateRunId", "checks"
    )) {
        if ($Report.PSObject.Properties.Name -notcontains $property) { throw "Report is missing required field: $property" }
    }
    if ($Report.scenario -eq "Lifecycle") {
        foreach ($property in @("cleanVmAttestationSha256", "hostRunNonce")) {
            if ($Report.PSObject.Properties.Name -notcontains $property -or [string]::IsNullOrWhiteSpace([string]$Report.$property)) {
                throw "Lifecycle report is missing required field: $property"
            }
        }
    }
    $started = [DateTimeOffset]::MinValue
    $ended = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$Report.startedAtUtc, [ref]$started) -or
        -not [DateTimeOffset]::TryParse([string]$Report.endedAtUtc, [ref]$ended) -or
        $started.Offset -ne [TimeSpan]::Zero -or $ended.Offset -ne [TimeSpan]::Zero -or $ended -lt $started) {
        throw "Report timestamps are invalid"
    }
    if ($Report.sourceCommit -ne $Register.sourceCommit -or $Report.productVersion -ne $Register.productVersion -or
        $Report.candidateKind -ne $Register.candidateKind -or $Report.candidateStatus -ne $Register.candidateStatus -or
        [string]$Report.artifactId -ne [string]$Register.artifact.id -or $Report.artifactName -ne $Register.artifact.name -or
        $Report.archiveDigest -ne $Register.artifact.archiveDigest -or $Report.sha256SumsSha256 -ne $Register.sha256SumsSha256 -or
        $Report.provenanceSha256 -ne $Register.provenanceSha256 -or $Report.installerSha256 -ne $Register.installer.sha256 -or
        $Report.applicationSha256 -ne $Register.application.sha256 -or $Report.runtimeIdentity -ne $Register.runtimeIdentity -or
        $Report.resourceIdentity -ne $Register.resourceIdentity -or $Report.inventorySha256 -ne $Register.inventorySha256 -or
        $Report.runtimeManifestSha256 -ne $Register.runtimeManifestSha256 -or $Report.runtimePayloadSha256 -ne $Register.runtimePayloadSha256 -or
        $Report.resourceLayoutSha256 -ne $Register.resourceLayoutSha256 -or
        $Report.noticesSha256 -ne $Register.noticesSha256 -or $Report.fixtureSha256 -ne $Register.fixtureSha256 -or
        $Report.testKitSourceSha -ne $Register.testKitSourceSha -or $Report.testKitSha256 -ne $Register.testKitSha256 -or
        $Report.artifactRegisterSha256 -ne $ExpectedArtifactRegisterSha256 -or $Report.matrixPolicySha256 -ne $ExpectedMatrixPolicySha256) {
        throw "Report identity does not match the verified artifact register"
    }
    if ($ExpectedRunId -and $Report.gateRunId -ne $ExpectedRunId) { throw "Report gate ownership identity is invalid" }
    $expectedEvidenceClass = if ($ContractTest) { "contract_test" } else { "production" }
    if ($Report.evidenceClass -ne $expectedEvidenceClass) { throw "Report evidence class is invalid" }
    if ($null -eq $Report.isElevated -or $Report.isElevated.GetType() -ne [bool]) { throw "Report elevation field must be a JSON boolean" }
    if ($Report.osCaption -ne $Observed.caption -or $Report.osEdition -ne $Observed.editionId -or
        $Report.osVersion -ne $Observed.version -or $Report.osBuild -ne $Observed.build -or
        $Report.architecture -ne $Observed.architecture -or $Report.matrixEntryId -ne $MatrixEntry -or
        [bool]$Report.isElevated -ne [bool](Get-IsElevated) -or $Report.authenticodeStatus -ne "NotSigned") {
        throw "Report environment does not match the observed matrix entry"
    }
    $checks = @($Report.checks)
    $required = if ($Report.scenario -eq "Preflight") {
        @("input_contract", "artifact_identity", "provenance", "hashes", "authenticode", "matrix_policy", "root_ownership")
    } elseif ($Report.scenario -eq "Lifecycle") {
        @(
            "artifact_identity", "preflight_receipt", "root_ownership", "isolated_roots",
            "silent_per_user_install", "installed_application_hash", "immutable_install_tree",
            "desktop_health", "default_workspace", "graceful_close", "marker_restart",
            "same_version_reinstall", "reboot_resume", "uninstall_removed_install",
            "uninstall_preserved_data", "reinstall_retained_data", "unicode_paths", "final_cleanup"
        )
    } else {
        @("scenario_implementation")
    }
    foreach ($requiredCheck in $required) {
        $matches = @($checks | Where-Object { $_.name -eq $requiredCheck })
        if ($matches.Count -ne 1) { throw "Report is missing required check: $requiredCheck" }
        if ($Report.result -eq "pass" -and $matches[0].status -ne "pass") {
            throw "Report pass contains a non-pass required check: $requiredCheck"
        }
    }
    foreach ($check in $checks) {
        if (-not (Test-ExactStatus ([string]$check.status)) -or [string]::IsNullOrWhiteSpace([string]$check.summary)) {
            throw "Report check contract is invalid"
        }
        if ($check.status -eq "not_run" -and [string]::IsNullOrWhiteSpace([string]$check.reasonCode)) {
            throw "Report not_run check requires a reason code"
        }
    }
    if ($Report.result -eq "pass" -and @($checks | Where-Object { $_.status -ne "pass" }).Count -gt 0) {
        throw "Report pass contains a non-pass check"
    }
    if ($Report.result -eq "fail" -and @($checks | Where-Object { $_.status -eq "fail" }).Count -eq 0) {
        throw "Report fail has no failed check"
    }
    if ($Report.result -eq "not_run" -and (@($checks | Where-Object { $_.status -eq "not_run" }).Count -eq 0 -or
        @($checks | Where-Object { $_.status -eq "fail" }).Count -gt 0)) {
        throw "Report not_run status is inconsistent with checks"
    }
    if ($Report.scenario -eq "Lifecycle" -and $Report.result -eq "pass") {
        $statePath = Join-Path $GateRoot "lifecycle-owned-resources.json"
        $checkpointPath = Join-Path $GateRoot "lifecycle-reboot-checkpoint.json"
        $state = Read-JsonObject $statePath "Lifecycle owned-resource state"
        Assert-Hash $checkpointPath ([string]$state.checkpointSha256) "Lifecycle reboot checkpoint" | Out-Null
        $checkpoint = Read-JsonObject $checkpointPath "Lifecycle reboot checkpoint"
        if ($state.state -ne "completed" -or $checkpoint.state -ne "completed" -or
            $state.runId -ne $Report.gateRunId -or $checkpoint.runId -ne $Report.gateRunId -or
            $state.sourceCommit -ne $Report.sourceCommit -or $checkpoint.sourceCommit -ne $Report.sourceCommit -or
            $state.artifactRegisterSha256 -ne $Report.artifactRegisterSha256 -or
            $checkpoint.artifactRegisterSha256 -ne $Report.artifactRegisterSha256 -or
            $state.matrixPolicySha256 -ne $Report.matrixPolicySha256 -or
            $checkpoint.matrixPolicySha256 -ne $Report.matrixPolicySha256 -or
            $state.testKitSha256 -ne $Report.testKitSha256 -or $checkpoint.testKitSha256 -ne $Report.testKitSha256 -or
            $state.cleanVmAttestationSha256 -ne $Report.cleanVmAttestationSha256 -or
            $checkpoint.cleanVmAttestationSha256 -ne $Report.cleanVmAttestationSha256 -or
            $state.hostRunNonce -ne $Report.hostRunNonce -or $checkpoint.hostRunNonce -ne $Report.hostRunNonce) {
            throw "Lifecycle PASS report does not have a completed bound state"
        }
    }
}

$ArtifactRoot = Assert-AbsolutePath $ArtifactRoot "ArtifactRoot"
$ArtifactArchive = Assert-AbsolutePath $ArtifactArchive "ArtifactArchive"
$Installer = Assert-AbsolutePath $Installer "Installer"
$ArtifactRegister = Assert-AbsolutePath $ArtifactRegister "ArtifactRegister"
$MatrixPolicy = Assert-AbsolutePath $MatrixPolicy "MatrixPolicy"
$TestKitRoot = Assert-AbsolutePath $TestKitRoot "TestKitRoot"
$TestKitArchive = Assert-AbsolutePath $TestKitArchive "TestKitArchive"
$GateRoot = Assert-AbsolutePath $GateRoot "GateRoot"
$ReportPath = Assert-AbsolutePath $ReportPath "ReportPath"
if ($ExpectedSourceSha -notmatch $sourceShaPattern) { throw "ExpectedSourceSha is invalid" }
if ($ExpectedInstallerSha256 -notmatch $sha256Pattern -or $ExpectedApplicationSha256 -notmatch $sha256Pattern -or
    $ExpectedArtifactRegisterSha256 -notmatch $sha256Pattern -or $ExpectedMatrixPolicySha256 -notmatch $sha256Pattern) {
    throw "Expected input SHA-256 is invalid"
}
Assert-NoReparsePath $ArtifactRoot "ArtifactRoot"
Assert-NoReparsePath $ArtifactArchive "ArtifactArchive"
Assert-NoReparsePath $ArtifactRegister "ArtifactRegister"
Assert-NoReparsePath $MatrixPolicy "MatrixPolicy"
Assert-NoReparsePath $TestKitRoot "TestKitRoot"
Assert-NoReparsePath $TestKitArchive "TestKitArchive"
Assert-NoReparsePath $GateRoot "GateRoot"
foreach ($inputFile in @(
    @($ArtifactArchive, "ArtifactArchive"), @($ArtifactRegister, "ArtifactRegister"),
    @($MatrixPolicy, "MatrixPolicy"), @($TestKitArchive, "TestKitArchive")
)) { Assert-NoAlternateStreams $inputFile[0] $inputFile[1] }
Assert-DescendantPath $ReportPath $GateRoot "ReportPath"
if (Test-PathOverlap $ArtifactRoot $GateRoot) { throw "GateRoot and ArtifactRoot overlap" }
if (Test-PathOverlap $Installer $GateRoot) { throw "GateRoot and Installer overlap" }

$registerHash = Assert-Hash $ArtifactRegister $ExpectedArtifactRegisterSha256 "artifact register"
$register = Read-JsonObject $ArtifactRegister "Artifact register"
Assert-ArtifactRegister $register
if ($ExpectedInstallerSha256 -ne [string]$register.installer.sha256 -or
    $ExpectedApplicationSha256 -ne [string]$register.application.sha256) {
    throw "Expected hash does not match the artifact register"
}
$matrixHash = Assert-Hash $MatrixPolicy $ExpectedMatrixPolicySha256 "matrix policy"
$policy = Read-JsonObject $MatrixPolicy "Matrix policy"
$observed = Get-ObservedPlatform
$matrixEntry = Assert-MatrixPolicy $policy $register.productVersion $observed
Assert-Hash $ArtifactArchive ([string]$register.artifact.archiveDigest).Substring(7) "artifact archive" | Out-Null
Assert-TestKit $TestKitRoot $TestKitArchive $register

if ($Scenario -eq "Report") {
    if (-not $ExpectedReportScenario) { throw "ExpectedReportScenario is required for Report validation" }
    if (-not (Test-Path -LiteralPath $GateRoot -PathType Container)) { throw "Report validation requires an existing owned GateRoot" }
    $runId = Assert-OwnedGateRoot $GateRoot ([string]$register.sourceCommit) $registerHash ([string]$register.testKitSha256)
    Assert-NoReparsePath $ReportPath "ReportPath"
    $existingReport = Read-JsonObject $ReportPath "Report"
    Assert-Report $existingReport $register $observed $matrixEntry $runId
    Write-Host "[info] Clean-machine report is valid: $ReportPath"
    exit 0
}

if ($Scenario -ne "Preflight") {
    if (-not (Test-Path -LiteralPath $GateRoot -PathType Container)) { throw "A verified Preflight receipt is required before this scenario" }
    $runId = Assert-OwnedGateRoot $GateRoot ([string]$register.sourceCommit) $registerHash ([string]$register.testKitSha256)
    $receiptPath = Join-Path $GateRoot "preflight-receipt.json"
    $receipt = Read-JsonObject $receiptPath "Preflight receipt"
    $savedExpectedScenario = $ExpectedReportScenario
    $ExpectedReportScenario = "Preflight"
    try { Assert-Report $receipt $register $observed $matrixEntry $runId } finally { $ExpectedReportScenario = $savedExpectedScenario }
    if ($receipt.result -ne "pass") { throw "A passing Preflight receipt is required before this scenario" }
    if ($Scenario -eq "Lifecycle") {
        Invoke-LifecycleScenario $register $observed $matrixEntry $runId $registerHash $matrixHash
        exit 0
    }
    $notRunReport = [ordered]@{
        schemaVersion = 1; scenario = $Scenario; startedAtUtc = [DateTime]::UtcNow.ToString("o"); endedAtUtc = [DateTime]::UtcNow.ToString("o")
        result = "not_run"; sourceCommit = $register.sourceCommit; productVersion = $register.productVersion
        candidateKind = $register.candidateKind; candidateStatus = $register.candidateStatus
        artifactId = [string]$register.artifact.id; artifactName = [string]$register.artifact.name; archiveDigest = [string]$register.artifact.archiveDigest
        sha256SumsSha256 = $register.sha256SumsSha256; provenanceSha256 = $register.provenanceSha256
        installerSha256 = $register.installer.sha256; applicationSha256 = $register.application.sha256
        runtimeIdentity = $register.runtimeIdentity; resourceIdentity = $register.resourceIdentity
        runtimeManifestSha256 = $register.runtimeManifestSha256; runtimePayloadSha256 = $register.runtimePayloadSha256; resourceLayoutSha256 = $register.resourceLayoutSha256
        inventorySha256 = $register.inventorySha256; noticesSha256 = $register.noticesSha256; fixtureSha256 = $register.fixtureSha256
        testKitSourceSha = $register.testKitSourceSha; testKitSha256 = $register.testKitSha256
        artifactRegisterSha256 = $registerHash; matrixPolicySha256 = $matrixHash
        authenticodeStatus = "NotSigned"; osCaption = $observed.caption; osEdition = $observed.editionId; osVersion = $observed.version
        osBuild = $observed.build; architecture = $observed.architecture; accountType = "not_recorded"; isElevated = Get-IsElevated
        webView2Version = Get-WebView2Version; networkState = "not_verified"; workspaceRootCategory = "gate-owned"; appDataRootCategory = "gate-owned"
        matrixEntryId = $matrixEntry; evidenceClass = if ($ContractTest) { "contract_test" } else { "production" }; gateRunId = $runId
        checks = @([ordered]@{ name = "scenario_implementation"; status = "not_run"; reasonCode = "scenario_not_implemented"; summary = "Scenario is intentionally not implemented in the current scope" })
    }
    Assert-Report ([pscustomobject]$notRunReport) $register $observed $matrixEntry $runId
    Write-NewJsonFile $ReportPath $notRunReport
    Write-Host "[info] Scenario is NOT RUN: $Scenario"
    exit 0
}

$startedAt = [DateTime]::UtcNow
$expectedReceiptPath = Join-Path $GateRoot "preflight-receipt.json"
if ($ReportPath -ne $expectedReceiptPath) { throw "Preflight ReportPath must be GateRoot\preflight-receipt.json" }
$directories = @(Get-ChildItem -LiteralPath $ArtifactRoot -Directory -Force)
if ($directories.Count -ne 0) { throw "ArtifactRoot must not contain directories" }
$installers = @(Get-ChildItem -LiteralPath $ArtifactRoot -File -Filter "*-setup.exe")
if ($installers.Count -ne 1) { throw "ArtifactRoot must contain exactly one NSIS installer"
}
$applications = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Where-Object { $_.Name -eq [string]$register.application.file })
if ($applications.Count -ne 1) { throw "ArtifactRoot must contain exactly one registered application executable" }
if ($installers[0].FullName -ne $Installer -or $installers[0].Name -ne [string]$register.installer.file) {
    throw "Installer path does not match the registered artifact"
}
$allowedArtifactFiles = @(
    [string]$register.application.file,
    [string]$register.installer.file,
    "inventory.json", "provenance.json", "SHA256SUMS", "THIRD-PARTY-NOTICES.md", "UNSIGNED-NOT-FOR-USERS.txt"
)
$actualArtifactFiles = @(Get-ChildItem -LiteralPath $ArtifactRoot -File -Force)
if ($actualArtifactFiles.Count -ne $allowedArtifactFiles.Count -or
    @($actualArtifactFiles | Where-Object { $allowedArtifactFiles -notcontains $_.Name }).Count -gt 0) {
    throw "ArtifactRoot file set does not match the exact candidate allowlist"
}
foreach ($file in $actualArtifactFiles) {
    Assert-NoReparsePath $file.FullName "Artifact file $($file.Name)"
    Assert-NoAlternateStreams $file.FullName "Artifact file $($file.Name)"
}

$provenancePath = Join-Path $ArtifactRoot "provenance.json"
Assert-Hash $provenancePath $register.provenanceSha256 "provenance" | Out-Null
$provenance = Read-JsonObject $provenancePath "Artifact provenance"
Assert-Provenance $provenance $register
Assert-Sha256Sums $ArtifactRoot $register.sha256SumsSha256
Assert-Hash $Installer $ExpectedInstallerSha256 "installer" | Out-Null
Assert-Hash $applications[0].FullName $ExpectedApplicationSha256 "application" | Out-Null
Assert-Hash (Join-Path $ArtifactRoot "inventory.json") $register.inventorySha256 "inventory" | Out-Null
Assert-Hash (Join-Path $ArtifactRoot "THIRD-PARTY-NOTICES.md") $register.noticesSha256 "notices" | Out-Null

$installerSignature = Get-AuthenticodeSignature -LiteralPath $Installer
$applicationSignature = Get-AuthenticodeSignature -LiteralPath $applications[0].FullName
if ($register.installer.authenticodeStatus -ne "NotSigned" -or $register.application.authenticodeStatus -ne "NotSigned" -or
    $installerSignature.Status -ne "NotSigned" -or $applicationSignature.Status -ne "NotSigned") {
    throw "Unsigned candidate Authenticode status must be NotSigned"
}

$runId = Assert-OwnedGateRoot $GateRoot ([string]$register.sourceCommit) $registerHash ([string]$register.testKitSha256)
$checks = @(
    [ordered]@{ name = "input_contract"; status = "pass"; summary = "Absolute fail-closed inputs accepted" },
    [ordered]@{ name = "artifact_identity"; status = "pass"; summary = "Exact registered candidate file set accepted" },
    [ordered]@{ name = "provenance"; status = "pass"; summary = "Exact clean release provenance accepted" },
    [ordered]@{ name = "hashes"; status = "pass"; summary = "Artifact and sidecar hashes verified" },
    [ordered]@{ name = "authenticode"; status = "pass"; summary = "Application and installer are NotSigned" },
    [ordered]@{ name = "matrix_policy"; status = "pass"; summary = "Observed platform matches matrix entry $matrixEntry" },
    [ordered]@{ name = "root_ownership"; status = "pass"; summary = "Gate root ownership marker verified" }
)
$report = [ordered]@{
    schemaVersion = 1; scenario = "Preflight"; startedAtUtc = $startedAt.ToString("o"); endedAtUtc = [DateTime]::UtcNow.ToString("o")
    result = "pass"; sourceCommit = $register.sourceCommit; productVersion = $register.productVersion
    candidateKind = $register.candidateKind; candidateStatus = $register.candidateStatus
    artifactId = [string]$register.artifact.id; artifactName = [string]$register.artifact.name; archiveDigest = [string]$register.artifact.archiveDigest
    sha256SumsSha256 = $register.sha256SumsSha256; provenanceSha256 = $register.provenanceSha256
    installerSha256 = $register.installer.sha256; applicationSha256 = $register.application.sha256
    runtimeIdentity = $register.runtimeIdentity; resourceIdentity = $register.resourceIdentity
    runtimeManifestSha256 = $register.runtimeManifestSha256; runtimePayloadSha256 = $register.runtimePayloadSha256; resourceLayoutSha256 = $register.resourceLayoutSha256
    inventorySha256 = $register.inventorySha256; noticesSha256 = $register.noticesSha256; fixtureSha256 = $register.fixtureSha256
    testKitSourceSha = $register.testKitSourceSha; testKitSha256 = $register.testKitSha256
    artifactRegisterSha256 = $registerHash; matrixPolicySha256 = $matrixHash
    authenticodeStatus = "NotSigned"; osCaption = $observed.caption; osEdition = $observed.editionId; osVersion = $observed.version
    osBuild = $observed.build; architecture = $observed.architecture; accountType = "anonymized"; isElevated = Get-IsElevated
    webView2Version = Get-WebView2Version; networkState = "not_required"; workspaceRootCategory = "gate-owned"; appDataRootCategory = "gate-owned"
    matrixEntryId = $matrixEntry; evidenceClass = if ($ContractTest) { "contract_test" } else { "production" }; gateRunId = $runId; checks = $checks
}
Assert-Report ([pscustomobject]$report) $register $observed $matrixEntry $runId
Write-NewJsonFile $ReportPath $report
Write-Host "[info] Clean-machine release preflight: PASS"
