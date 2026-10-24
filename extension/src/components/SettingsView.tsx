import { useState } from "react";
import type { AppState } from "../types";
import { sendBackground, truncateMiddle } from "../lib/messages";
import {
  ArrowLeftIcon,
  CopyIcon,
  FolderIcon,
  GlobeIcon,
  InfoIcon,
  RefreshIcon,
  TrashIcon
} from "./Icons";

interface SettingsViewProps {
  state: AppState;
  onBack: () => void;
  onOpenData: () => Promise<void>;
  onRefreshHelper: () => Promise<void>;
  onClearAll: () => void;
  onSetup: () => void;
  onToast: (kind: "success" | "error" | "info", message: string) => void;
}

export function SettingsView({
  state,
  onBack,
  onOpenData,
  onRefreshHelper,
  onClearAll,
  onSetup,
  onToast
}: SettingsViewProps) {
  const [busy, setBusy] = useState(false);

  const copyDiagnostics = async () => {
    setBusy(true);
    try {
      const response = await sendBackground({ type: "diagnostics" });
      if (!response.ok || !response.diagnostics) {
        throw new Error(response.ok ? "No diagnostics available." : response.error);
      }
      await navigator.clipboard.writeText(response.diagnostics);
      onToast("success", "Diagnostics copied. Secrets are not included.");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Could not collect diagnostics.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="subview">
      <div className="subview-header">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <h1>Settings</h1>
          <p>Helper, diagnostics and privacy</p>
        </div>
      </div>

      <div className="settings-body">
        <section className="settings-card">
          <div className="settings-card-head">
            <span className={`status-led ${state.helper.available ? "on" : "err"}`} />
            <h2>Local helper</h2>
            <span className={`mini-status ${state.helper.available ? "ok" : "bad"}`}>
              {state.helper.available ? "Ready" : "Not found"}
            </span>
          </div>

          {state.helper.available ? (
            <dl className="detail-list">
              <div>
                <dt>Helper</dt>
                <dd>v{state.helper.version ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Xray core</dt>
                <dd>{state.helper.xrayVersion ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{state.helper.platform ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Data folder</dt>
                <dd title={state.helper.dataDir}>{truncateMiddle(state.helper.dataDir ?? "", 40)}</dd>
              </div>
            </dl>
          ) : (
            <div className="notice error compact">
              <InfoIcon size={14} />
              <span>{state.helper.error || "Install the helper to connect."}</span>
            </div>
          )}

          <div className="settings-actions">
            <button className="secondary-button" onClick={() => void onRefreshHelper()}>
              <RefreshIcon size={15} />
              Refresh
            </button>
            <button
              className="secondary-button"
              onClick={() => void onOpenData()}
              disabled={!state.helper.available}
            >
              <FolderIcon size={15} />
              Open data folder
            </button>
            {!state.helper.available && (
              <button className="ghost-button" onClick={onSetup}>
                Setup guide
              </button>
            )}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <GlobeIcon size={16} />
            <h2>Routing</h2>
          </div>
          <ul className="fact-list">
            <li>
              <span className="fact-dot" />
              Only this browser profile uses the tunnel.
            </li>
            <li>
              <span className="fact-dot" />
              Other browsers, apps and Windows settings are untouched.
            </li>
            <li>
              <span className="fact-dot" />
              WebRTC can bypass proxies. Disable WebRTC for strict leak protection.
            </li>
            <li>
              <span className="fact-dot" />
              Browser proxy settings are browser-wide, not per tab.
            </li>
          </ul>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <CopyIcon size={16} />
            <h2>Diagnostics</h2>
          </div>
          <p className="settings-copy">
            Copies helper versions, connection state and recent Xray errors. Server passwords and
            UUIDs are not included.
          </p>
          <button className="secondary-button" onClick={() => void copyDiagnostics()} disabled={busy}>
            <CopyIcon size={15} />
            {busy ? "Collecting…" : "Copy diagnostics"}
          </button>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <InfoIcon size={16} />
            <h2>About</h2>
          </div>
          <p className="settings-copy">
            Browser Xray {chrome.runtime.getManifest().version}. Protocol engine: Xray-core
            (MPL-2.0). The helper runs locally and is required for Xray protocols.
          </p>
          <button className="ghost-button" onClick={onSetup}>
            View setup guide
          </button>
        </section>

        <section className="settings-card danger-zone">
          <div className="settings-card-head">
            <TrashIcon size={16} />
            <h2>Remove data</h2>
          </div>
          <p className="settings-copy">
            Deletes every saved server and disconnects. The helper stays installed.
          </p>
          <button className="danger-button" onClick={onClearAll} disabled={state.profiles.length === 0}>
            Clear all servers
          </button>
        </section>
      </div>
    </div>
  );
}
