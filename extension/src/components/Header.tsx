import { LogoMark, SettingsIcon } from "./Icons";

interface HeaderProps {
  helperAvailable: boolean;
  helperChecked: boolean;
  onSettings: () => void;
}

export function Header({ helperAvailable, helperChecked, onSettings }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <LogoMark size={30} />
        <div className="brand-text">
          <span className="brand-name">Browser Xray</span>
          <span className="brand-sub">Browser-only tunnel</span>
        </div>
      </div>
      <div className="topbar-actions">
        <span
          className={`helper-pill ${helperChecked ? (helperAvailable ? "ok" : "bad") : "pending"}`}
          title={
            helperChecked
              ? helperAvailable
                ? "Local helper connected"
                : "Local helper not found"
              : "Checking local helper"
          }
        >
          <span className="helper-dot" />
          {helperChecked ? (helperAvailable ? "Helper ready" : "No helper") : "Checking"}
        </span>
        <button className="icon-button" onClick={onSettings} aria-label="Settings" title="Settings">
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}
