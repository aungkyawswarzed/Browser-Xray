import { useCallback, useEffect, useRef, useState } from "react";
import { checkForUpdates, isNewerVersion, type UpdateCheck } from "../lib/updates";

export function UpdateNotice() {
  const installed = chrome.runtime.getManifest().version;
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(true);
  const mounted = useRef(false);
  const check = useCallback(async (force: boolean) => {
    setChecking(true);
    try {
      const next = await checkForUpdates(force);
      if (mounted.current) setResult(next);
    } catch {
      if (mounted.current) setResult((previous) => ({
        release: previous?.release ?? null, checkedAt: Date.now(), failed: true
      }));
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void check(false);
    return () => { mounted.current = false; };
  }, [check]);

  return <UpdateNoticeContent installed={installed} result={result}
    checking={checking} onCheck={() => void check(true)} />;
}

export function UpdateNoticeContent({ installed, result, checking, onCheck }: {
  installed: string;
  result: UpdateCheck | null;
  checking: boolean;
  onCheck: () => void;
}) {
  const update = result?.release && isNewerVersion(result.release.version, installed)
    ? result.release : null;
  return (
    <section className={`update-notice${update ? " available" : ""}`} aria-label="Extension updates" aria-busy={checking}>
      {update && (
        <div className="update-banner">
          <div>
            <strong>Update available: v{update.version}</strong>
            <p>Install the new release, then reload the extension. Your servers stay saved.</p>
          </div>
          <a className="primary-button compact update-link" href={update.url}
            target="_blank" rel="noopener noreferrer" title="Open the GitHub release page">
            Update
          </a>
        </div>
      )}
      <div className="update-check-row">
        <span role="status">
          {checking ? "Checking GitHub…" : !result || result.failed
            ? "Couldn't check GitHub. Try again."
            : update ? "Download from GitHub Releases."
            : "You're up to date."}
        </span>
        <button className="ghost-button compact" disabled={checking}
          onClick={onCheck}>
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>
    </section>
  );
}
