import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyProxy } from "./proxy";

let value: chrome.proxy.ProxyConfig;
const setMock = vi.fn();

beforeEach(() => {
  value = { mode: "system" };
  setMock
    .mockReset()
    .mockImplementation(
      (details: { value: chrome.proxy.ProxyConfig }, callback: () => void) => {
        value = details.value;
        callback();
      }
    );
  vi.stubGlobal("chrome", {
    runtime: {},
    proxy: {
      settings: {
        set: setMock,
        clear: vi.fn((_details: unknown, callback: () => void) => callback()),
        get: vi.fn((_details: unknown, callback: (details: unknown) => void) => {
          callback({ value, levelOfControl: "controlled_by_this_extension" });
        })
      }
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxy settings", () => {
  it("applies the local proxy with whitelisted domains and subdomains", async () => {
    await applyProxy(23456, ["example.com", "192.168.1.10"]);
    expect(setMock).toHaveBeenCalledOnce();
    expect(value).toEqual({
      mode: "fixed_servers",
      rules: {
        singleProxy: { scheme: "http", host: "127.0.0.1", port: 23456 },
        bypassList: [
          "<local>",
          "localhost",
          "127.0.0.1",
          "[::1]",
          "example.com",
          "*.example.com",
          "192.168.1.10"
        ]
      }
    });
  });
});
