import type { ConnectionState, Profile } from "../types";
import { normalizeBypassList } from "./bypass";

const PROFILES_KEY = "profiles";
const SELECTED_KEY = "selectedProfileId";
const CONNECTION_KEY = "connection";
const PROXY_ERROR_KEY = "lastProxyError";
const BYPASS_KEY = "bypassList";
const RESTART_KEY = "restartNotice";
const SESSION_KEY = "browserSessionActive";

const DEFAULT_CONNECTION: ConnectionState = { phase: "disconnected" };

export async function loadProfiles(): Promise<Profile[]> {
  const result = await chrome.storage.local.get(PROFILES_KEY);
  const profiles = result[PROFILES_KEY];
  return Array.isArray(profiles) ? (profiles as Profile[]) : [];
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
}

export async function loadSelectedProfileId(): Promise<string | null> {
  const result = await chrome.storage.local.get(SELECTED_KEY);
  return typeof result[SELECTED_KEY] === "string" ? (result[SELECTED_KEY] as string) : null;
}

export async function saveSelectedProfileId(profileId: string | null): Promise<void> {
  if (profileId) {
    await chrome.storage.local.set({ [SELECTED_KEY]: profileId });
  } else {
    await chrome.storage.local.remove(SELECTED_KEY);
  }
}

export async function loadConnection(): Promise<ConnectionState> {
  const result = await chrome.storage.local.get(CONNECTION_KEY);
  const connection = result[CONNECTION_KEY] as ConnectionState | undefined;
  return connection && typeof connection === "object"
    ? { ...DEFAULT_CONNECTION, ...connection }
    : DEFAULT_CONNECTION;
}

export async function saveConnection(connection: ConnectionState): Promise<void> {
  await chrome.storage.local.set({ [CONNECTION_KEY]: connection });
}

export async function loadLastProxyError(): Promise<string | undefined> {
  const result = await chrome.storage.local.get(PROXY_ERROR_KEY);
  return typeof result[PROXY_ERROR_KEY] === "string" ? (result[PROXY_ERROR_KEY] as string) : undefined;
}

export async function saveLastProxyError(error: string | undefined): Promise<void> {
  if (error) {
    await chrome.storage.local.set({ [PROXY_ERROR_KEY]: error });
  } else {
    await chrome.storage.local.remove(PROXY_ERROR_KEY);
  }
}

export async function loadBypassList(): Promise<string[]> {
  const result = await chrome.storage.local.get(BYPASS_KEY);
  return normalizeBypassList(result[BYPASS_KEY]);
}

export async function saveBypassList(bypassList: string[]): Promise<void> {
  await chrome.storage.local.set({ [BYPASS_KEY]: normalizeBypassList(bypassList) });
}

export async function loadRestartNotice(): Promise<boolean> {
  const result = await chrome.storage.local.get(RESTART_KEY);
  return result[RESTART_KEY] === true;
}

export async function saveRestartNotice(value: boolean): Promise<void> {
  if (value) {
    await chrome.storage.local.set({ [RESTART_KEY]: true });
  } else {
    await chrome.storage.local.remove(RESTART_KEY);
  }
}

/** storage.session survives service-worker restarts but not a browser restart. */
export async function hasBrowserSessionMarker(): Promise<boolean> {
  try {
    const result = await chrome.storage.session.get(SESSION_KEY);
    return result[SESSION_KEY] === true;
  } catch {
    return false;
  }
}

export async function markBrowserSession(): Promise<void> {
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: true });
  } catch {
    // A missing marker only causes a safe reset, not a broken session.
  }
}

export async function clearAllStoredData(): Promise<void> {
  await chrome.storage.local.remove([
    PROFILES_KEY,
    SELECTED_KEY,
    CONNECTION_KEY,
    PROXY_ERROR_KEY,
    RESTART_KEY
  ]);
}
