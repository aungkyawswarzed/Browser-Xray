import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ request: vi.fn(), close: vi.fn() }));

vi.mock("./lib/native", () => ({
  NativeClient: class {
    request = native.request;
    close = native.close;
  }
}));

type Storage = Record<string, unknown>;

function readKeys(source: Storage, keys: string | string[]): Storage {
  const list = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(list.filter((key) => key in source).map((key) => [key, source[key]]));
}

function createChrome(local: Storage, session: Storage) {
  let proxyValue: chrome.proxy.ProxyConfig = { mode: "system" };
  const setProxy = vi.fn(
    (details: { value: chrome.proxy.ProxyConfig }, callback: () => void) => {
      proxyValue = details.value;
      callback();
    }
  );
  const clearProxy = vi.fn((_details: unknown, callback: () => void) => {
    proxyValue = { mode: "system" };
    callback();
  });

  const storage = (target: Storage) => ({
    get: vi.fn(async (keys: string | string[]) => readKeys(target, keys)),
    set: vi.fn(async (values: Storage) => {
      Object.assign(target, values);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete target[key];
    })
  });

  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => undefined),
      getManifest: vi.fn(() => ({ version: "1.2.0" }))
    },
    storage: { local: storage(local), session: storage(session) },
    proxy: {
      settings: {
        get: vi.fn((_details: unknown, callback: (details: unknown) => void) => {
          callback({ value: proxyValue, levelOfControl: "controlled_by_this_extension" });
        }),
        set: setProxy,
        clear: clearProxy
      },
      onProxyError: { addListener: vi.fn() }
    }
  };

  return { chrome, setProxy, clearProxy, proxyValue: () => proxyValue };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  native.request.mockReset().mockResolvedValue({ ok: true });
  native.close.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser session initialization", () => {
  it("resets an active tunnel on browser startup and asks the user to reconnect", async () => {
    const local: Storage = {
      connection: { phase: "connected", profileId: "p1", port: 23456, proxyApplied: true },
      profiles: [{ id: "p1" }],
      selectedProfileId: "p1"
    };
    const session: Storage = {};
    const fake = createChrome(local, session);
    vi.stubGlobal("chrome", fake.chrome);

    await import("./background");
    await settle();

    expect(local.connection).toEqual({ phase: "disconnected" });
    expect(local.restartNotice).toBe(true);
    expect(session.browserSessionActive).toBe(true);
    expect(fake.clearProxy).toHaveBeenCalledOnce();
    expect(fake.setProxy).not.toHaveBeenCalled();
    expect(native.request).toHaveBeenCalledWith({ cmd: "disconnect" }, 3_000);
    expect(native.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "connect" }),
      expect.anything()
    );
  });

  it("does not spawn the helper or show a notice when startup was already disconnected", async () => {
    const local: Storage = { connection: { phase: "disconnected" } };
    const fake = createChrome(local, {});
    vi.stubGlobal("chrome", fake.chrome);

    await import("./background");
    await settle();

    expect(local.connection).toEqual({ phase: "disconnected" });
    expect(local.restartNotice).toBeUndefined();
    expect(fake.clearProxy).toHaveBeenCalledOnce();
    expect(native.request).not.toHaveBeenCalled();
  });

  it("recovers an active tunnel after a service-worker restart in the same browser session", async () => {
    native.request.mockResolvedValue({ ok: true, running: true, port: 23456, profileId: "p1" });
    const local: Storage = {
      connection: { phase: "connected", profileId: "p1", port: 23456, proxyApplied: true },
      profiles: [{ id: "p1" }],
      selectedProfileId: "p1",
      bypassList: ["example.com"]
    };
    const fake = createChrome(local, { browserSessionActive: true });
    vi.stubGlobal("chrome", fake.chrome);

    await import("./background");
    await settle();

    expect(local.connection).toMatchObject({ phase: "connected", profileId: "p1", port: 23456 });
    expect(local.restartNotice).toBeUndefined();
    expect(fake.setProxy).toHaveBeenCalledOnce();
    expect(fake.proxyValue().rules?.bypassList).toContain("*.example.com");
    expect(native.request).toHaveBeenCalledWith({ cmd: "status" }, 6_000);
  });
});
