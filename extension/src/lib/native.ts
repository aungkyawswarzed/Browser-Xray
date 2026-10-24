import type { NativeResponse } from "../types";

export const NATIVE_HOST = "com.browserxray.helper";

interface Pending {
  resolve: (value: NativeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class HelperUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelperUnavailableError";
  }
}

export class NativeClient {
  private port: chrome.runtime.Port | null = null;
  private connecting: Promise<chrome.runtime.Port> | null = null;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private intentionallyClosed = false;

  constructor(private readonly onDisconnect: (message: string) => void) {}

  get connected(): boolean {
    return this.port !== null;
  }

  async ensureConnected(): Promise<chrome.runtime.Port> {
    if (this.port) return this.port;
    if (!this.connecting) {
      this.connecting = this.openPort().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async openPort(): Promise<chrome.runtime.Port> {
    this.intentionallyClosed = false;
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (error) {
      throw new HelperUnavailableError(
        error instanceof Error ? error.message : "The native helper is not available."
      );
    }

    this.port = port;
    port.onMessage.addListener((message: NativeResponse & { id?: number }) => {
      if (typeof message?.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    });

    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      const lastError = chrome.runtime.lastError?.message;
      const message =
        lastError ||
        "The native helper stopped unexpectedly. Install or repair the helper and try again.";
      this.port = null;
      this.rejectAll(new HelperUnavailableError(message));
      if (!this.intentionallyClosed) {
        this.onDisconnect(message);
      }
    });

    return port;
  }

  async request(command: Record<string, unknown>, timeoutMs = 15_000): Promise<NativeResponse> {
    const port = await this.ensureConnected();

    const id = ++this.sequence;
    return new Promise<NativeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("The native helper did not respond in time."));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      try {
        port.postMessage({ ...command, id });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          new HelperUnavailableError(
            error instanceof Error ? error.message : "Could not contact the native helper."
          )
        );
      }
    });
  }

  close(): void {
    this.intentionallyClosed = true;
    const port = this.port;
    this.port = null;
    this.rejectAll(new HelperUnavailableError("The native helper connection was closed."));
    try {
      port?.disconnect();
    } catch {
      // The port may already be gone.
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
