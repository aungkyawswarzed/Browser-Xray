import { buildBypassPatterns } from "./bypass";

interface ProxySettingResult {
  value: chrome.proxy.ProxyConfig;
  levelOfControl:
    | "not_controllable"
    | "controlled_by_other_extensions"
    | "controllable_by_this_extension"
    | "controlled_by_this_extension";
}

function getProxySettings(): Promise<ProxySettingResult> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, (details) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(details as unknown as ProxySettingResult);
    });
  });
}

export async function applyProxy(port: number, bypassList: string[]): Promise<void> {
  const value: chrome.proxy.ProxyConfig = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "http",
        host: "127.0.0.1",
        port
      },
      bypassList: buildBypassPatterns(bypassList)
    }
  };

  await new Promise<void>((resolve, reject) => {
    chrome.proxy.settings.set({ value, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

  const current = await getProxySettings();
  if (current.levelOfControl === "controlled_by_other_extensions") {
    await clearProxy().catch(() => undefined);
    throw new Error(
      "Another extension is controlling this browser's proxy settings. Disable it, then try again."
    );
  }
  if (current.levelOfControl === "not_controllable") {
    await clearProxy().catch(() => undefined);
    throw new Error("This browser's proxy settings are managed by policy and cannot be changed.");
  }
  if (current.levelOfControl !== "controlled_by_this_extension") {
    throw new Error("The browser did not accept the proxy setting.");
  }

  const applied = current.value?.rules?.singleProxy;
  if (current.value?.mode !== "fixed_servers" || applied?.port !== port) {
    await clearProxy().catch(() => undefined);
    throw new Error("The browser did not apply the local proxy setting.");
  }
}

export async function clearProxy(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function describeProxy(): Promise<string> {
  try {
    const current = await getProxySettings();
    return JSON.stringify(
      { levelOfControl: current.levelOfControl, value: current.value },
      null,
      2
    );
  } catch (error) {
    return `Unable to read proxy settings: ${error instanceof Error ? error.message : String(error)}`;
  }
}
