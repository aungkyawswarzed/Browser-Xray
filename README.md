# Browser Xray

A Windows browser extension that connects this browser profile - and only this browser profile - to a VLESS, VMess, Trojan, or Shadowsocks server. It uses a small local helper that runs the bundled [Xray-core](https://github.com/XTLS/Xray-core) engine and exposes a loopback HTTP proxy. Chrome's extension proxy API points the browser at that loopback port. Windows, other browsers, and other applications are never touched.

**Status:** working Windows x64 build for Chrome, Edge, and other Chromium browsers, with a per-user Setup EXE and a portable ZIP. The helper protocol, Xray configuration generation, and the full local data path (HTTP and CONNECT through a real local VLESS hop) are tested. It has not yet been tried against a live commercial proxy from this machine.

## Why a helper?

A Manifest V3 extension cannot open an arbitrary TCP connection, run Xray, or implement VLESS/REALITY itself. The browser extension talks to a native helper over Chrome's [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) channel:

```
Chrome / Edge (this profile only)
        |
        | chrome.proxy -> 127.0.0.1:<random port>
        v
  local HTTP proxy (Xray inbound)
        |
        | VLESS / VMess / Trojan / Shadowsocks
        v
  your proxy server  ->  internet

  extension  <-- native messaging (stdio) -->  browser-xray-helper.exe
                                                 |
                                                 +-- xray.exe (child process)
```

The helper listens only on `127.0.0.1` and is registered for one specific extension ID. No hosted backend, account, or proxy service is involved.

## Requirements

For end users:

- Windows 10 or 11, x64.
- Chrome 120+, Edge 120+, or another Chromium browser that supports MV3 and `chrome.proxy`.
- No administrator rights. The helper installs into `%LOCALAPPDATA%\BrowserXray`.

For building from source:

- Node.js 22+ and PowerShell 5.1+.
- Go 1.24+ (downloaded automatically if a suitable version is not on `PATH`).
- Inno Setup 6.4+ only if you want to build the single-file Setup EXE. The portable ZIP does not need it.

## Install a release

Download the files from the GitHub Releases page, or use the `release/` output from a local build.

**Recommended:** run `BrowserXray-Setup-<version>-win64.exe`. It is a per-user installer: it copies the helper and extension, registers the native messaging host, creates Start Menu and Apps & features entries, and includes an uninstaller. It does not request administrator rights and does not change the system proxy.

**Portable:** extract `BrowserXray-<version>-win64.zip` and double-click `Install Browser Xray.cmd`. It performs the same per-user install without the Setup EXE.

After either install:

1. The installer opens `chrome://extensions` (or `edge://extensions`) and the extension folder. If it did not, open the page manually.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select:
   `%LOCALAPPDATA%\BrowserXray\extension`
4. If the extension was already loaded, click its **Reload** button.
5. Pin Browser Xray. Open the popup, click **Add**, paste one or more share links, import, and press the power button.

The extension ID must remain `jmopdjjejcocokfkcjjpalhadkdmjklc`. The installer registers the native helper for Chrome, Chrome Beta/Dev, Edge, Chromium, Brave, and Vivaldi under `HKCU`.

The binaries are unsigned. Windows SmartScreen or an antivirus product may warn on first launch. See [RELEASING.md](RELEASING.md) for build, signing, and publishing details.

## Build from source

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

`build.ps1` writes a runnable distribution to `dist/`. It also contains a portable one-click installer (`dist\install.cmd`). To build the full release folder, portable ZIP, checksums, and Setup EXE:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1
```

Release artifacts are written to `release/`. See [RELEASING.md](RELEASING.md) for the version bump, GitHub Actions, and signing workflow.

## Supported links

| Protocol | Link form | Notes |
| --- | --- | --- |
| VLESS | `vless://uuid@host:port?...#name` | `encryption=none`; optional `flow=xtls-rprx-vision` |
| VMess | `vmess://BASE64(JSON)` | standard v2rayN-style JSON, `alterId` is supported |
| Trojan | `trojan://password@host:port?...#name` | TLS by default, REALITY optional |
| Shadowsocks | `ss://...` SIP002 | AEAD and 2022 methods, no plugins |

Supported transport/security combinations:

- Transports: `tcp`, `ws`, `httpupgrade`, `xhttp`, `grpc`.
- Security: `none`, `tls`, `reality`.
- TLS options: SNI, ALPN, fingerprint, `allowInsecure`.
- REALITY options: `pbk`, `sid`, `spx`, SNI, fingerprint. REALITY over WebSocket is rejected.
- IPv4, IPv6 literals, and hostnames.
- VLESS `flow=xtls-rprx-vision` requires TCP plus TLS or REALITY.

Not supported in this build: KCP/QUIC/H2 transports, Shadowsocks plugins (obfs, v2ray-plugin), TUN/system-wide mode, subscription URLs, multiple simultaneous tunnels, Firefox's `proxy.onRequest` model, and SOCKS links. Unsupported links are rejected with a message before they are saved.

## Using it

- **Connect** starts a private Xray process, verifies its configuration with `xray run -test`, waits for the loopback proxy to accept connections, then applies a fixed proxy to the regular browser profile.
- **Check exit IP** makes one HTTPS request to `api.ipify.org` through the tunnel. It is user-initiated; nothing is sent in the background.
- Selecting another server while connected automatically reconnects to it.
- The power button disconnects, clears the browser proxy, stops Xray, and removes the runtime state.
- **Settings** shows helper/Xray versions, the data folder, the browser proxy state, and a diagnostics report. Copying diagnostics does not include UUIDs or passwords.
- Settings can clear all saved servers. Removing the extension also removes its saved profiles from Chrome's extension storage.

Browser proxy settings are applied to the whole regular browser profile, not to one tab. Incognito windows inherit the setting if the extension is allowed in Incognito; Chrome's own extension settings decide that.

## Privacy and security

What is local:

- Profiles (including UUIDs and passwords) are stored in `chrome.storage.local` for this browser profile. They are not synced by Chrome and never sent to a project server.
- The helper writes the generated Xray config to `%LOCALAPPDATA%\BrowserXray\runtime\config.json` so Xray can read it. That file contains the selected server's credentials.
- Logs live in `%LOCALAPPDATA%\BrowserXray\logs`.
- The HTTP proxy listens only on `127.0.0.1` with a random port. It has no password; any local process that can reach the port could use it while connected.

What is not protected:

- Saved credentials are **not encrypted at rest**. They are protected only by your Windows user account and Chrome profile permissions.
- This is **fail-open**, not a leak-protection kill switch. If the helper stops or the tunnel fails, the extension clears Chrome's proxy and the browser falls back to its normal connection. Disconnect or close the browser if you need strict blocking.
- WebRTC can bypass a browser proxy. If you need strict leak protection, disable WebRTC in the browser or use a browser policy.
- DNS for the proxy server's hostname is resolved locally by Xray. Website hostnames are normally passed to the proxy server, so remote DNS is preserved for browsing. A browser can still perform some background DNS lookups outside the proxy.
- QUIC/HTTP3 is not proxied by Chromium's HTTP proxy. Chrome falls back to TCP when a proxy is configured, but WebRTC/UDP traffic is outside this tunnel.
- The binaries are unsigned, so Windows SmartScreen or an antivirus product may warn the first time. Build from source or add your own code-signing step if this matters.

Only install a helper build you trust: the extension's native host permission lets that helper start a local process and receive the server profile on stdin.

## How recovery works

The extension opens a long-lived native messaging port while connected, which also keeps the MV3 service worker alive. If Chrome closes the port, the helper sees EOF, stops Xray, and exits. On Windows, Xray is additionally assigned to a Job Object with `KILL_ON_JOB_CLOSE`, so a helper crash or Chrome termination does not leave an orphaned Xray process.

The native port is closed when disconnected. On browser startup (or after an extension update), the extension checks the persisted connection state:

- If the previous session was connected and the helper still has the same tunnel, it re-applies the browser proxy.
- If the tunnel is gone, it reconnects once with the last profile.
- If that fails, it clears the proxy and shows the error, so the browser is not left pointing at a dead port.

The helper stores only `pid`, `port`, `profileId`, and `startedAt` in `runtime/state.json`. It does not persist secrets outside the Xray config.

## Development

Project layout:

```
extension/               React + TypeScript MV3 popup and service worker
  src/parser.ts          Share-link parser (Vitest tests in parser.test.ts)
  src/background.ts      Native messaging, proxy apply/verify, recovery
  src/lib/native.ts      Framed native-messaging client
  src/lib/proxy.ts       chrome.proxy apply/clear/verify
  public/manifest.json   MV3 manifest with the pinned extension key
helper/cmd/helper/       Go native messaging host
  config.go              Profile validation and Xray JSON generation
  app.go                 Process lifecycle, state, diagnostics
  protocol.go            4-byte little-endian native messaging framing
scripts/                 Build, release, install, uninstall, icon, and test scripts
  release.ps1            Builds the versioned release folder, ZIP, and Setup EXE
  install.cmd            One-click portable installer
  open-extension.ps1     Opens the browser extensions page and extension folder
installer/               Inno Setup script, branding assets, and install notes
.github/workflows/       Tag-driven GitHub release workflow
dist/                    Assembled distribution (generated)
release/                 Versioned release artifacts (generated)
```

Useful commands:

```powershell
cd extension
npm install
npm test                 # parser and native-client tests
npm run build            # popup + background service worker

cd ..\helper
go test ./...

cd ..
node .\scripts\test-helper.mjs   # native messaging + Xray + Job Object integration test
node .\scripts\test-e2e.mjs      # local VLESS server + HTTP/CONNECT data-path test

powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1
# Builds release\BrowserXray-<version>-win64.zip
# and release\BrowserXray-Setup-<version>-win64.exe
```

`scripts\test-helper.mjs` spawns the built helper, speaks the same framed protocol Chrome uses, connects a dummy REALITY profile, verifies the generated config and listening port, disconnects, then kills a second helper to prove the Job Object stops Xray.

`scripts\test-e2e.mjs` starts a local VLESS Xray server, a local HTTP origin, and a TCP echo server, points the helper at the local VLESS server, and sends real HTTP and CONNECT traffic through the helper's loopback proxy. It verifies the generated config, the proxy listener, HTTP forwarding, bidirectional TCP tunneling, disconnect cleanup, and that the helper stays responsive. It uses no external network and passes 19/19 checks.

The pinned tool versions and checksums are in `scripts\common.ps1`:

- Go 1.27.3 (downloaded only if a suitable local Go is not available)
- Xray-core 26.10.21, SHA-256 `fc58c39ee2f2717b4c54d28d374362389e5319b20ae44aea76ea45a5243ec827`

The extension key in `extension/public/manifest.json` pins the development ID `jmopdjjejcocokfkcjjpalhadkdmjklc`. Keep `.extension-key.pem` private and out of any release; it is in `.gitignore`. If you regenerate the key, update the manifest, rebuild, and re-run the installer so `allowed_origins` matches.

### Rebuilding after a real test

A normal cycle is:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
# then click Reload on the extension card
```

Disconnect before running the installer. It stops the installed helper and Xray processes so their binaries can be replaced; the extension will notice the closed native port and clear the browser proxy.

## Troubleshooting

**"The local helper is not installed"**
Run `scripts\install.ps1` from the build output and reload the extension. Check that the registry key exists:

```powershell
Get-ItemProperty "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.browserxray.helper"
```

The default value must point at `%LOCALAPPDATA%\BrowserXray\com.browserxray.helper.json`. If you loaded a different build with a different extension ID, `allowed_origins` will not match; rebuild and reinstall.

**"The native helper stopped unexpectedly"**
Make sure `xray.exe` exists next to `browser-xray-helper.exe` in `%LOCALAPPDATA%\BrowserXray\bin`. Read `%LOCALAPPDATA%\BrowserXray\logs\helper.log` and `xray.log`. Re-run the installer if files are missing.

**"Another extension is controlling this browser's proxy settings"**
Disable the other proxy/VPN extension. Chrome allows only one extension to control the proxy at a time. Browser policy-managed proxies also take precedence.

**Connected but sites fail**
Open Settings and copy diagnostics. Check the Xray log for configuration errors. Test another server. Verify the server allows your IP and that its UUID/password and transport options are correct. `api.ipify.org` may be blocked in some networks, so the exit-IP test can fail even when other sites work.

**No internet after a crash**
Open the extension popup once; recovery clears the stale proxy if it cannot reconnect. If the popup cannot load, disable the extension in `chrome://extensions` (Chrome clears extension proxy settings) and reconnect. The uninstaller also stops the helper and removes its registration.

**Port already in use**
The helper asks Windows for a free loopback port for every connection. A race is possible but unlikely. Disconnect and reconnect. Xray startup failures are reported with the tail of its log.

## Uninstall

If you used the Setup EXE, use **Uninstall Browser Xray** in the Start Menu or **Settings > Apps > Installed apps**. The Inno Setup uninstaller stops the helper and removes the native messaging registration.

For a source or portable install, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1
```

or use **Uninstall Browser Xray** in the Start Menu. This stops helper/Xray processes, removes the native messaging registry keys, shortcuts, and Apps & features entry, and deletes `%LOCALAPPDATA%\BrowserXray`.

Remove the extension from the browser separately (`chrome://extensions` or `edge://extensions`). Saved profiles are stored by the extension and are deleted when the extension is removed.

## License

The project code is MIT licensed. Xray-core is MPL-2.0; its license is bundled with the distribution. React and other MIT/BSD dependencies are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This project is not affiliated with Happ, XTLS, Google, or Microsoft. "Happ" is mentioned only as inspiration for the browser-only workflow.
