[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipExtension,
    [switch]$SkipHelper,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$projectRoot = Get-ProjectRoot $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$helperOut = Join-Path $distDir "helper"
$extensionOut = Join-Path $distDir "extension"
$installerDir = Join-Path $projectRoot "installer"
$installerIcon = Join-Path $installerDir "BrowserXray.ico"

if (-not (Test-Path $installerIcon)) {
    Write-Step "Generating application and installer icons"
    & (Join-Path $PSScriptRoot "generate-icons.ps1")
    if (-not (Test-Path $installerIcon)) { throw "Icon generation failed." }
}

Write-Step "Preparing build directories"
if ($Clean -and (Test-Path $distDir)) {
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $helperOut | Out-Null
New-Item -ItemType Directory -Force -Path $extensionOut | Out-Null

if (-not $SkipExtension) {
    Write-Step "Installing extension dependencies"
    $npm = Resolve-NpmExecutable
    Push-Location (Join-Path $projectRoot "extension")
    try {
        if (Test-Path "package-lock.json") {
            & $npm ci --no-audit --no-fund
        } else {
            & $npm install --no-audit --no-fund
        }
        if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed." }

        if (-not $SkipTests) {
            Write-Step "Running extension tests"
            & $npm test
            if ($LASTEXITCODE -ne 0) { throw "Extension tests failed." }
        }

        Write-Step "Building extension"
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }

        $builtExtension = Join-Path $projectRoot "extension\dist"
        if (-not (Test-Path (Join-Path $builtExtension "manifest.json"))) {
            throw "The extension build did not produce manifest.json."
        }
        if (Test-Path $extensionOut) {
            Remove-Item -Path $extensionOut -Recurse -Force
        }
        Copy-Item -Path $builtExtension -Destination $extensionOut -Recurse
        Write-Ok "Extension written to $extensionOut"
    } finally {
        Pop-Location
    }
}

if (-not $SkipHelper) {
    $go = Resolve-GoExecutable $projectRoot
    $xray = Resolve-XrayCore $projectRoot

    Write-Step "Building native helper"
    Push-Location (Join-Path $projectRoot "helper")
    try {
        if (-not $SkipTests) {
            Write-Step "Running helper tests"
            & $go test ./...
            if ($LASTEXITCODE -ne 0) { throw "Helper tests failed." }
        }

        $helperExe = Join-Path $helperOut "browser-xray-helper.exe"
        & $go build -trimpath -ldflags "-s -w" -o $helperExe .\cmd\helper
        if ($LASTEXITCODE -ne 0) { throw "Go build failed." }
        Write-Ok "Helper written to $helperExe"
    } finally {
        Pop-Location
    }

    Write-Step "Bundling Xray core"
    $xrayDir = Split-Path -Parent $xray
    Copy-Item -Path $xray -Destination (Join-Path $helperOut "xray.exe") -Force
    foreach ($filename in "geoip.dat", "geosite.dat", "LICENSE") {
        $source = Join-Path $xrayDir $filename
        if (Test-Path $source) {
            $targetName = if ($filename -eq "LICENSE") { "LICENSE-Xray-core.txt" } else { $filename }
            Copy-Item -Path $source -Destination (Join-Path $helperOut $targetName) -Force
        }
    }
    Write-Ok "Xray $XrayVersion bundled"
}

foreach ($name in "LICENSE", "THIRD-PARTY-NOTICES.md", "README.md", "CHANGELOG.md", "RELEASING.md") {
    $source = Join-Path $projectRoot $name
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination (Join-Path $distDir $name) -Force
    }
}

Write-Step "Copying installer"
foreach ($name in "install.ps1", "uninstall.ps1", "common.ps1", "install.cmd", "uninstall.cmd", "open-extension.ps1", "open-extension.cmd", "stop-helper.ps1") {
    Copy-Item -Path (Join-Path $PSScriptRoot $name) -Destination (Join-Path $distDir $name) -Force
}
if (Test-Path $installerIcon) {
    Copy-Item -Path $installerIcon -Destination (Join-Path $distDir "BrowserXray.ico") -Force
}

$manifestPath = Join-Path $extensionOut "manifest.json"
if (-not (Test-Path $manifestPath)) {
    $manifestPath = Join-Path $projectRoot "extension\public\manifest.json"
}
$extensionId = Get-ExtensionIdFromManifest -ManifestPath $manifestPath
Write-Utf8NoBom -Path (Join-Path $distDir "extension-id.txt") -Content "$extensionId`n"

$readme = @"
Browser Xray $BrowserXrayVersion (Windows x64)

Browser Xray installs a small local helper and a browser extension for the
current Windows user. It does not require administrator rights and does not
change the Windows system proxy.

If you ran BrowserXray-Setup-$BrowserXrayVersion-win64.exe, the helper is
already installed. Continue with the extension steps below.

If you are using the portable ZIP:
1. Double-click "Install Browser Xray.cmd" (or run install.ps1 in PowerShell).
2. Continue with the extension steps below.

Finish setup in Chrome or Edge:
1. Open chrome://extensions (or edge://extensions).
2. Enable Developer mode.
3. Click "Load unpacked" and select:
   %LOCALAPPDATA%\BrowserXray\extension
4. If Browser Xray is already listed, click Reload.
5. Pin Browser Xray, open its popup, add a vless://, vmess://, trojan://, or
   ss:// share link, and press Connect.

Extension ID: $extensionId

The installer registers the native helper for Chrome, Chrome Beta/Dev, Edge,
Chromium, Brave, and Vivaldi under the current Windows user.

Uninstall from the Start Menu ("Uninstall Browser Xray") or from
Settings > Apps > Installed apps. Remove the extension separately from
chrome://extensions or edge://extensions.

Read README.md in this folder for architecture, limitations, security notes,
and troubleshooting. The binaries are unsigned; Windows SmartScreen or an
antivirus product may warn the first time.
"@
Write-Utf8NoBom -Path (Join-Path $distDir "README.txt") -Content $readme

Write-Step "Writing checksums"
$checksumLines = @()
foreach ($relative in "helper\browser-xray-helper.exe", "helper\xray.exe", "extension\manifest.json", "extension\background.js") {
    $full = Join-Path $distDir $relative
    if (Test-Path $full) {
        $hash = (Get-FileHash -Algorithm SHA256 -Path $full).Hash.ToLowerInvariant()
        $checksumLines += "$hash  $relative"
    }
}
Write-Utf8NoBom -Path (Join-Path $distDir "SHA256SUMS.txt") -Content (($checksumLines -join "`n") + "`n")

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "  Distribution : $distDir"
Write-Host "  Extension ID : $extensionId"
Write-Host "  Portable     : double-click dist\install.cmd"
Write-Host "  Release      : powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1"
Write-Host "  Test helper  : node .\scripts\test-helper.mjs"
