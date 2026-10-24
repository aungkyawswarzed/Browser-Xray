[CmdletBinding()]
param(
    [string]$Version = "",
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$SkipInstaller,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$projectRoot = Get-ProjectRoot $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$releaseDir = Join-Path $projectRoot "release"
$installerDir = Join-Path $projectRoot "installer"
$issPath = Join-Path $installerDir "BrowserXray.iss"

function Find-InnoCompiler {
    $command = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $patterns = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup *\ISCC.exe",
        "$env:ProgramFiles\Inno Setup *\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup *\ISCC.exe"
    )
    foreach ($pattern in $patterns) {
        $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }
    return $null
}

if (-not $Version) {
    $Version = $BrowserXrayVersion
}
$Version = $Version.Trim() -replace "^[vV]", ""
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Release version must be numeric X.Y.Z (Chrome's extension version format). Got: $Version"
}

$manifestPath = Join-Path $projectRoot "extension\public\manifest.json"
$packagePath = Join-Path $projectRoot "extension\package.json"
$manifestVersion = (Get-Content -Path $manifestPath -Raw | ConvertFrom-Json).version
$packageVersion = (Get-Content -Path $packagePath -Raw | ConvertFrom-Json).version

if ($manifestVersion -ne $Version) {
    throw "Version mismatch: extension/public/manifest.json is $manifestVersion, but the release version is $Version. Bump the manifest first."
}
if ($packageVersion -ne $Version) {
    throw "Version mismatch: extension/package.json is $packageVersion, but the release version is $Version. Bump package.json first."
}
if ($BrowserXrayVersion -ne $Version) {
    throw "Version mismatch: scripts/common.ps1 is $BrowserXrayVersion, but the release version is $Version. Bump common.ps1 first."
}

if (-not $SkipBuild) {
    Write-Step "Building Browser Xray $Version"
    if ($SkipTests) {
        & (Join-Path $PSScriptRoot "build.ps1") -SkipTests
    } else {
        & (Join-Path $PSScriptRoot "build.ps1")
    }
}

if (-not (Test-Path (Join-Path $distDir "helper\browser-xray-helper.exe"))) {
    throw "The build output is missing. Run scripts\build.ps1 or omit -SkipBuild."
}

$extensionIdPath = Join-Path $distDir "extension-id.txt"
if (Test-Path $extensionIdPath) {
    $extensionId = (Get-Content -Path $extensionIdPath -Raw).Trim()
} else {
    $extensionId = Get-ExtensionIdFromManifest -ManifestPath (Join-Path $distDir "extension\manifest.json")
}

$stageDir = Join-Path $releaseDir "BrowserXray-$Version-win64"
Write-Step "Preparing the portable release folder"
if (Test-Path $stageDir) {
    Remove-Item -Path $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

foreach ($directory in "helper", "extension") {
    $source = Join-Path $distDir $directory
    $destination = Join-Path $stageDir $directory
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force
}

$rootFiles = @(
    "LICENSE",
    "THIRD-PARTY-NOTICES.md",
    "README.md",
    "README.txt",
    "extension-id.txt",
    "install.ps1",
    "uninstall.ps1",
    "common.ps1",
    "install.cmd",
    "uninstall.cmd",
    "open-extension.ps1",
    "open-extension.cmd",
    "stop-helper.ps1",
    "BrowserXray.ico"
)
foreach ($name in $rootFiles) {
    $source = Join-Path $distDir $name
    if (-not (Test-Path $source)) {
        throw "The release is missing dist\$name. Run scripts\build.ps1 again."
    }
    Copy-Item -Path $source -Destination (Join-Path $stageDir $name) -Force
}

Move-Item -Path (Join-Path $stageDir "install.cmd") -Destination (Join-Path $stageDir "Install Browser Xray.cmd") -Force
Move-Item -Path (Join-Path $stageDir "uninstall.cmd") -Destination (Join-Path $stageDir "Uninstall Browser Xray.cmd") -Force

Write-Step "Writing package checksums"
$stageChecksums = @()
$stageFiles = Get-ChildItem -Path $stageDir -Recurse -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | Sort-Object FullName
foreach ($file in $stageFiles) {
    $relative = $file.FullName.Substring($stageDir.Length + 1).Replace("\", "/")
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
    $stageChecksums += "$hash  $relative"
}
Write-Utf8NoBom -Path (Join-Path $stageDir "SHA256SUMS.txt") -Content (($stageChecksums -join "`n") + "`n")

$zipPath = Join-Path $releaseDir "BrowserXray-$Version-win64.zip"
if (-not $SkipZip) {
    Write-Step "Creating the portable ZIP"
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $stageDir,
        $zipPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $true
    )
    Write-Ok "Wrote $zipPath"
}

$setupPath = Join-Path $releaseDir "BrowserXray-Setup-$Version-win64.exe"
if (-not $SkipInstaller) {
    $iscc = Find-InnoCompiler
    if (-not $iscc) {
        throw "Inno Setup 6.4+ was not found. Install it with: winget install --id JRSoftware.InnoSetup -e --scope user"
    }

    $parts = $Version.Split(".")
    $versionInfoVersion = "$($parts[0]).$($parts[1]).$($parts[2]).0"
    $iconPath = Join-Path $installerDir "BrowserXray.ico"
    if (-not (Test-Path $iconPath)) {
        throw "The installer icon is missing: $iconPath"
    }

    Write-Step "Building the Windows installer"
    $isccArguments = @(
        "/DAppVersion=$Version",
        "/DVersionInfoVersion=$versionInfoVersion",
        "/DExtensionId=$extensionId",
        "/DPayloadDir=$stageDir",
        "/DIconFile=$iconPath",
        "/O$releaseDir",
        "/FBrowserXray-Setup-$Version-win64",
        $issPath
    )
    & $iscc @isccArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup failed with exit code $LASTEXITCODE."
    }
    if (-not (Test-Path $setupPath)) {
        throw "Inno Setup did not produce $setupPath."
    }
    Write-Ok "Wrote $setupPath"
}

Write-Step "Writing final checksums and release notes"
$artifacts = @()
if (Test-Path $zipPath) { $artifacts += Get-Item $zipPath }
if (Test-Path $setupPath) { $artifacts += Get-Item $setupPath }
$artifacts = $artifacts | Sort-Object Name

$artifactChecksums = @()
foreach ($file in $artifacts) {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
    $artifactChecksums += "$hash  $($file.Name)"
}
$checksumText = ($artifactChecksums -join "`n") + "`n"
Write-Utf8NoBom -Path (Join-Path $releaseDir "SHA256SUMS.txt") -Content $checksumText

$notesTemplate = @'
# Browser Xray {{VERSION}}

Browser Xray is a Windows Chromium extension that routes only this browser
profile through a VLESS, VMess, Trojan, or Shadowsocks server. A small local
helper runs the bundled Xray-core engine and exposes a loopback HTTP proxy;
the browser extension points Chromium at that proxy.

## Install (recommended)

1. Download and run `BrowserXray-Setup-{{VERSION}}-win64.exe`.
   It installs for the current Windows user. No administrator rights are
   required and the system proxy is not changed.
2. Follow the installer's finish-page shortcut, or open
   `chrome://extensions` / `edge://extensions`.
3. Enable Developer mode, click **Load unpacked**, and choose
   `%LOCALAPPDATA%\BrowserXray\extension`.
4. Pin Browser Xray, add a share link, and press Connect.

The extension ID is `{{EXTENSION_ID}}`.

## Portable ZIP

Download `BrowserXray-{{VERSION}}-win64.zip`, extract it, and double-click
`Install Browser Xray.cmd`. The Start Menu and Apps & features entries are
created automatically.

## Verify

SHA-256:

```
{{CHECKSUMS}}
```

The same checksums are attached as `SHA256SUMS.txt`.

## Security notes

- The helper and Xray binaries are unsigned. Windows SmartScreen or an
  antivirus product may warn on first launch.
- The installer is per-user and does not request administrator access.
- The extension is distributed unpacked. It is not installed from the Chrome
  Web Store, so the browser requires the manual Load unpacked step.
- This build is fail-open: if the helper or tunnel stops, the browser proxy is
  cleared and the browser falls back to its normal connection.
- Saved server credentials are stored by the extension in this browser
  profile. They are not encrypted at rest.

## Uninstall

Use **Uninstall Browser Xray** in the Start Menu, or **Settings > Apps >
Installed apps**. Remove the extension separately from the browser's
extensions page; removing the extension deletes its saved profiles.
'@
$notes = $notesTemplate.Replace("{{VERSION}}", $Version).Replace("{{EXTENSION_ID}}", $extensionId).Replace("{{CHECKSUMS}}", $checksumText.TrimEnd())
Write-Utf8NoBom -Path (Join-Path $releaseDir "RELEASE_NOTES.md") -Content $notes

Write-Host ""
Write-Host "Release $Version is ready." -ForegroundColor Green
Write-Host "  Release folder : $releaseDir"
Write-Host "  Portable ZIP   : $zipPath"
if (Test-Path $setupPath) {
    Write-Host "  Installer EXE  : $setupPath"
}
Write-Host "  Checksums      : $(Join-Path $releaseDir 'SHA256SUMS.txt')"
Write-Host ""
Write-Host "Verify the installer, then publish the files in the release folder."
