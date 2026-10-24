# Releasing Browser Xray

This project produces two equivalent per-user installation paths:

| Artifact | Purpose |
| --- | --- |
| `BrowserXray-Setup-<version>-win64.exe` | Recommended one-click Windows installer. Includes an uninstaller, Start Menu entries, and Apps & features registration. |
| `BrowserXray-<version>-win64.zip` | Portable release folder with `Install Browser Xray.cmd`. Useful when an EXE is blocked or you want to inspect the scripts first. |
| `SHA256SUMS.txt` | SHA-256 checksums for the ZIP and Setup EXE. |
| `RELEASE_NOTES.md` | Release text and checksums, also used by the GitHub Actions release job. |

Both installers are **per-user**. They write to `%LOCALAPPDATA%\BrowserXray`, register native messaging under `HKCU`, and never request administrator rights or change the Windows system proxy.

## Versioning

Use a three-part numeric version such as `1.0.0`. Chrome extension manifests do not accept arbitrary SemVer suffixes.

Before building, bump the version in all three places:

- `scripts/common.ps1` (`$BrowserXrayVersion`)
- `extension/public/manifest.json` (`version`)
- `extension/package.json` (`version`)

If you use npm, the package lock can be refreshed with:

```powershell
cd extension
npm install --package-lock-only
```

`scripts/release.ps1` refuses to build if those versions do not match.

## Prerequisites for a local release build

- Windows 10 or 11 x64.
- PowerShell 5.1 or newer.
- Node.js 22 or newer.
- Go 1.24 or newer on `PATH`; otherwise `build.ps1` downloads the pinned Go toolchain.
- Inno Setup 6.4 or newer for the Setup EXE. Install it without administrator rights:

  ```powershell
  winget install --id JRSoftware.InnoSetup -e --scope user
  ```

  The release script also finds a machine-wide Inno Setup installation in the usual Program Files locations.

  Inno Setup 6.7.3 reports "Non-commercial use only" when compiling. Review the
  current Inno Setup license before distributing a commercial product; use an
  appropriately licensed compiler if your release is commercial.

The Xray-core and Go downloads are pinned and checksum-verified in `scripts/common.ps1`.

## Build a release

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version 1.0.0
```

The script:

1. Runs the extension and helper tests and builds the extension and helper.
2. Copies the helper, Xray-core, extension, licenses, and installer scripts into
   `release\BrowserXray-1.0.0-win64\`.
3. Writes a package-level `SHA256SUMS.txt`.
4. Creates `release\BrowserXray-1.0.0-win64.zip`.
5. Compiles `release\BrowserXray-Setup-1.0.0-win64.exe` with Inno Setup.
6. Writes the final artifact checksums and `RELEASE_NOTES.md`.

Useful switches:

```powershell
# Reuse the existing dist/ output and skip tests
.\scripts\release.ps1 -Version 1.0.0 -SkipBuild

# Build only the portable folder and ZIP
.\scripts\release.ps1 -Version 1.0.0 -SkipInstaller
```

## Test the artifacts before publishing

1. Run the Setup EXE as a normal user. Do not use "Run as administrator".
2. Confirm the extension folder is created at
   `%LOCALAPPDATA%\BrowserXray\extension`.
3. Confirm the native host manifest exists at
   `%LOCALAPPDATA%\BrowserXray\com.browserxray.helper.json`.
4. Confirm the browser extension page opens and the extension can be loaded
   unpacked with ID `jmopdjjejcocokfkcjjpalhadkdmjklc`.
5. Connect to a test server and verify normal browsing plus the exit-IP check.
6. Uninstall from **Settings > Apps > Installed apps** or the Start Menu.
   Confirm the helper processes stop and `%LOCALAPPDATA%\BrowserXray` is
   removed. Remove the extension separately.
7. Repeat the install/uninstall test from the ZIP using
   `Install Browser Xray.cmd`.

A silent test install can be done with a temporary directory. The
`SKIPNATIVEREG=1` switch is a test-only switch that prevents the installer from
changing the browser native-messaging registry keys:

```powershell
$testDir = Join-Path $env:TEMP "BrowserXray-InstallerTest"
Start-Process .\release\BrowserXray-Setup-1.0.0-win64.exe `
  -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=`"$testDir`" /SKIPNATIVEREG=1" `
  -Wait
Test-Path (Join-Path $testDir "com.browserxray.helper.json")
& (Join-Path $testDir "unins000.exe") /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

## Publish on GitHub

The workflow in `.github/workflows/release.yml` builds on a `v*` tag and creates
a GitHub Release with the ZIP, Setup EXE, checksums, and release notes.

One-time repository setup:

```powershell
git init
git add .
git commit -m "Initial Browser Xray release"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

The workflow installs Node, Go, and Inno Setup on a `windows-latest` runner,
runs the tests, builds both artifacts, and creates the release. It needs the
default `GITHUB_TOKEN` with `contents: write`, which is declared in the
workflow. No personal token is stored in the repository.

You can also run the workflow manually from the Actions tab. A manual run builds
and uploads the artifacts, but does not create a GitHub Release; use a tag for
the publish step.

### Manual release with the GitHub CLI

If you prefer not to use Actions:

```powershell
gh release create v1.0.0 `
  .\release\BrowserXray-Setup-1.0.0-win64.exe `
  .\release\BrowserXray-1.0.0-win64.zip `
  .\release\SHA256SUMS.txt `
  --title "Browser Xray v1.0.0" `
  --notes-file .\release\RELEASE_NOTES.md
```

## Code signing

The current artifacts are **unsigned**. Windows SmartScreen and some antivirus
products may show a warning on first launch. This is expected for a new,
unsigned publisher.

For a production release, sign the following before creating the GitHub Release:

- `helper\browser-xray-helper.exe`
- `helper\xray.exe`
- `BrowserXray-Setup-<version>-win64.exe`

Use a trusted code-signing certificate with `signtool.exe`, for example:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
  /a .\dist\helper\browser-xray-helper.exe
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
  /a .\dist\helper\xray.exe
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
  /a .\release\BrowserXray-Setup-1.0.0-win64.exe
```

Rebuild the ZIP and checksums after signing any files that are inside the ZIP.
Keep the signing certificate and its password out of the repository and CI logs.

## What must never be committed or uploaded

- `.extension-key.pem` - private extension signing key.
- `node_modules/`, `.tools/`, `dist/`, `release/`, and `*.zip` build outputs.
- Browser profiles, helper logs, runtime state, or `runtime/config.json`.
- Any file containing a real UUID, password, or share link used for testing.

`.gitignore` excludes these. Release staging only copies an explicit allowlist
from `dist/`, so the extension key is not included in the ZIP or Setup EXE.

## Release checklist

- [ ] Version bumped in `common.ps1`, `manifest.json`, and `package.json`.
- [ ] `npm test` passes.
- [ ] `go test ./...` passes.
- [ ] `node scripts/test-helper.mjs` passes.
- [ ] `node scripts/test-e2e.mjs` passes.
- [ ] `scripts/release.ps1` completes without errors.
- [ ] Setup EXE installs and uninstalls as a normal user.
- [ ] Portable ZIP installs and uninstalls as a normal user.
- [ ] Extension loads with the expected ID and connects through a real server.
- [ ] `SHA256SUMS.txt` verifies.
- [ ] Unsigned-binary warning is mentioned in the release notes.
- [ ] Tag pushed as `v<version>`.
