# Browser Xray 1.2.0 validation

## Release scope

Adds the Settings whitelist and browser-restart connection reset. Installer,
helper, Xray routing, and the update checker are unchanged except for
synchronized version declarations.

## Automated validation

From the repository root on Windows x64:

```powershell
.\scripts\release.ps1 -Version 1.2.0
node scripts/test-helper.mjs
node scripts/test-e2e.mjs
.\scripts\test-installer.ps1
git diff --check
```

- **81 extension tests**: whitelist normalization, deduplication, the 50-entry
  cap, Chrome bypass patterns, proxy application, browser-session reset,
  same-session recovery, plus the existing parser/native/update tests.
- TypeScript checking, production popup/background build, and Go unit tests.
- **25 helper integration checks**, **19 local VLESS end-to-end checks**.
- Installer regression verifies payload, manifest/extension ID, Start Menu
  shortcuts, Apps entry, and full removal of seeded legacy/runtime/log files.
  The pre-existing Apps entry and native registrations are preserved.
- Final staged payload checksums, ZIP contents, release asset SHA-256 digests,
  version declarations, and tag-to-source commit are checked before completion.

GitHub Actions independently rebuilds the tagged source and runs the extension,
helper, local data-path, and installer suites. It preserves already-published
release assets rather than replacing their binaries or checksums.

## Upgrade and manual checks

1. Disconnect the tunnel; run `BrowserXray-Setup-1.2.0-win64.exe` for the same
   Windows user and installation directory.
2. Open `chrome://extensions` / `edge://extensions` and reload Browser Xray. No
   new permissions are required. Saved servers and the whitelist should remain
   available.
3. Verify the popup footer is `v1.2.0`.
4. While connected, open **Settings → Whitelist** and add an IP-echo site such as
   `ifconfig.me`. Visiting it should show the normal connection's address, while
   **Check exit IP** (`api.ipify.org`) still shows the tunnel address. Remove the
   entry and verify the site uses the tunnel again without reconnecting.
5. With the tunnel connected, fully exit and restart Chrome/Edge. Verify the
   status is disconnected, the **Connection reset** notice appears, and the
   browser uses its normal connection. Dismiss the notice and verify it stays
   dismissed. Press **Connect** and verify the tunnel returns.
6. A full browser restart is required: closing the last window does not count if
   the browser is configured to keep running background apps.
7. With 1.2.0 as the latest GitHub release, **Check for updates** should report
   up to date. A newer stable release should still show **Update**.

Automated tests cover whitelist/proxy application and simulated browser-session
resets. Actual Chrome/Edge popup interaction, a real browser restart, and live
commercial-server browsing require manual testing.

## Artifacts and limitations

- `BrowserXray-Setup-1.2.0-win64.exe`
- `BrowserXray-1.2.0-win64.zip`
- `SHA256SUMS.txt`
- `RELEASE_NOTES.md`

Checksums are in the release assets, not fixed here because rebuild timestamps
may change binary hashes. Credentials remain unencrypted at rest, routing is
fail-open, UDP/WebRTC is not protected, and binaries remain unsigned. Review
Inno Setup licensing for commercial distribution; see `RELEASING.md`.
