import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdates, isNewerVersion, parseStableRelease,
  UPDATE_CACHE_KEY, UPDATE_CACHE_MS, UPDATE_RETRY_MS
} from "./updates";

let storage: Record<string, unknown>;
const fetchMock = vi.fn();
const getMock = vi.fn();
const setMock = vi.fn();
const stable = (tag = "v1.0.2") => ({ tag_name: tag, draft: false, prerelease: false });
const reply = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
  storage = {};
  fetchMock.mockReset().mockResolvedValue(reply(stable()));
  getMock.mockReset().mockImplementation(async () => storage);
  setMock.mockReset().mockImplementation(async (value: Record<string, unknown>) => {
    Object.assign(storage, value);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", { storage: { local: { get: getMock, set: setMock } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("numeric release version comparison", () => {
  it.each([
    ["v1.0.1", "1.0.0", true],
    ["v1.10.0", "1.9.0", true],
    ["v2.0.0", "1.99.99", true],
    ["v1.0", "1.0.0", false],
    ["1.0.1.1", "1.0.1", true],
    ["v1.0.1", "1.0.1", false],
    ["v1.0.0", "1.0.1", false],
    ["v1.0.2-beta", "1.0.1", false],
    ["garbage", "1.0.1", false],
    ["v1.0.2", "invalid", false],
    ["v999999999.0", "1.0", false]
  ])("compares %s to %s", (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected);
  });
});

describe("stable GitHub release validation", () => {
  it("constructs a trusted repository link instead of using API html_url", () => {
    const release = parseStableRelease({ ...stable(), html_url: "https://malicious.invalid/" });
    expect(release).toEqual({
      tag: "v1.0.2", version: "1.0.2",
      url: "https://github.com/aungkyawswarzed/Browser-Xray/releases/tag/v1.0.2"
    });
  });
  it.each([null, {}, { ...stable(), draft: true }, { ...stable(), prerelease: true },
    stable("v1.0.2-rc.1"), stable("javascript:alert(1)"), stable("../../other")])(
    "rejects draft, prerelease, missing, or malformed metadata: %j", (data) => {
      expect(parseStableRelease(data)).toBeNull();
    }
  );
});

describe("update checks", () => {
  it("fetches the latest stable release without credentials or profile data", async () => {
    const result = await checkForUpdates();
    expect(result.failed).toBe(false);
    expect(result.release?.version).toBe("1.0.2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/aungkyawswarzed/Browser-Xray/releases/latest",
      expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" })
    );
    expect(setMock).toHaveBeenCalledOnce();
  });

  it("reuses the cached result for six hours", async () => {
    await checkForUpdates();
    vi.setSystemTime(Date.now() + UPDATE_CACHE_MS - 1);
    await checkForUpdates();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 1);
    await checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("manual checks bypass a fresh cache", async () => {
    await checkForUpdates();
    fetchMock.mockResolvedValue(reply(stable("v1.0.3")));
    expect((await checkForUpdates(true)).release?.version).toBe("1.0.3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent automatic/manual checks", async () => {
    const a = checkForUpdates();
    const b = checkForUpdates(true);
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([403, 404, 429, 500])("reports HTTP %s as an error, not up to date", async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    expect(await checkForUpdates()).toMatchObject({ failed: true, release: null });
  });

  it("preserves a known update offline and throttles automatic retries", async () => {
    await checkForUpdates();
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await checkForUpdates(true);
    expect(result.failed).toBe(true);
    expect(result.release?.version).toBe("1.0.2");
    await checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + UPDATE_RETRY_MS);
    await checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats malformed JSON and invalid release metadata as errors", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } });
    expect((await checkForUpdates()).failed).toBe(true);
    fetchMock.mockResolvedValue(reply(stable("v2.0.0-beta")));
    expect((await checkForUpdates(true)).failed).toBe(true);
  });

  it("ignores malformed/future cache data", async () => {
    storage[UPDATE_CACHE_KEY] = { release: { tag: "v999.0" }, checkedAt: Date.now() + 99999, failed: false };
    expect((await checkForUpdates()).release?.version).toBe("1.0.2");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rebuilds a trusted URL even for a cached release", async () => {
    storage[UPDATE_CACHE_KEY] = {
      release: { tag: "v1.0.2", url: "https://malicious.invalid/", version: "999.0" },
      checkedAt: Date.now(), failed: false
    };
    const result = await checkForUpdates();
    expect(result.release?.url).toBe("https://github.com/aungkyawswarzed/Browser-Xray/releases/tag/v1.0.2");
    expect(result.release?.version).toBe("1.0.2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("works even if reading/writing Chrome storage fails", async () => {
    getMock.mockRejectedValue(new Error("storage unavailable"));
    setMock.mockRejectedValue(new Error("storage unavailable"));
    expect((await checkForUpdates()).failed).toBe(false);
  });

  it("aborts a slow request after eight seconds", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const request = checkForUpdates();
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await request).failed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
