# Browser Xray 1.1.0 validation

## Release scope

Adds the main-screen GitHub update checker. Install/uninstall, helper, and Xray
routing behavior remain unchanged except for synchronized version declarations.

## Automated validation

From the repository root on Windows x64:

```powershell
.\scripts\release.ps1 -Version 1.1.0
node scripts/test-helper.mjs
node scripts/test-e2e.mjs
.\scripts\test-installer.ps1
git diff --check
```

- **55 extension tests**: parser/native-client baseline plus update version
  comparisons, stable-release validation, six-hour cache, 15-minute failure
  backoff, forced checks, concurrent request deduplication, HTTP/JSON/network
  failures, request timeout, unavailable storage, and safe release-page URLs.
- Update notice rendering: correct version/link, no notice for equal/older
  versions, retained notice after a failed check, and disabled check button while
  checking. An absent/failed result is never reported as up to date.
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

1. Disconnect the tunnel; run `BrowserXray-Setup-1.1.0-win64.exe` for the same
   Windows user and installation directory.
2. Open `chrome://extensions` / `edge://extensions`, reload Browser Xray, and
   approve the new `api.github.com` permission/re-enable the extension if asked.
3. Verify the popup footer is `v1.1.0` and **Check for updates** appears on the
   main screen. Saved servers should remain available.
4. With 1.1.0 as the latest GitHub release, a successful check should report up to
   date. A newer stable release should show **Update**, opening its release page
   in a new tab. This does not automatically install software or stop the tunnel.

Automated tests cover simulated newer/equal/older/error responses. Actual
Chrome/Edge popup interaction and permission prompts require manual testing.
Real commercial-server browsing is not covered by the local VLESS tests.

The machine installation verifies files/manifest, helper version, native
registration, Start Menu/desktop targets, and the Apps/uninstaller entry. The
browser's already-loaded extension can remain on its old version until reloaded;
installing files does not imply that Chrome has reloaded them.

## Artifacts and limitations

- `BrowserXray-Setup-1.1.0-win64.exe`
- `BrowserXray-1.1.0-win64.zip`
- `SHA256SUMS.txt`
- `RELEASE_NOTES.md`

Checksums are in the release assets, not fixed here because rebuild timestamps
may change binary hashes. Credentials remain unencrypted at rest, routing is
fail-open, UDP/WebRTC is not protected, and binaries remain unsigned. Review
Inno Setup licensing for commercial distribution; see `RELEASING.md`.
