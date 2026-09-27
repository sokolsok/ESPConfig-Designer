function Assert-ArtifactHash {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet("SHA256", "SHA512")][string]$Algorithm,
        [Parameter(Mandatory = $true)][string]$ExpectedHash,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $normalizedAlgorithm = $Algorithm.ToUpperInvariant()
    $expectedLength = if ($normalizedAlgorithm -eq "SHA256") { 64 } else { 128 }
    $displayAlgorithm = if ($normalizedAlgorithm -eq "SHA256") { "SHA-256" } else { "SHA-512" }
    $normalizedExpected = $ExpectedHash.ToLowerInvariant()
    if ($normalizedExpected -notmatch "^[0-9a-f]{$expectedLength}$") {
        throw "$Name manifest contains an invalid $displayAlgorithm digest"
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Name artifact is missing: $Path"
    }

    $actual = (Get-FileHash -LiteralPath $Path -Algorithm $normalizedAlgorithm).Hash.ToLowerInvariant()
    if ($actual -ne $normalizedExpected) {
        throw "$Name $displayAlgorithm mismatch: expected $normalizedExpected, found $actual"
    }
}
