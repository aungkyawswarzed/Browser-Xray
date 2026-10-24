import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import type { AppState } from "../types";
import { sendBackground, subscribeToState } from "../lib/messages";

export function useAppState(): {
  state: AppState | null;
  refresh: () => Promise<void>;
  setState: Dispatch<SetStateAction<AppState | null>>;
} {
  const [state, setState] = useState<AppState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await sendBackground({ type: "getState" });
      if (response.ok && response.state) setState(response.state);
    } catch {
      // The service worker may still be starting.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToState((next) => setState(next));
    return unsubscribe;
  }, [refresh]);

  return { state, refresh, setState };
}
