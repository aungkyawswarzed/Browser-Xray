import type { Profile } from "../types";
import { summarizeProfile } from "../parser";
import { PencilIcon, PlusIcon, TrashIcon } from "./Icons";

interface ServerListProps {
  profiles: Profile[];
  selectedId: string | null;
  connectedProfileId: string | undefined;
  onSelect: (profile: Profile) => void;
  onAdd: () => void;
  onRename: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}

export function ServerList({
  profiles,
  selectedId,
  connectedProfileId,
  onSelect,
  onAdd,
  onRename,
  onDelete
}: ServerListProps) {
  return (
    <section className="servers-section">
      <div className="section-heading">
        <h2>
          Servers <span className="count-badge">{profiles.length}</span>
        </h2>
        <button className="add-button" onClick={onAdd}>
          <PlusIcon size={15} />
          Add
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="empty-servers">
          <div className="empty-orbit">
            <span />
          </div>
          <p>No saved servers</p>
          <span>Paste a VLESS, VMess, Trojan, or Shadowsocks link.</span>
          <button className="secondary-button" onClick={onAdd}>
            <PlusIcon size={15} />
            Add share link
          </button>
        </div>
      ) : (
        <ul className="server-list">
          {profiles.map((profile) => {
            const selected = profile.id === selectedId;
            const connected = profile.id === connectedProfileId;
            return (
              <li key={profile.id}>
                <div
                  className={`server-row ${selected ? "selected" : ""} ${connected ? "connected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(profile)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(profile);
                    }
                  }}
                >
                  <span className={`protocol-badge ${profile.protocol}`}>
                    {profile.protocol === "ss" ? "SS" : profile.protocol.toUpperCase()}
                  </span>
                  <span className="server-row-text">
                    <span className="server-row-name">
                      {profile.name}
                      {connected && <span className="live-dot" title="Connected" />}
                    </span>
                    <span className="server-row-meta">
                      {summarizeProfile(profile)} · {profile.address}:{profile.port}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button
                      className="mini-icon-button"
                      title="Rename"
                      aria-label={`Rename ${profile.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRename(profile);
                      }}
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      className="mini-icon-button danger"
                      title="Delete"
                      aria-label={`Delete ${profile.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(profile);
                      }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </span>
                  <span className={`radio ${selected ? "checked" : ""}`} aria-hidden="true">
                    {selected && <span />}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
