[CmdletBinding()]
param(
    [switch]$Force,
    [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

# The uninstaller may live inside the folder it is about to remove. Leave that
# directory before deleting it, otherwise Windows can keep the current directory
# handle open and make the uninstall fail.
Set-Location -Path $env:TEMP

if (-not $InstallDir) {
    $InstallDir = Get-DefaultInstallDirectory
}
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$installExists = Test-Path $InstallDir

if ($installExists -and -not $Force) {
    $answer = Read-Host "Remove Browser Xray from $InstallDir? Type 'yes' to continue"
    if ($answer -ne "yes") {
        Write-Host "Cancelled."
        exit 0
    }
}

if ($installExists) {
    Write-Step "Stopping helper processes"
    Stop-BrowserXrayProcesses -InstallDir $InstallDir
}

Write-Step "Removing native messaging registration"
$removed = 0
foreach ($key in Get-NativeHostRegistryKeys) {
    if (-not (Test-Path $key)) {
        continue
    }
    try {
        $registryKey = Get-Item -Path $key -ErrorAction Stop
        $manifestPath = $registryKey.GetValue("")
        if (-not $manifestPath -or $manifestPath.StartsWith($InstallDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -Path $key -Recurse -Force
            $removed += 1
        } else {
            Write-Warn "Leaving $key because it points to $manifestPath"
        }
    } catch {
        Write-Warn "Could not remove $key"
    }
}
Write-Ok "Removed $removed registry key(s)"

Write-Step "Removing shortcuts and Apps & features entry"
Remove-BrowserXrayShortcuts
Remove-BrowserXrayUninstallEntry

if ($installExists) {
    Write-Step "Deleting $InstallDir"
    try {
        Remove-Item -Path $InstallDir -Recurse -Force
    } catch {
        throw "Could not delete the install folder. Close Chrome and Edge, then run this uninstaller again. Detail: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "The local helper, shortcuts, and native messaging registration were removed." -ForegroundColor Green
Write-Host "Remove the Browser Xray extension manually from chrome://extensions or edge://extensions."
Write-Host "Saved server links are stored by the extension and are removed with the extension."
