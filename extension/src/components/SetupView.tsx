import { useState } from "react";
import { ArrowLeftIcon, CheckIcon, CopyIcon, FolderIcon, InfoIcon } from "./Icons";

interface SetupViewProps {
  onBack: () => void;
  onToast: (kind: "success" | "error" | "info", message: string) => void;
}

export function SetupView({ onBack, onToast }: SetupViewProps) {
  const [copied, setCopied] = useState(false);
  const extensionId = chrome.runtime.id;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(extensionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onToast("error", "Could not copy the extension ID.");
    }
  };

  return (
    <div className="subview">
      <div className="subview-header">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <h1>Set up the helper</h1>
          <p>One-time local installation</p>
        </div>
      </div>

      <div className="setup-body">
        <div className="notice info">
          <InfoIcon size={15} />
          <span>
            Chrome extensions cannot run Xray by themselves. The helper is a small local program
            that starts Xray and exposes a loopback-only proxy. Browsing still happens only through
            this extension.
          </span>
        </div>

        <ol className="setup-steps">
          <li>
            <span className="step-number">1</span>
            <div>
              <h3>Run the installer</h3>
              <p>From the project folder in PowerShell:</p>
              <code className="code-block">powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1</code>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div>
              <h3>Load the extension</h3>
              <p>
                Open <code>chrome://extensions</code>, enable Developer mode, choose{" "}
                <strong>Load unpacked</strong>, and select the installed extension folder:
              </p>
              <code className="code-block">%LOCALAPPDATA%\BrowserXray\extension</code>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div>
              <h3>Reload this popup</h3>
              <p>
                The helper status should turn green. Paste a share link and connect. If Chrome asks
                for the native host permission, accept it.
              </p>
            </div>
          </li>
        </ol>

        <section className="settings-card">
          <div className="settings-card-head">
            <FolderIcon size={16} />
            <h2>Extension ID</h2>
          </div>
          <p className="settings-copy">
            The installer registers this ID with the helper automatically. Keep them in sync if you
            rebuild the extension.
          </p>
          <div className="copy-row">
            <code>{extensionId}</code>
            <button className="mini-icon-button" onClick={() => void copyId()} aria-label="Copy ID">
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <InfoIcon size={16} />
            <h2>Troubleshooting</h2>
          </div>
          <ul className="fact-list">
            <li>
              <span className="fact-dot" />
              “Native host has exited” usually means xray.exe is missing. Re-run the installer.
            </li>
            <li>
              <span className="fact-dot" />
              If the popup says another extension controls the proxy, disable that extension.
            </li>
            <li>
              <span className="fact-dot" />
              Logs live in <code>%LOCALAPPDATA%\BrowserXray\logs</code>.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
