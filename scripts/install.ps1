[CmdletBinding()]
param(
    [string]$SourceRoot = "",
    [string]$InstallDir = "",
    [switch]$NoBrowser,
    [switch]$DesktopShortcut,
    [switch]$SkipNativeRegistration,
    [switch]$NoShortcuts,
    [switch]$NoUninstallEntry
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

if ($env:OS -ne "Windows_NT") {
    throw "Browser Xray currently supports Windows only."
}

if (-not $SourceRoot) {
    if (Test-Path (Join-Path $PSScriptRoot "helper\browser-xray-helper.exe")) {
        $SourceRoot = $PSScriptRoot
    } elseif (Test-Path (Join-Path $PSScriptRoot "..\dist\helper\browser-xray-helper.exe")) {
        $SourceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\dist")).Path
    } else {
        throw "The build output was not found. Run scripts\build.ps1 first, or run install.ps1 from the release folder."
    }
}
$SourceRoot = (Resolve-Path -Path $SourceRoot).Path

if (-not $InstallDir) {
    $InstallDir = Get-DefaultInstallDirectory
}
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

$requiredFiles = @(
    "helper\browser-xray-helper.exe",
    "helper\xray.exe",
    "extension\manifest.json",
    "extension\background.js",
    "uninstall.ps1",
    "common.ps1",
    "open-extension.ps1"
)
foreach ($relative in $requiredFiles) {
    if (-not (Test-Path (Join-Path $SourceRoot $relative))) {
        throw "Missing $relative in $SourceRoot. Run scripts\build.ps1 again."
    }
}

$extensionIdPath = Join-Path $SourceRoot "extension-id.txt"
if (Test-Path $extensionIdPath) {
    $extensionId = (Get-Content -Path $extensionIdPath -Raw).Trim()
} else {
    $extensionId = Get-ExtensionIdFromManifest -ManifestPath (Join-Path $SourceRoot "extension\manifest.json")
}
if ($extensionId -notmatch '^[a-p]{32}$') {
    throw "The extension ID is invalid: $extensionId"
}

Write-Step "Installing Browser Xray to $InstallDir"
if (Test-Path $InstallDir) {
    Write-Warn "Existing helper processes in this folder will be stopped."
}
Stop-BrowserXrayProcesses -InstallDir $InstallDir

$binDir = Join-Path $InstallDir "bin"
$licenseDir = Join-Path $InstallDir "licenses"
$extensionDir = Join-Path $InstallDir "extension"
$toolsDir = Join-Path $InstallDir "tools"
New-Item -ItemType Directory -Force -Path $binDir, $licenseDir, $extensionDir, $toolsDir | Out-Null

Write-Step "Copying native helper"
foreach ($name in "browser-xray-helper.exe", "xray.exe", "geoip.dat", "geosite.dat", "LICENSE-Xray-core.txt") {
    $source = Join-Path $SourceRoot "helper\$name"
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination (Join-Path $binDir $name) -Force
    }
}

Write-Step "Copying extension"
$sourceExtension = Join-Path $SourceRoot "extension"
$targetAssets = Join-Path $extensionDir "assets"
if (Test-Path $targetAssets) {
    Remove-Item -Path $targetAssets -Recurse -Force
}
Copy-Item -Path (Join-Path $sourceExtension "*") -Destination $extensionDir -Recurse -Force

Write-Step "Copying licenses and documentation"
foreach ($name in "LICENSE", "THIRD-PARTY-NOTICES.md") {
    $source = Join-Path $SourceRoot $name
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination (Join-Path $licenseDir $name) -Force
    }
}
$xrayLicense = Join-Path $SourceRoot "helper\LICENSE-Xray-core.txt"
if (Test-Path $xrayLicense) {
    Copy-Item -Path $xrayLicense -Destination (Join-Path $licenseDir "LICENSE-Xray-core.txt") -Force
}
foreach ($name in "README.md", "README.txt") {
    $source = Join-Path $SourceRoot $name
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination (Join-Path $InstallDir $name) -Force
    }
}
if (Test-Path $extensionIdPath) {
    Copy-Item -Path $extensionIdPath -Destination (Join-Path $InstallDir "extension-id.txt") -Force
}

$iconPath = Join-Path $InstallDir "BrowserXray.ico"
$iconSource = Join-Path $SourceRoot "BrowserXray.ico"
if (-not (Test-Path $iconSource)) {
    $iconSource = Join-Path $SourceRoot "icons\icon.ico"
}
if (Test-Path $iconSource) {
    Copy-Item -Path $iconSource -Destination $iconPath -Force
} else {
    $iconPath = ""
    Write-Warn "No installer icon was found. Shortcuts will use the default icon."
}

Write-Step "Installing maintenance scripts"
foreach ($name in "uninstall.ps1", "common.ps1", "open-extension.ps1", "open-extension.cmd", "stop-helper.ps1") {
    $source = Join-Path $SourceRoot $name
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination (Join-Path $toolsDir $name) -Force
    }
}

$openCmdPath = Join-Path $toolsDir "Open Browser Xray.cmd"
Write-CmdFile -Path $openCmdPath -Content @"
@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-extension.ps1" %*
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
"@

$uninstallCmdPath = Join-Path $toolsDir "Uninstall Browser Xray.cmd"
Write-CmdFile -Path $uninstallCmdPath -Content @"
@echo off
setlocal
set "TOOLS=%~dp0"
cd /d "%TEMP%"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TOOLS%uninstall.ps1" -InstallDir "%~dp0.."
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
"@

$helperPath = Join-Path $binDir "browser-xray-helper.exe"
$manifestPath = Join-Path $InstallDir "$BrowserXrayHostName.json"
$manifest = [ordered]@{
    name            = $BrowserXrayHostName
    description     = "Browser Xray local helper"
    path            = $helperPath
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extensionId/")
}
$manifestJson = $manifest | ConvertTo-Json -Depth 5
Write-Utf8NoBom -Path $manifestPath -Content ($manifestJson + "`n")

if (-not $NoShortcuts) {
    Write-Step "Creating Start Menu shortcuts"
    Install-BrowserXrayShortcuts -InstallDir $InstallDir -ToolsDir $toolsDir -IconPath $iconPath -DesktopShortcut:$DesktopShortcut
}

if (-not $NoUninstallEntry) {
    Write-Step "Adding Browser Xray to Apps & features"
    Register-BrowserXrayUninstallEntry -InstallDir $InstallDir -ToolsDir $toolsDir -IconPath $iconPath -Version $BrowserXrayVersion
}

if ($SkipNativeRegistration) {
    Write-Warn "Native messaging registration was skipped (test/deployment mode)."
} else {
    Write-Step "Registering the native messaging host"
    $registered = 0
    foreach ($key in Get-NativeHostRegistryKeys) {
        try {
            New-Item -Path $key -Force | Out-Null
            Set-Item -Path $key -Value $manifestPath
            $registered += 1
        } catch {
            Write-Warn "Could not register $key"
        }
    }
    Write-Ok "Registered with $registered browser registry key(s)"
}

Write-Host ""
Write-Host "Browser Xray is installed." -ForegroundColor Green
Write-Host "  Extension folder : $extensionDir"
Write-Host "  Extension ID     : $extensionId"
Write-Host "  Helper           : $helperPath"
Write-Host "  Native manifest  : $manifestPath"
Write-Host ""

if ($NoBrowser) {
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Open chrome://extensions (or edge://extensions)."
    Write-Host "  2. Enable Developer mode."
    Write-Host "  3. Click Load unpacked and select:"
    Write-Host "     $extensionDir"
    Write-Host "  4. If the extension was already loaded, click its Reload button."
    Write-Host "  5. Pin Browser Xray, open the popup, paste a share link, and connect."
    Write-Host ""
} else {
    $openScript = Join-Path $toolsDir "open-extension.ps1"
    if (Test-Path $openScript) {
        try {
            & $openScript
        } catch {
            Write-Warn "The browser could not be opened automatically. Open chrome://extensions manually."
        }
    }
}

if ($SkipNativeRegistration) {
    Write-Host "Native messaging registration was skipped."
} else {
    Write-Host "The helper is registered for Chrome, Chrome Beta/Dev, Edge, Chromium, Brave, and Vivaldi."
}
Write-Host "No administrator rights or system proxy changes are used."
if (-not $NoUninstallEntry) {
    Write-Host "Uninstall from the Start Menu or Settings > Apps > Installed apps."
} elseif (-not $NoShortcuts) {
    Write-Host "Uninstall from the Start Menu."
} else {
    Write-Host "Run tools\Uninstall Browser Xray.cmd from the install folder to uninstall."
}
