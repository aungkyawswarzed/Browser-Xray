# Browser Xray 1.0.1 validation

## Scope

Windows x64 local release build, per-user installation, and automated local
data-path tests. This patch improves installer cleanup and documentation; it
does not change protocol parsing or proxy-routing behavior.

## Automated checks

Run from the repository root:

```powershell
.\scripts\release.ps1 -Version 1.0.1
node scripts/test-helper.mjs
node scripts/test-e2e.mjs
.\scripts\test-installer.ps1
git diff --check
```

- Release build: succeeds with extension TypeScript/Vite build, **15 extension
  tests**, Go helper unit tests, ZIP creation, and Inno Setup compilation.
- Helper integration: **25/25**, including native framing, loopback listener,
  generated VLESS/REALITY configuration, disconnect, and child-process cleanup.
- Local VLESS end-to-end: **19/19**, including HTTP and CONNECT traffic through
  the helper/Xray to a locally hosted VLESS server.
- Installer regression: verifies installed payload, native manifest/extension
  ID, Start Menu shortcuts, and Apps entry. Seeds stale files in `bin`,
  `extension/assets`, `licenses`, `runtime`, `logs`, and `tools`; uninstall must
  remove the test directory and its shortcuts/Apps entry completely.
- The installer test preserves the pre-existing Apps entry and native-host
  values. The real install's shortcuts and uninstaller are checked afterward.
- Distribution checksums are verified against the final ZIP/EXE; package-level
  checksums cover every staged payload file other than the checksum file itself.
- Release assets are verified against GitHub's uploaded asset sizes and SHA-256
  digests before publishing. The release tag must resolve to the source commit.
- Private extension keys, real browser profiles, runtime configs, dependency
  folders, and logs are excluded from tracked files/release payloads.

## Limits and manual follow-up

- Interactive Setup wizard, Chrome/Edge popup/service worker, real proxy-server
  browsing, and exit-IP checks still require manual testing. Automated tests do
  not establish compatibility with every protocol/server combination.
- The ZIP install/uninstall path was tested for the earlier 1.0.0 build; the new
  regression test exercises the Setup EXE, not every ZIP-install option.
- The already-installed local copy remains 1.0.0 with the cleanup fix. Publishing
  1.0.1 does not silently upgrade it or alter saved browser profiles.
- Binaries remain unsigned. Inno Setup compiler licensing must be reviewed for
  commercial builds; see `RELEASING.md`.
- Browser extension removal remains a browser-managed manual operation. No
  browser profile databases or unrelated browser data are modified by uninstall.

## Published files

- `BrowserXray-Setup-1.0.1-win64.exe`
- `BrowserXray-1.0.1-win64.zip`
- `SHA256SUMS.txt`
- `RELEASE_NOTES.md`

The published release's checksum file is the authority for exact binary hashes;
build timestamps can make independently rebuilt installers differ byte-for-byte.
