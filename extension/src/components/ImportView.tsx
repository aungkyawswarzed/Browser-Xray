import { useMemo, useState } from "react";
import type { Profile } from "../types";
import { parseLinks, profileKey, summarizeProfile } from "../parser";
import { AlertIcon, ArrowLeftIcon, CheckIcon, PlusIcon } from "./Icons";

interface ImportViewProps {
  existingProfiles: Profile[];
  onImport: (profiles: Profile[]) => void;
  onBack: () => void;
}

export function ImportView({ existingProfiles, onImport, onBack }: ImportViewProps) {
  const [text, setText] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const existingKeys = useMemo(
    () => new Set(existingProfiles.map((profile) => profileKey(profile))),
    [existingProfiles]
  );

  const parsed = useMemo(() => parseLinks(text), [text]);
  const fresh = useMemo(
    () => parsed.profiles.filter((profile) => !existingKeys.has(profileKey(profile))),
    [parsed.profiles, existingKeys]
  );
  const alreadySaved = parsed.profiles.length - fresh.length;
  const issueCount = parsed.errors.length;

  return (
    <div className="subview">
      <div className="subview-header">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <h1>Add servers</h1>
          <p>Paste one link per line</p>
        </div>
      </div>

      <div className="import-body">
        <div className="protocol-chips">
          <span className="chip vless">VLESS</span>
          <span className="chip vmess">VMess</span>
          <span className="chip trojan">Trojan</span>
          <span className="chip ss">Shadowsocks</span>
        </div>

        <label className="field-label" htmlFor="share-links">
          Share links
        </label>
        <textarea
          id="share-links"
          className="link-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            "vless://…\nss://…\n\nReality, TLS, WebSocket, gRPC, HTTPUpgrade and XHTTP transports are supported."
          }
          spellCheck={false}
          autoFocus
        />

        <div className="parse-summary">
          <div className="parse-stat">
            <span className={`parse-count ${fresh.length > 0 ? "good" : ""}`}>{fresh.length}</span>
            <span>ready to import</span>
          </div>
          {alreadySaved > 0 && (
            <div className="parse-note">
              <CheckIcon size={13} /> {alreadySaved} already saved
            </div>
          )}
          {parsed.duplicates > 0 && (
            <div className="parse-note">{parsed.duplicates} duplicate in input</div>
          )}
        </div>

        {fresh.length > 0 && (
          <ul className="import-preview">
            {fresh.slice(0, 4).map((profile) => (
              <li key={profile.id}>
                <span className={`protocol-badge ${profile.protocol}`}>
                  {profile.protocol === "ss" ? "SS" : profile.protocol.toUpperCase()}
                </span>
                <span className="import-preview-text">
                  <span>{profile.name}</span>
                  <small>
                    {summarizeProfile(profile)} · {profile.address}:{profile.port}
                  </small>
                </span>
              </li>
            ))}
            {fresh.length > 4 && (
              <li className="import-more">+{fresh.length - 4} more</li>
            )}
          </ul>
        )}

        {parsed.warnings.length > 0 && (
          <div className="notice warning">
            <AlertIcon size={14} />
            <div>
              {parsed.warnings.slice(0, 2).map((warning) => (
                <p key={`${warning.line}-${warning.message}`}>{warning.message}</p>
              ))}
            </div>
          </div>
        )}

        {issueCount > 0 && (
          <div className="notice error">
            <AlertIcon size={14} />
            <div>
              <button className="notice-toggle" onClick={() => setShowDetails((value) => !value)}>
                {issueCount} line{issueCount === 1 ? "" : "s"} could not be imported
                <span>{showDetails ? "Hide" : "Show"}</span>
              </button>
              {showDetails && (
                <ul className="issue-list">
                  {parsed.errors.slice(0, 8).map((error, index) => (
                    <li key={`${error.line}-${index}`}>
                      <strong>Line {error.line}</strong>
                      {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="privacy-note">
          Links are stored only in this browser profile. They are never sent anywhere except to the
          proxy server you configure.
        </div>
      </div>

      <div className="subview-footer">
        <button className="ghost-button" onClick={onBack}>
          Cancel
        </button>
        <button
          className="primary-button"
          onClick={() => onImport(fresh)}
          disabled={fresh.length === 0}
        >
          <PlusIcon size={16} />
          Import {fresh.length > 0 ? fresh.length : ""}
        </button>
      </div>
    </div>
  );
}
