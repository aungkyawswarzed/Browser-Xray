[CmdletBinding()]
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "extension\manifest.json"))) {
    if (Test-Path (Join-Path $PSScriptRoot "extension\manifest.json")) {
        $root = $PSScriptRoot
    } else {
        $root = Join-Path $env:LOCALAPPDATA "BrowserXray"
    }
}

$extensionDir = Join-Path $root "extension"
if (-not (Test-Path (Join-Path $extensionDir "manifest.json"))) {
    Write-Host "The Browser Xray extension folder was not found at $extensionDir." -ForegroundColor Red
    Write-Host "Run the Browser Xray installer again, then retry."
    exit 1
}

$extensionId = ""
$idPath = Join-Path $root "extension-id.txt"
if (Test-Path $idPath) {
    $extensionId = (Get-Content -Path $idPath -Raw).Trim()
}

function Get-BrowserFromAppPaths {
    param([Parameter(Mandatory = $true)][string]$ExeName)
    foreach ($rootKey in @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths"
    )) {
        $key = Join-Path $rootKey $ExeName
        if (-not (Test-Path $key)) {
            continue
        }
        try {
            $value = (Get-Item -Path $key -ErrorAction Stop).GetValue("")
            if ($value) {
                $value = $value.Trim('"')
                if (Test-Path $value) {
                    return $value
                }
            }
        } catch {
            # Try the next registry root.
        }
    }
    return $null
}

$candidates = @(
    @{ Name = "Chrome";   Path = (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"); Url = "chrome://extensions" },
    @{ Name = "Chrome";   Path = (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"); Url = "chrome://extensions" },
    @{ Name = "Chrome";   Path = (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"); Url = "chrome://extensions" },
    @{ Name = "Edge";     Path = (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"); Url = "edge://extensions" },
    @{ Name = "Edge";     Path = (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"); Url = "edge://extensions" },
    @{ Name = "Brave";    Path = (Join-Path $env:ProgramFiles "BraveSoftware\Brave-Browser\Application\brave.exe"); Url = "brave://extensions" },
    @{ Name = "Brave";    Path = (Join-Path ${env:ProgramFiles(x86)} "BraveSoftware\Brave-Browser\Application\brave.exe"); Url = "brave://extensions" },
    @{ Name = "Vivaldi";  Path = (Join-Path $env:LOCALAPPDATA "Vivaldi\Application\vivaldi.exe"); Url = "vivaldi://extensions" },
    @{ Name = "Chromium"; Path = (Join-Path $env:LOCALAPPDATA "Chromium\Application\chrome.exe"); Url = "chrome://extensions" }
)

$browser = $null
foreach ($candidate in $candidates) {
    if ($candidate.Path -and (Test-Path $candidate.Path)) {
        $browser = $candidate
        break
    }
}

if (-not $browser) {
    $appPathBrowsers = @(
        @{ Exe = "chrome.exe"; Name = "Chrome"; Url = "chrome://extensions" },
        @{ Exe = "msedge.exe"; Name = "Edge"; Url = "edge://extensions" },
        @{ Exe = "brave.exe"; Name = "Brave"; Url = "brave://extensions" },
        @{ Exe = "vivaldi.exe"; Name = "Vivaldi"; Url = "vivaldi://extensions" }
    )
    foreach ($entry in $appPathBrowsers) {
        $path = Get-BrowserFromAppPaths -ExeName $entry.Exe
        if ($path) {
            $browser = @{ Name = $entry.Name; Path = $path; Url = $entry.Url }
            break
        }
    }
}

Write-Host ""
Write-Host "Browser Xray extension setup" -ForegroundColor Cyan
Write-Host "  Extension folder : $extensionDir"
if ($extensionId) {
    Write-Host "  Extension ID     : $extensionId"
}
Write-Host ""

if (-not $NoBrowser -and $browser) {
    try {
        Start-Process -FilePath $browser.Path -ArgumentList $browser.Url
        Write-Host "Opened $($browser.Name) at $($browser.Url)." -ForegroundColor Green
    } catch {
        Write-Host "Could not open $($browser.Name) automatically." -ForegroundColor Yellow
    }
} elseif (-not $NoBrowser) {
    Write-Host "No supported Chromium browser was found in the usual locations." -ForegroundColor Yellow
}

try {
    Start-Process -FilePath "explorer.exe" -ArgumentList "`"$extensionDir`""
} catch {
    Write-Host "Could not open the extension folder automatically." -ForegroundColor Yellow
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. In the browser, open chrome://extensions (or edge://extensions)."
Write-Host "  2. Turn on Developer mode."
Write-Host "  3. Click Load unpacked and choose the extension folder shown above."
Write-Host "  4. If Browser Xray is already listed, click Reload."
Write-Host "  5. Pin Browser Xray, open its popup, add a share link, and press Connect."
Write-Host ""
Write-Host "The extension folder is also open in Explorer." -ForegroundColor DarkGray
