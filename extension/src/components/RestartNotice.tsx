import { useState } from "react";
import { AlertIcon } from "./Icons";

export function RestartNotice({ onDismiss }: { onDismiss: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="restart-notice">
      <div className="notice info" role="status">
        <AlertIcon size={15} />
        <span>
          <strong>Connection reset.</strong> The browser or extension restarted. Connect again when
          you're ready.
        </span>
        <button
          className="ghost-button compact"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onDismiss().finally(() => setBusy(false));
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
