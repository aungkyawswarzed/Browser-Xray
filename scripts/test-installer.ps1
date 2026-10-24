[CmdletBinding()]
param([string]$SetupPath = "")

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
if (-not $SetupPath) {
    $SetupPath = Join-Path (Get-ProjectRoot $PSScriptRoot) "release\BrowserXray-Setup-$BrowserXrayVersion-win64.exe"
}
$SetupPath = (Resolve-Path $SetupPath).Path
$testId = "BrowserXray-Test-" + [Guid]::NewGuid().ToString('N')
$work = Join-Path $env:TEMP $testId
$target = Join-Path $work "app"
$group = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$testId"
$appKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{E578032E-AFEE-4025-A9B1-C27AB1417DD9}_is1'
$regKey = $appKey.Replace('HKCU:\', 'HKCU\')
New-Item -ItemType Directory -Path $work | Out-Null
$backup = Join-Path $work 'uninstall-entry.reg'
$hadEntry = Test-Path $appKey
$hosts = @{}
foreach ($key in Get-NativeHostRegistryKeys) {
    $hosts[$key] = if (Test-Path $key) { (Get-Item $key).GetValue('') } else { $null }
}

# reg.exe writes success messages to stderr on some Windows versions. Rely on
# its exit code, not PowerShell's NativeCommandError stream.
function Invoke-TestReg {
    param([string[]]$RegArguments)
    $saved = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & reg.exe @RegArguments *> $null
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $saved }
    if ($code -ne 0) { throw "Registry backup/restore failed (exit $code). Backup: $backup" }
}

if ($hadEntry) { Invoke-TestReg -RegArguments @('export', $regKey, $backup, '/y') }
$restored = $false
try {
    $args = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SKIPNATIVEREG=1 /TASKS="" /DIR="' + $target + '" /GROUP="' + $testId + '" /LOG="' + (Join-Path $work 'install.log') + '"'
    $p = Start-Process $SetupPath -ArgumentList $args -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Install failed: $($p.ExitCode). Logs: $work" }
    foreach ($file in @('bin\browser-xray-helper.exe', 'bin\xray.exe', 'extension\manifest.json', 'licenses\LICENSE', 'unins000.exe')) {
        if (-not (Test-Path (Join-Path $target $file))) { throw "Missing installed file: $file" }
    }
    foreach ($file in @('Browser Xray.lnk', 'Browser Xray Help.lnk', 'Uninstall Browser Xray.lnk')) {
        if (-not (Test-Path (Join-Path $group $file))) { throw "Missing Start Menu shortcut: $file" }
    }
    if ((Get-ItemProperty $appKey).InstallLocation.TrimEnd('\') -ne $target) { throw 'Incorrect Apps entry' }
    $manifest = Get-Content (Join-Path $target 'com.browserxray.helper.json') -Raw | ConvertFrom-Json
    if ($manifest.path -ne (Join-Path $target 'bin\browser-xray-helper.exe')) { throw 'Incorrect native manifest' }
    if ($manifest.allowed_origins[0] -ne 'chrome-extension://jmopdjjejcocokfkcjjpalhadkdmjklc/') { throw 'Incorrect extension ID' }
    Write-Output 'PASS installed files, shortcuts, manifest, and Apps entry'

    foreach ($file in @('bin\LICENSE-Xray-core.txt', 'extension\assets\obsolete.js', 'licenses\old.txt', 'logs\old.log', 'runtime\state.json', 'tools\old.cmd')) {
        $path = Join-Path $target $file
        New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
        Set-Content $path 'test leftover'
    }
    $p = Start-Process (Join-Path $target 'unins000.exe') -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Uninstall failed: $($p.ExitCode)" }
    Start-Sleep -Milliseconds 700
    if (Test-Path $target) { throw "Install leftovers remain: $target" }
    if (Test-Path $group) { throw "Shortcut leftovers remain: $group" }
    if (Test-Path $appKey) { throw 'Test Apps entry remains' }
    Write-Output 'PASS uninstall removes legacy files, runtime, logs, shortcuts, and Apps entry'
} finally {
    # If an assertion fails, still remove the isolated test installation first.
    if (Test-Path (Join-Path $target 'unins000.exe')) {
        $cleanup = Start-Process (Join-Path $target 'unins000.exe') -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru
        if ($cleanup.ExitCode -ne 0) { Write-Warning "Test cleanup failed; retained $work" }
    }
    if ($hadEntry) {
        Invoke-TestReg -RegArguments @('import', $backup)
    } elseif (Test-Path $appKey) {
        # Only remove a test-owned entry; never delete a concurrent real install.
        if ((Get-ItemProperty $appKey).InstallLocation.TrimEnd('\') -eq $target) {
            Remove-Item $appKey -Recurse -Force
        }
    }
    $restored = $true
}
foreach ($key in $hosts.Keys) {
    $value = if (Test-Path $key) { (Get-Item $key).GetValue('') } else { $null }
    if ($value -ne $hosts[$key]) { throw "Native registration changed: $key" }
}
if ($restored -and -not (Test-Path $target) -and -not (Test-Path $group)) {
    Remove-Item $work -Recurse -Force
}
Write-Output 'PASS existing Apps entry restored and native registrations unchanged'
