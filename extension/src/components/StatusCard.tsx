import type { ConnectionState, HelperInfo, Profile } from "../types";
import { summarizeProfile } from "../parser";
import { formatDuration } from "../lib/messages";
import { AlertIcon, GlobeIcon, PowerIcon } from "./Icons";

interface StatusCardProps {
  connection: ConnectionState;
  profile: Profile | undefined;
  helper: HelperInfo;
  now: number;
  busy: boolean;
  disabled: boolean;
  testing: boolean;
  exitIp: string | null;
  onToggle: () => void;
  onAddServer: () => void;
  onTestExit: () => void;
  onSetup: () => void;
}

export function StatusCard({
  connection,
  profile,
  helper,
  now,
  busy,
  disabled,
  testing,
  exitIp,
  onToggle,
  onAddServer,
  onTestExit,
  onSetup
}: StatusCardProps) {
  const connected = connection.phase === "connected";
  const connecting = connection.phase === "connecting" || busy;
  const failed = connection.phase === "error";
  const helperMissing = !helper.available;

  const title = connected
    ? "Connected"
    : connecting
      ? "Connecting…"
      : failed
        ? "Connection failed"
        : "Not connected";

  const subtitle = connected
    ? "This browser is routed through your proxy"
    : connecting
      ? "Starting Xray and applying the browser proxy"
      : failed
        ? connection.error || "The tunnel could not be started."
        : "Your other apps keep their normal connection";

  return (
    <section className={`status-card ${connected ? "is-connected" : connecting ? "is-connecting" : failed ? "is-error" : ""}`}>
      <div className="status-top">
        <div className="status-copy">
          <span className="eyebrow">
            <span className={`status-led ${connected ? "on" : connecting ? "pulse" : failed ? "err" : ""}`} />
            {title}
          </span>
          <p className="status-sub">{subtitle}</p>
        </div>
        <button
          className={`power-button ${connected ? "on" : ""} ${connecting ? "busy" : ""}`}
          onClick={helperMissing ? onSetup : profile ? onToggle : onAddServer}
          disabled={disabled || connecting}
          aria-label={connected ? "Disconnect" : "Connect"}
          title={
            helperMissing
              ? "Install the local helper"
              : connected
                ? "Disconnect"
                : profile
                  ? "Connect"
                  : "Add a server"
          }
        >
          {connecting ? <span className="spinner" /> : <PowerIcon size={25} />}
        </button>
      </div>

      {profile ? (
        <div className="selected-server">
          <div className="server-avatar">{profile.protocol.toUpperCase().slice(0, 2)}</div>
          <div className="server-text">
            <span className="server-name" title={profile.name}>
              {profile.name}
            </span>
            <span className="server-line">
              {summarizeProfile(profile)} · {profile.address}:{profile.port}
            </span>
          </div>
          {connected && <span className="connected-tag">LIVE</span>}
        </div>
      ) : (
        <button className="empty-connect" onClick={onAddServer}>
          <span>No servers yet</span>
          <span className="link-text">Paste a share link to begin</span>
        </button>
      )}

      {connected && (
        <div className="status-meta">
          <span>
            <span className="meta-label">Uptime</span> {formatDuration(connection.connectedAt, now)}
          </span>
          <span>
            <span className="meta-label">Local proxy</span> 127.0.0.1:{connection.port}
          </span>
        </div>
      )}

      {failed && connection.error && !helperMissing && (
        <div className="inline-error">
          <AlertIcon size={15} />
          <span>{connection.error}</span>
        </div>
      )}

      {helperMissing && (
        <button className="helper-banner" onClick={onSetup}>
          <AlertIcon size={15} />
          <span>{helper.error || "The local helper is not installed."}</span>
          <span className="helper-banner-action">Set up</span>
        </button>
      )}

      <div className="status-actions">
        {connected ? (
          <>
            <button className="secondary-button" onClick={onTestExit} disabled={testing || disabled}>
              <GlobeIcon size={15} />
              {testing ? "Testing…" : "Check exit IP"}
            </button>
            <button className="ghost-button" onClick={onToggle} disabled={disabled}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            onClick={profile ? onToggle : onAddServer}
            disabled={connecting || helperMissing || disabled}
          >
            {profile ? (connecting ? "Connecting…" : "Connect") : "Add a server"}
          </button>
        )}
        {exitIp && <span className="exit-ip">Exit IP {exitIp}</span>}
      </div>
    </section>
  );
}
