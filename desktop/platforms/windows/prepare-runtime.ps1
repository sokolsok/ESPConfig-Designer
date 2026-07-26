[CmdletBinding()]
param(
    [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$PythonVersion = "3.13.9"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$runtimeManifestScript = Join-Path $repoRoot "esp-config-designer\backend\runtime_manifest.py"
if (-not (Test-Path -LiteralPath $runtimeManifestScript -PathType Leaf)) {
    throw "Runtime manifest generator is missing: $runtimeManifestScript"
}
$gitManifestPath = Join-Path $PSScriptRoot "git-manifest.json"
if (-not (Test-Path -LiteralPath $gitManifestPath -PathType Leaf)) {
    throw "Bundled Git manifest is missing: $gitManifestPath"
}
$gitManifest = Get-Content -LiteralPath $gitManifestPath -Raw | ConvertFrom-Json
$GitVersion = [string]$gitManifest.version
$GitArchive = [string]$gitManifest.archive
$GitUrl = [string]$gitManifest.source
$GitSha256 = ([string]$gitManifest.sha256).ToLowerInvariant()
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $env:LOCALAPPDATA "ECD\runtime"
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$pythonZip = "python-$PythonVersion-nuget.zip"
$pythonUrl = "https://www.nuget.org/api/v2/package/python/$PythonVersion"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ecd-runtime-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot $pythonZip
$gitZipPath = Join-Path $tempRoot $GitArchive

if ((Test-Path -LiteralPath $OutputRoot) -and ((Get-ChildItem -LiteralPath $OutputRoot -Force | Measure-Object).Count -gt 0)) {
    throw "Output runtime directory is not empty: $OutputRoot"
}
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
try {
    Write-Host "[info] Downloading Python $PythonVersion portable distribution"
    Invoke-WebRequest -Uri $pythonUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[info] Downloading bundled Git for Windows $GitVersion"
    Invoke-WebRequest -Uri $GitUrl -OutFile $gitZipPath -UseBasicParsing
    $actualGitHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $gitZipPath).Hash.ToLowerInvariant()
    if ($actualGitHash -ne $GitSha256) {
        throw "Bundled Git SHA-256 mismatch: expected $GitSha256, found $actualGitHash"
    }

    $packageRoot = Join-Path $tempRoot "python-package"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $packageRoot -Force
    $toolsRoot = Join-Path $packageRoot "tools"
    if (-not (Test-Path -LiteralPath (Join-Path $toolsRoot "python.exe") -PathType Leaf)) {
        throw "Python portable package did not contain tools\python.exe"
    }
    Copy-Item -Path (Join-Path $toolsRoot "*") -Destination $OutputRoot -Recurse -Force
    New-Item -ItemType Directory -Path (Join-Path $OutputRoot "Lib\site-packages") -Force | Out-Null

    $pythonPath = Join-Path $OutputRoot "python.exe"
    & $pythonPath -m ensurepip --upgrade --default-pip
    if ($LASTEXITCODE -ne 0) {
        throw "ensurepip failed with exit code $LASTEXITCODE"
    }
    & $pythonPath -m pip install --disable-pip-version-check --no-cache-dir setuptools==82.0.0 wheel==0.47.0
    if ($LASTEXITCODE -ne 0) {
        throw "Installing Python package build support failed with exit code $LASTEXITCODE"
    }
    & $pythonPath -m pip install --disable-pip-version-check --no-cache-dir --no-build-isolation -r (Join-Path $PSScriptRoot "requirements-runtime.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Installing pinned runtime dependencies failed with exit code $LASTEXITCODE"
    }
    & $pythonPath -c "import importlib.metadata as m, sys; assert sys.version_info[:3] == (3, 13, 9); assert m.version('esphome') == '2026.6.4'; assert m.version('platformio') == '6.1.19'; print('portable runtime verified')"
    if ($LASTEXITCODE -ne 0) {
        throw "Portable runtime verification failed"
    }

    $gitPackageRoot = Join-Path $tempRoot "git-package"
    $gitRoot = Join-Path $OutputRoot "git"
    Expand-Archive -LiteralPath $gitZipPath -DestinationPath $gitPackageRoot -Force
    New-Item -ItemType Directory -Path $gitRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $gitPackageRoot "*") -Destination $gitRoot -Recurse -Force
    $gitExecutable = Join-Path $gitRoot "cmd\git.exe"
    $gitCoreExecutable = Join-Path $gitRoot "mingw64\bin\git.exe"
    $gitShell = Join-Path $gitRoot "usr\bin\sh.exe"
    $gitLicense = Join-Path $gitRoot "LICENSE.txt"
    if ((-not (Test-Path -LiteralPath $gitExecutable -PathType Leaf)) -or
        (-not (Test-Path -LiteralPath $gitCoreExecutable -PathType Leaf)) -or
        (-not (Test-Path -LiteralPath $gitShell -PathType Leaf)) -or
        (-not (Test-Path -LiteralPath $gitLicense -PathType Leaf))) {
        throw "Bundled Git installation is incomplete after extraction"
    }
    $gitVersionOutput = (& $gitExecutable --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $gitVersionOutput -notmatch [regex]::Escape("git version $GitVersion")) {
        throw "Bundled Git verification failed: $gitVersionOutput"
    }
    & $pythonPath $runtimeManifestScript `
        --runtime-root $OutputRoot --git-root $gitRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime compatibility manifest generation failed"
    }
    Write-Host "[info] Bundled Git verified: $gitVersionOutput"
    Write-Host "[info] Runtime prepared at $OutputRoot"
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
