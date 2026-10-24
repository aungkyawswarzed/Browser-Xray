param(
    [Parameter(Mandatory = $true)][string]$InstallDir
)

$ErrorActionPreference = "SilentlyContinue"
$binDir = [System.IO.Path]::GetFullPath((Join-Path $InstallDir "bin"))
$statePath = Join-Path $InstallDir "runtime\state.json"

# Ask the helper's recorded PID to exit first; taskkill /T also takes down the
# Xray child process even if the helper no longer has a chance to clean up.
if (Test-Path $statePath) {
    try {
        $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
        if ($state.pid) {
            $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
            if ($process -and $process.Path -and $process.Path.StartsWith($binDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                & taskkill /PID ([int]$state.pid) /T /F 2>$null | Out-Null
            }
        }
    } catch {
        # Stale state is harmless.
    }
}

Get-Process -Name "browser-xray-helper", "xray" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        if ($_.Path -and $_.Path.StartsWith($binDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Ignore processes that exit while we are inspecting them.
    }
}

Start-Sleep -Milliseconds 350
exit 0
