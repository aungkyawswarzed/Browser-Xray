import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeResponse } from "../types";
import { HelperUnavailableError, NativeClient } from "./native";

type WireMessage = Record<string, unknown> & { id?: number; cmd?: string };
type MessageListener = (message: NativeResponse & { id?: number }) => void;

function createFakePort() {
  const messageListeners: MessageListener[] = [];
  const disconnectListeners: Array<() => void> = [];
  const sent: WireMessage[] = [];

  return {
    onMessage: {
      addListener: (listener: MessageListener) => {
        messageListeners.push(listener);
      }
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        disconnectListeners.push(listener);
      }
    },
    postMessage: vi.fn((message: WireMessage) => {
      sent.push(message);
    }),
    disconnect: vi.fn(),
    sent,
    emitMessage: (message: NativeResponse & { id?: number }) => {
      for (const listener of messageListeners) listener(message);
    },
    emitDisconnect: () => {
      for (const listener of disconnectListeners) listener();
    }
  };
}

const connectNative = vi.fn();

beforeEach(() => {
  connectNative.mockReset();
  vi.stubGlobal("chrome", {
    runtime: {
      connectNative,
      lastError: undefined
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NativeClient", () => {
  it("shares one native port between concurrent requests", async () => {
    const port = createFakePort();
    connectNative.mockReturnValue(port as unknown as chrome.runtime.Port);
    const client = new NativeClient(() => undefined);

    const first = client.request({ cmd: "ping" });
    const second = client.request({ cmd: "status" });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledTimes(2);
    });
    expect(connectNative).toHaveBeenCalledTimes(1);

    const [firstMessage, secondMessage] = port.sent;
    port.emitMessage({ id: firstMessage.id, ok: true, helperVersion: "1.0.0" });
    port.emitMessage({ id: secondMessage.id, ok: true, running: false });

    const responses = await Promise.all([first, second]);
    expect(responses).toHaveLength(2);
    expect(responses.find((response) => response.helperVersion === "1.0.0")).toBeDefined();
    expect(responses.find((response) => response.running === false)).toBeDefined();
    client.close();
  });

  it("rejects pending work and notifies when the helper disconnects", async () => {
    const port = createFakePort();
    connectNative.mockReturnValue(port as unknown as chrome.runtime.Port);
    const onDisconnect = vi.fn();
    const client = new NativeClient(onDisconnect);

    const pending = client.request({ cmd: "ping" });
    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledTimes(1);
    });

    (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = {
      message: "Native host has exited."
    };
    port.emitDisconnect();

    await expect(pending).rejects.toBeInstanceOf(HelperUnavailableError);
    await expect(pending).rejects.toThrow("Native host has exited.");
    expect(onDisconnect).toHaveBeenCalledWith("Native host has exited.");
    expect(client.connected).toBe(false);

    const nextPort = createFakePort();
    connectNative.mockReturnValue(nextPort as unknown as chrome.runtime.Port);
    const next = client.request({ cmd: "ping" });
    await vi.waitFor(() => {
      expect(nextPort.postMessage).toHaveBeenCalledTimes(1);
    });
    expect(connectNative).toHaveBeenCalledTimes(2);
    nextPort.emitMessage({ id: nextPort.sent[0].id, ok: true });
    await expect(next).resolves.toMatchObject({ ok: true });
    client.close();
  });

  it("rejects pending work when closed intentionally", async () => {
    const port = createFakePort();
    connectNative.mockReturnValue(port as unknown as chrome.runtime.Port);
    const onDisconnect = vi.fn();
    const client = new NativeClient(onDisconnect);

    const pending = client.request({ cmd: "ping" });
    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledTimes(1);
    });
    client.close();

    await expect(pending).rejects.toThrow("connection was closed");
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("reports a postMessage failure without leaking a pending request", async () => {
    const port = createFakePort();
    port.postMessage.mockImplementation(() => {
      throw new Error("The message port is closed.");
    });
    connectNative.mockReturnValue(port as unknown as chrome.runtime.Port);
    const client = new NativeClient(() => undefined);

    await expect(client.request({ cmd: "ping" })).rejects.toThrow("The message port is closed.");
    client.close();
  });
});
