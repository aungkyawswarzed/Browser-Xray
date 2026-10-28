# Changelog

## 1.2.0

### Added

- Added a **Whitelist** in Settings. Listed domains and their subdomains bypass
  the tunnel, can be added from a domain or full URL, and apply immediately
  while connected.
- Added browser-restart detection. A new browser session clears the old proxy,
  disconnects the previous helper session, marks the connection as disconnected,
  and shows a dismissible **Connection reset** notice so the user can reconnect.
- Added whitelist validation, deduplication, a 50-entry limit, and tests for
  domain normalization, proxy bypass patterns, and browser-session resets.

### Changed

- Service-worker restarts within the same browser session still recover the
  existing tunnel; only a new browser session forces a manual reconnect.
- Diagnostics now include the whitelist.

### Fixed

- **Open data folder** now opens a visible File Explorer window instead of a
  hidden one.

## 1.1.0

- Added a main-screen GitHub update checker with cached automatic checks and a
  manual **Check for updates** button.
- New-version notice links directly to the matching GitHub release with
  **Update**; installation and extension reload remain manual.
- Added restricted GitHub API host permission, numeric version comparison,
  stable-release validation, timeouts, error/backoff handling, and update tests.
- Update requests omit credentials/profile data; API/cache URLs are not trusted.
- Chrome/Edge may ask to approve the new GitHub API permission after upgrading.
  Reload the extension after installation; saved servers remain intact.

## 1.0.1

### Fixed

- Setup uninstall now removes application-owned leftovers from older source/ZIP
  installs: old files in `bin`, stale extension assets, and old license files.
- Existing removal of logs, runtime state, tools, native-host registration,
  Start Menu/desktop shortcuts, and the Apps entry is retained.
- Setup now lets users choose the Start Menu folder and honors `/GROUP` for
  isolated regression tests.

### Documentation and verification

- Added direct download links, upgrade and shortcut instructions, checksum
  verification, and explicit cleanup boundaries.
- Added a repeatable installer regression test for stale-file cleanup that
  preserves an existing user's native registration, shortcuts, and Apps entry.
- Updated release/versioning and repository About maintenance instructions.

No proxy-protocol or routing behavior changed. Extension removal remains manual;
remove it through Chrome/Edge to delete browser-stored profiles and clear its
browser-managed proxy settings. The installer does not delete downloaded release
files, source code, or unrelated browser data.

## 1.0.0 (GitHub tag `v1.0`)

- Initial Windows x64 release: Chromium MV3 extension and native Go helper with
  bundled Xray-core, supporting VLESS, VMess, Trojan, and Shadowsocks share links.
- Per-user Setup EXE and ZIP installation with native messaging, Start Menu
  shortcuts, optional desktop shortcut, Apps entry, licenses, and uninstallers.
- Published installer, ZIP, checksums, and release notes.

## Known limitations

- Windows/Chromium only; extension must be loaded unpacked in Developer mode.
- Unsigned binaries may trigger SmartScreen/antivirus warnings.
- Fail-open routing; no UDP/WebRTC protection or system-wide VPN/TUN.
- Saved credentials are not encrypted at rest.
- Automated data-path tests use a local VLESS server; live commercial-server
  browsing and interactive browser UI checks still require manual testing.
