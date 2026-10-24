# Shared build and install helpers for Browser Xray.
# This file is dot-sourced by the PowerShell scripts.

$ErrorActionPreference = "Stop"

$BrowserXrayVersion = "1.1.0"
$BrowserXrayHostName = "com.browserxray.helper"
$XrayVersion = "26.10.21"
$XrayZipSha256 = "fc58c39ee2f2717b4c54d28d374362389e5319b20ae44aea76ea45a5243ec827"
$GoVersion = "1.27.3"
$GoZipSha256 = "f26081f438319757f8a1b46d7d0b2c5ec7583d4038e485e0aa725cfde7885fff"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Assert-FileSha256 {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        throw "Checksum mismatch for $Path. Expected $Expected, got $actual."
    }
}

function Get-ProjectRoot {
    param([string]$ScriptRoot = $PSScriptRoot)
    return (Resolve-Path (Join-Path $ScriptRoot "..")).Path
}

function Get-ToolsDirectory {
    param([string]$ProjectRoot)
    return (Join-Path $ProjectRoot ".tools")
}

function Resolve-GoExecutable {
    param([string]$ProjectRoot)

    $tools = Get-ToolsDirectory $ProjectRoot
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $localGo = Join-Path $tools "go\bin\go.exe"

    $candidates = @()
    if (Test-Path $localGo) { $candidates += $localGo }
    $systemGo = Get-Command go -ErrorAction SilentlyContinue
    if ($systemGo) { $candidates += $systemGo.Source }

    foreach ($candidate in $candidates) {
        try {
            $version = & $candidate env GOVERSION 2>$null
            if ($LASTEXITCODE -eq 0 -and $version -match '^go(\d+)\.(\d+)') {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -gt 1 -or ($major -eq 1 -and $minor -ge 24)) {
                    return $candidate
                }
            }
        } catch {
            # Try the next candidate.
        }
    }

    $archive = Join-Path $tools "go-$GoVersion.windows-amd64.zip"
    Write-Step "Downloading Go $GoVersion"
    Invoke-WebRequest -Uri "https://go.dev/dl/go$GoVersion.windows-amd64.zip" -OutFile $archive
    Assert-FileSha256 -Path $archive -Expected $GoZipSha256

    $target = Join-Path $tools "go"
    if (Test-Path $target) { Remove-Item -Path $target -Recurse -Force }
    Write-Step "Extracting Go"
    Expand-Archive -Path $archive -DestinationPath $tools -Force
    Remove-Item $archive -Force

    if (-not (Test-Path $localGo)) {
        throw "Go extraction did not produce $localGo."
    }
    return $localGo
}

function Resolve-XrayCore {
    param([string]$ProjectRoot)

    $tools = Get-ToolsDirectory $ProjectRoot
    $xrayDir = Join-Path $tools "xray"
    $xrayExe = Join-Path $xrayDir "xray.exe"
    New-Item -ItemType Directory -Force -Path $tools | Out-Null

    if (Test-Path $xrayExe) {
        try {
            $output = & $xrayExe version 2>$null
            if (($output | Out-String) -match "Xray\s+$([regex]::Escape($XrayVersion))") {
                return $xrayExe
            }
        } catch {
            # Replace an unusable cached copy below.
        }
    }

    $archive = Join-Path $tools "Xray-$XrayVersion-windows-64.zip"
    Write-Step "Downloading Xray $XrayVersion"
    Invoke-WebRequest -Uri "https://github.com/XTLS/Xray-core/releases/download/v$XrayVersion/Xray-windows-64.zip" -OutFile $archive
    Assert-FileSha256 -Path $archive -Expected $XrayZipSha256

    if (Test-Path $xrayDir) {
        try {
            Remove-Item -Path $xrayDir -Recurse -Force
        } catch {
            throw "The existing Xray cache is in use. Disconnect the extension, close Chrome, and run the build again."
        }
    }
    Write-Step "Extracting Xray"
    Expand-Archive -Path $archive -DestinationPath $xrayDir -Force
    Remove-Item $archive -Force

    if (-not (Test-Path $xrayExe)) {
        throw "Xray extraction did not produce $xrayExe."
    }
    $output = & $xrayExe version 2>$null
    if (($output | Out-String) -notmatch "Xray\s+$([regex]::Escape($XrayVersion))") {
        throw "The downloaded Xray binary is not version $XrayVersion."
    }
    return $xrayExe
}

function Resolve-NpmExecutable {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm is required to build the extension. Install Node.js 22 or newer from https://nodejs.org/."
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js 22 or newer is required. Install it from https://nodejs.org/."
    }
    return $npm.Source
}

function Get-ExtensionIdFromManifest {
    param([Parameter(Mandatory = $true)][string]$ManifestPath)

    $manifest = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
    if (-not $manifest.key) {
        throw "The extension manifest does not contain a key. A stable extension ID is required for native messaging."
    }
    $bytes = [Convert]::FromBase64String([string]$manifest.key)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash($bytes)
    } finally {
        $sha.Dispose()
    }

    $builder = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt 16; $i++) {
        $value = [int]$hash[$i]
        [void]$builder.Append([char](97 + ($value -shr 4)))
        [void]$builder.Append([char](97 + ($value -band 15)))
    }
    return $builder.ToString()
}

function Get-NativeHostRegistryKeys {
    param([string]$HostName = $BrowserXrayHostName)

    $roots = @(
        "HKCU:\Software\Google\Chrome\NativeMessagingHosts",
        "HKCU:\Software\Google\Chrome Beta\NativeMessagingHosts",
        "HKCU:\Software\Google\Chrome Dev\NativeMessagingHosts",
        "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts",
        "HKCU:\Software\Chromium\NativeMessagingHosts",
        "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
        "HKCU:\Software\Vivaldi\NativeMessagingHosts"
    )
    return $roots | ForEach-Object { Join-Path $_ $HostName }
}

function Get-DefaultInstallDirectory {
    if (-not $env:LOCALAPPDATA) {
        throw "LOCALAPPDATA is not defined. This installer requires Windows."
    }
    return (Join-Path $env:LOCALAPPDATA "BrowserXray")
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Stop-BrowserXrayProcesses {
    param([Parameter(Mandatory = $true)][string]$InstallDir)

    $binDir = Join-Path $InstallDir "bin"
    $statePath = Join-Path $InstallDir "runtime\state.json"

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
            # The state may be stale or unreadable.
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
}

function Write-CmdFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $normalized = (($Content -replace "`r`n", "`n") -replace "`n", "`r`n")
    Write-Utf8NoBom -Path $Path -Content $normalized
}

function Get-BrowserXrayStartMenuDirectory {
    if (-not $env:APPDATA) {
        throw "APPDATA is not defined. This operation requires Windows."
    }
    return (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Browser Xray")
}

function New-BrowserXrayShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [string]$WorkingDirectory = "",
        [string]$IconPath = "",
        [string]$Description = ""
    )

    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    try {
        $shortcut = $shell.CreateShortcut($Path)
        $shortcut.TargetPath = $TargetPath
        if ($WorkingDirectory) { $shortcut.WorkingDirectory = $WorkingDirectory }
        if ($IconPath) { $shortcut.IconLocation = "$IconPath,0" }
        if ($Description) { $shortcut.Description = $Description }
        $shortcut.WindowStyle = 1
        $shortcut.Save()
    } finally {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) } catch { }
    }
}

function Install-BrowserXrayShortcuts {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDir,
        [Parameter(Mandatory = $true)][string]$ToolsDir,
        [string]$IconPath = "",
        [switch]$DesktopShortcut
    )

    $startMenuDir = Get-BrowserXrayStartMenuDirectory
    New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

    $openCmd = Join-Path $ToolsDir "Open Browser Xray.cmd"
    $uninstallCmd = Join-Path $ToolsDir "Uninstall Browser Xray.cmd"
    $readme = Join-Path $InstallDir "README.txt"
    if (-not (Test-Path $readme)) {
        $readme = Join-Path $InstallDir "README.md"
    }

    New-BrowserXrayShortcut `
        -Path (Join-Path $startMenuDir "Browser Xray.lnk") `
        -TargetPath $openCmd `
        -WorkingDirectory $InstallDir `
        -IconPath $IconPath `
        -Description "Finish Browser Xray setup in your browser"

    New-BrowserXrayShortcut `
        -Path (Join-Path $startMenuDir "Uninstall Browser Xray.lnk") `
        -TargetPath $uninstallCmd `
        -WorkingDirectory $InstallDir `
        -IconPath $IconPath `
        -Description "Uninstall Browser Xray"

    if (Test-Path $readme) {
        New-BrowserXrayShortcut `
            -Path (Join-Path $startMenuDir "Browser Xray Help.lnk") `
            -TargetPath $readme `
            -WorkingDirectory $InstallDir `
            -Description "Browser Xray documentation"
    }

    if ($DesktopShortcut) {
        $desktop = [Environment]::GetFolderPath("Desktop")
        if ($desktop) {
            New-BrowserXrayShortcut `
                -Path (Join-Path $desktop "Browser Xray.lnk") `
                -TargetPath $openCmd `
                -WorkingDirectory $InstallDir `
                -IconPath $IconPath `
                -Description "Finish Browser Xray setup in your browser"
        }
    }
}

function Remove-BrowserXrayShortcuts {
    $startMenuDir = Get-BrowserXrayStartMenuDirectory
    if (Test-Path $startMenuDir) {
        Remove-Item -Path $startMenuDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $desktop = [Environment]::GetFolderPath("Desktop")
    if ($desktop) {
        $shortcut = Join-Path $desktop "Browser Xray.lnk"
        if (Test-Path $shortcut) {
            Remove-Item -Path $shortcut -Force -ErrorAction SilentlyContinue
        }
    }
}

function Register-BrowserXrayUninstallEntry {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDir,
        [Parameter(Mandatory = $true)][string]$ToolsDir,
        [string]$IconPath = "",
        [string]$Version = $BrowserXrayVersion
    )

    $key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BrowserXray"
    New-Item -Path $key -Force | Out-Null

    $uninstallCmd = Join-Path $ToolsDir "Uninstall Browser Xray.cmd"
    $uninstallString = "`"$env:SystemRoot\System32\cmd.exe`" /c `"`"$uninstallCmd`"`""

    $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $uninstallScript = Join-Path $ToolsDir "uninstall.ps1"
    $quietUninstallString = "`"$powershell`" -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`" -InstallDir `"$InstallDir`" -Force"

    $size = 0
    try {
        $bytes = (Get-ChildItem -Path $InstallDir -Recurse -File -ErrorAction Stop | Measure-Object -Property Length -Sum).Sum
        if ($bytes) { $size = [int][Math]::Ceiling($bytes / 1KB) }
    } catch {
        # Size is informational only.
    }

    $properties = [ordered]@{
        DisplayName         = "Browser Xray"
        DisplayVersion      = $Version
        Publisher           = "Browser Xray contributors"
        InstallLocation     = $InstallDir
        InstallDate         = (Get-Date -Format "yyyyMMdd")
        UninstallString     = $uninstallString
        QuietUninstallString = $quietUninstallString
        NoModify            = 1
        NoRepair            = 1
        EstimatedSize       = $size
    }
    if ($IconPath -and (Test-Path $IconPath)) {
        $properties.DisplayIcon = "$IconPath,0"
    }

    $dwordNames = @("NoModify", "NoRepair", "EstimatedSize")
    foreach ($name in $properties.Keys) {
        $type = if ($dwordNames -contains $name) { "DWord" } else { "String" }
        New-ItemProperty -Path $key -Name $name -Value $properties[$name] -PropertyType $type -Force | Out-Null
    }
}

function Remove-BrowserXrayUninstallEntry {
    $key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BrowserXray"
    if (Test-Path $key) {
        Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue
    }
}
