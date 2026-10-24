import type { AppState, BackgroundRequest, BackgroundResponse } from "../types";

export function sendBackground(message: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>;
}

export type StateListener = (state: AppState) => void;

export function subscribeToState(listener: StateListener): () => void {
  const handler = (message: unknown): void => {
    const candidate = message as { type?: string; state?: AppState };
    if (candidate?.type === "stateChanged" && candidate.state) {
      listener(candidate.state);
    }
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

export function formatDuration(startedAt: number | undefined, now: number): string {
  if (!startedAt) return "0s";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
  return `${remaining}s`;
}

export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
