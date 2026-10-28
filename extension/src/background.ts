import { NativeClient } from "./lib/native";
import { applyProxy, clearProxy, describeProxy } from "./lib/proxy";
import { normalizeBypassList } from "./lib/bypass";
import {
  hasBrowserSessionMarker,
  loadBypassList,
  loadConnection,
  loadLastProxyError,
  loadProfiles,
  loadRestartNotice,
  loadSelectedProfileId,
  markBrowserSession,
  saveBypassList,
  saveConnection,
  saveLastProxyError,
  saveRestartNotice,
  saveSelectedProfileId
} from "./lib/storage";
import type {
  AppState,
  BackgroundRequest,
  BackgroundResponse,
  ConnectionState,
  HelperInfo,
  NativeResponse,
  Profile
} from "./types";

const native = new NativeClient((message) => {
  void handleUnexpectedDisconnect(message);
});

let helperInfo: HelperInfo = { available: false };
let helperCheckedAt = 0;
let keepNativeAlive = false;
let nativeUsers = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let proxyErrorTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryPromise: Promise<void> | null = null;
let initializationPromise: Promise<void> | null = null;
let sessionResetPromise: Promise<void> | null = null;
let browserStarted = false;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function friendlyHelperError(error: unknown): string {
  const message = errorMessage(error);
  if (/not found|not installed|host.*not.*found|cannot find/i.test(message)) {
    return "The local helper is not installed. Run scripts\\install.ps1 once, then reopen this popup.";
  }
  if (/forbidden/i.test(message)) {
    return "The helper rejected this extension. Re-run scripts\\install.ps1 to refresh the native messaging registration.";
  }
  return message;
}

function scheduleNativeClose(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (nativeUsers === 0 && !keepNativeAlive) {
      native.close();
    }
  }, 2500);
}

async function withNative<T>(operation: () => Promise<T>): Promise<T> {
  nativeUsers += 1;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  try {
    return await operation();
  } finally {
    nativeUsers -= 1;
    if (nativeUsers === 0 && !keepNativeAlive) {
      scheduleNativeClose();
    }
  }
}

async function queryHelper(force = false): Promise<HelperInfo> {
  if (!force && helperCheckedAt > 0 && Date.now() - helperCheckedAt < 2_000) {
    return helperInfo;
  }
  try {
    const response = await withNative(() => native.request({ cmd: "ping" }, 6_000));
    if (!response.ok) throw new Error(response.error || "The helper returned an error.");
    helperInfo = {
      available: true,
      version: response.helperVersion,
      xrayVersion: response.xrayVersion,
      dataDir: response.dataDir,
      helperPath: response.helperPath,
      xrayPath: response.xrayPath,
      platform: response.platform
    };
  } catch (error) {
    helperInfo = { available: false, error: friendlyHelperError(error) };
  }
  helperCheckedAt = Date.now();
  return helperInfo;
}

async function getState(): Promise<AppState> {
  const [
    connection,
    profiles,
    selectedProfileId,
    lastProxyError,
    helper,
    bypassList,
    restartNotice
  ] = await Promise.all([
    loadConnection(),
    loadProfiles(),
    loadSelectedProfileId(),
    loadLastProxyError(),
    queryHelper(),
    loadBypassList(),
    loadRestartNotice()
  ]);
  return {
    connection,
    profiles,
    selectedProfileId,
    helper,
    lastProxyError,
    bypassList,
    restartNotice
  };
}

async function broadcast(): Promise<void> {
  try {
    const [connection, profiles, selectedProfileId, lastProxyError, bypassList, restartNotice] =
      await Promise.all([
        loadConnection(),
        loadProfiles(),
        loadSelectedProfileId(),
        loadLastProxyError(),
        loadBypassList(),
        loadRestartNotice()
      ]);
    const state: AppState = {
      connection,
      profiles,
      selectedProfileId,
      helper: helperInfo,
      lastProxyError,
      bypassList,
      restartNotice
    };
    await chrome.runtime.sendMessage({ type: "stateChanged", state }).catch(() => undefined);
  } catch {
    // The popup is closed; nothing to notify.
  }
}

function profileFromConnect(response: NativeResponse): ConnectionState {
  return {
    phase: "connected",
    profileId: response.profileId,
    port: response.port,
    connectedAt: Date.now(),
    proxyApplied: true
  };
}

async function connect(profile: Profile): Promise<void> {
  await saveLastProxyError(undefined);
  await saveConnection({ phase: "connecting", profileId: profile.id });
  await broadcast();

  keepNativeAlive = true;
  try {
    const response = await withNative(() =>
      native.request({ cmd: "connect", profile }, 30_000)
    );
    if (!response.ok) throw new Error(response.error || "The helper could not start the tunnel.");
    if (!response.port) throw new Error("The helper did not return a local proxy port.");

    await applyProxy(response.port, await loadBypassList());
    await saveConnection(profileFromConnect(response));
    await saveSelectedProfileId(profile.id);
    await saveRestartNotice(false);
    helperInfo = { ...helperInfo, available: true };
    await broadcast();
  } catch (error) {
    keepNativeAlive = false;
    await clearProxy().catch(() => undefined);
    try {
      await withNative(() => native.request({ cmd: "disconnect" }, 5_000));
    } catch {
      // The helper may already be gone.
    }
    native.close();
    await saveConnection({
      phase: "error",
      profileId: profile.id,
      error: friendlyHelperError(error)
    });
    await broadcast();
    throw new Error(friendlyHelperError(error));
  }
}

async function disconnect(): Promise<void> {
  await clearProxy().catch(() => undefined);
  try {
    await withNative(() => native.request({ cmd: "disconnect" }, 6_000));
  } catch {
    // Clearing the browser proxy is the important part.
  }
  keepNativeAlive = false;
  native.close();
  await saveConnection({ phase: "disconnected" });
  await saveLastProxyError(undefined);
  await saveRestartNotice(false);
  await broadcast();
}

async function resetBrowserSession(): Promise<void> {
  if (sessionResetPromise) return sessionResetPromise;
  sessionResetPromise = (async () => {
    const connection = await loadConnection();
    const wasActive =
      connection.phase === "connected" ||
      connection.phase === "connecting" ||
      connection.proxyApplied === true;

    keepNativeAlive = false;
    await clearProxy().catch(() => undefined);
    if (wasActive) {
      try {
        await withNative(() => native.request({ cmd: "disconnect" }, 3_000));
      } catch {
        // The helper may not be running after a browser restart.
      }
      native.close();
    }
    await saveConnection({ phase: "disconnected" });
    await saveLastProxyError(undefined);
    if (wasActive || (await loadRestartNotice())) {
      await saveRestartNotice(true);
    }
    await broadcast();
  })().finally(() => {
    sessionResetPromise = null;
  });
  return sessionResetPromise;
}

async function recoverSession(): Promise<void> {
  const [connection, profiles, bypassList] = await Promise.all([
    loadConnection(),
    loadProfiles(),
    loadBypassList()
  ]);
  const needsRecovery = connection.phase === "connected" || connection.phase === "connecting";

  if (!needsRecovery) {
    if (connection.proxyApplied) {
      await clearProxy().catch(() => undefined);
      await saveConnection({ phase: "disconnected" });
    }
    return;
  }

  const profile = profiles.find((entry) => entry.id === connection.profileId);
  if (!profile) {
    await clearProxy().catch(() => undefined);
    await saveConnection({
      phase: "error",
      error: "The server used by the last session was removed. Select another server."
    });
    return;
  }

  keepNativeAlive = true;
  try {
    const response = await withNative(() => native.request({ cmd: "status" }, 6_000));
    if (response.ok && response.running && response.port && response.profileId === profile.id) {
      await applyProxy(response.port, bypassList);
      await saveConnection({
        phase: "connected",
        profileId: profile.id,
        port: response.port,
        connectedAt: connection.connectedAt ?? Date.now(),
        proxyApplied: true
      });
      return;
    }
  } catch {
    // Fall through to a fresh connection attempt.
  }

  await connect(profile).catch(async (error) => {
    await saveConnection({
      phase: "error",
      profileId: profile.id,
      error: friendlyHelperError(error)
    });
  });
}

function ensureRecovery(): Promise<void> {
  if (!recoveryPromise) {
    recoveryPromise = recoverSession().catch(() => undefined);
  }
  return recoveryPromise;
}

async function initializeSession(): Promise<void> {
  const activeSession = await hasBrowserSessionMarker();
  if (activeSession && !browserStarted) {
    // Recovery can take as long as a reconnect; do not block the popup on it.
    void ensureRecovery();
    return;
  }
  await resetBrowserSession();
  await markBrowserSession();
}

async function handleUnexpectedDisconnect(message: string): Promise<void> {
  if (!keepNativeAlive) return;
  keepNativeAlive = false;
  const connection = await loadConnection();
  await clearProxy().catch(() => undefined);
  await saveConnection({
    phase: "error",
    profileId: connection.profileId,
    error: friendlyHelperError(message)
  });
  helperInfo = { available: false, error: friendlyHelperError(message) };
  helperCheckedAt = Date.now();
  await broadcast();
}

async function testExit(): Promise<string> {
  const connection = await loadConnection();
  if (connection.phase !== "connected") {
    throw new Error("Connect to a server before testing the exit IP.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`The test request failed with HTTP ${response.status}.`);
    const body = (await response.json()) as { ip?: string };
    if (!body.ip) throw new Error("The exit IP test returned an unexpected response.");
    return body.ip;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The exit IP test timed out. The tunnel may not be working.");
    }
    throw new Error(
      `The exit IP test failed: ${errorMessage(error)}. The tunnel may not be working.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function diagnostics(): Promise<string> {
  const [connection, helper, proxy, bypassList] = await Promise.all([
    loadConnection(),
    queryHelper(true),
    describeProxy(),
    loadBypassList()
  ]);
  let helperDiagnostics = "";
  if (helper.available) {
    try {
      const response = await withNative(() => native.request({ cmd: "diagnostics" }, 6_000));
      helperDiagnostics = response.diagnostics || "";
    } catch (error) {
      helperDiagnostics = `Could not read helper diagnostics: ${errorMessage(error)}`;
    }
  }

  return [
    `Browser Xray extension ${chrome.runtime.getManifest().version}`,
    `Helper available: ${helper.available}`,
    `Helper version: ${helper.version ?? "unknown"}`,
    `Xray core: ${helper.xrayVersion ?? "unknown"}`,
    `Data directory: ${helper.dataDir ?? "unknown"}`,
    `Connection: ${JSON.stringify(connection)}`,
    `Bypass list: ${bypassList.length ? bypassList.join(", ") : "none"}`,
    "",
    "Browser proxy:",
    proxy,
    "",
    helperDiagnostics,
    helper.error ? `Helper error: ${helper.error}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
  await initializationPromise;
  switch (message.type) {
    case "getState":
      return { ok: true, state: await getState() };
    case "connect": {
      await ensureRecovery();
      const profiles = await loadProfiles();
      const profile = profiles.find((entry) => entry.id === message.profileId);
      if (!profile) return { ok: false, error: "That server no longer exists." };
      try {
        await connect(profile);
        return { ok: true, state: await getState() };
      } catch (error) {
        return { ok: false, error: friendlyHelperError(error) };
      }
    }
    case "disconnect":
      keepNativeAlive = false;
      await ensureRecovery();
      await disconnect();
      return { ok: true, state: await getState() };
    case "refreshHelper": {
      helperCheckedAt = 0;
      await queryHelper(true);
      return { ok: true, state: await getState() };
    }
    case "testExit":
      try {
        return { ok: true, exitIp: await testExit() };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    case "openDataDir": {
      try {
        const info = await queryHelper();
        if (!info.available) throw new Error(info.error || "The helper is not available.");
        const response = await withNative(() => native.request({ cmd: "openDataDir" }, 6_000));
        if (!response.ok) throw new Error(response.error || "Could not open the data folder.");
        return { ok: true };
      } catch (error) {
        return { ok: false, error: friendlyHelperError(error) };
      }
    }
    case "diagnostics":
      try {
        return { ok: true, diagnostics: await diagnostics() };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    case "setBypassList": {
      const bypassList = normalizeBypassList(message.bypassList);
      await saveBypassList(bypassList);
      const connection = await loadConnection();
      if (connection.phase === "connected" && connection.port) {
        try {
          await applyProxy(connection.port, bypassList);
        } catch (error) {
          await disconnect().catch(() => undefined);
          return { ok: false, error: friendlyHelperError(error) };
        }
      }
      await broadcast();
      return { ok: true, state: await getState() };
    }
    case "dismissRestartNotice":
      await saveRestartNotice(false);
      await broadcast();
      return { ok: true, state: await getState() };
    default:
      return { ok: false, error: "Unsupported action." };
  }
}

chrome.runtime.onMessage.addListener(
  (message: BackgroundRequest, _sender, sendResponse: (response: BackgroundResponse) => void) => {
    void handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }
);

chrome.runtime.onStartup.addListener(() => {
  browserStarted = true;
  recoveryPromise = null;
  initializationPromise = resetBrowserSession()
    .then(markBrowserSession)
    .catch(() => undefined);
});

chrome.proxy.onProxyError.addListener((details) => {
  if (proxyErrorTimer) clearTimeout(proxyErrorTimer);
  proxyErrorTimer = setTimeout(() => {
    const prefix = details.fatal ? "Proxy error" : "Proxy warning";
    void saveLastProxyError(`${prefix}: ${details.error}`).then(broadcast).catch(() => undefined);
  }, 500);
});

initializationPromise = initializeSession().catch(() => undefined);
