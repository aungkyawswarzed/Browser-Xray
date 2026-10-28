import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "./types";
import { useAppState } from "./hooks/useAppState";
import { useNow } from "./hooks/useNow";
import { sendBackground } from "./lib/messages";
import {
  clearAllStoredData,
  saveProfiles,
  saveSelectedProfileId
} from "./lib/storage";
import { Header } from "./components/Header";
import { StatusCard } from "./components/StatusCard";
import { ServerList } from "./components/ServerList";
import { ImportView } from "./components/ImportView";
import { SettingsView } from "./components/SettingsView";
import { SetupView } from "./components/SetupView";
import { Modal } from "./components/Modal";
import { Toast } from "./components/Toast";
import { LogoMark } from "./components/Icons";
import { RestartNotice } from "./components/RestartNotice";
import { UpdateNotice } from "./components/UpdateNotice";

type View = "home" | "import" | "settings" | "setup";
type Action = "connect" | "disconnect" | null;
type ToastState = { kind: "success" | "error" | "info"; message: string };

export default function App() {
  const { state, refresh, setState } = useAppState();
  const now = useNow(1000);
  const [view, setView] = useState<View>("home");
  const [setupReturn, setSetupReturn] = useState<View>("home");
  const [action, setAction] = useState<Action>(null);
  const [testing, setTesting] = useState(false);
  const [exitIp, setExitIp] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((kind: ToastState["kind"], message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, message });
    toastTimer.current = setTimeout(() => setToast(null), 5_000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const profiles = state?.profiles ?? [];
  const selectedId = state?.selectedProfileId ?? null;
  const connection = state?.connection ?? { phase: "disconnected" as const };
  const connectedProfile = useMemo(
    () =>
      connection.phase === "connected"
        ? profiles.find((profile) => profile.id === connection.profileId)
        : undefined,
    [connection.phase, connection.profileId, profiles]
  );
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? connectedProfile ?? profiles[0];
  const displayProfile = connectedProfile ?? selectedProfile;

  const connect = useCallback(
    async (profileId: string) => {
      setAction("connect");
      setExitIp(null);
      try {
        const response = await sendBackground({ type: "connect", profileId });
        if (!response.ok) {
          showToast("error", response.error);
        } else {
          showToast("success", "Connected. Only this browser is using the tunnel.");
        }
      } catch (error) {
        showToast("error", error instanceof Error ? error.message : "Could not connect.");
      } finally {
        setAction(null);
        await refresh();
      }
    },
    [refresh, showToast]
  );

  const disconnect = useCallback(async () => {
    setAction("disconnect");
    try {
      const response = await sendBackground({ type: "disconnect" });
      if (!response.ok) {
        showToast("error", response.error);
      } else {
        showToast("info", "Disconnected. This browser is back on its normal connection.");
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not disconnect.");
    } finally {
      setAction(null);
      setExitIp(null);
      await refresh();
    }
  }, [refresh, showToast]);

  const onToggle = useCallback(() => {
    if (!state || action) return;
    if (connection.phase === "connected" || connection.phase === "connecting") {
      void disconnect();
      return;
    }
    if (selectedProfile) {
      void connect(selectedProfile.id);
    } else {
      setView("import");
    }
  }, [action, connect, connection.phase, disconnect, selectedProfile, state]);

  const handleSelect = useCallback(
    async (profile: Profile) => {
      if (!state) return;
      if (connection.phase === "connecting") {
        showToast("info", "Wait for the current connection attempt to finish.");
        return;
      }
      await saveSelectedProfileId(profile.id);
      setState((current) =>
        current ? { ...current, selectedProfileId: profile.id } : current
      );
      if (connection.phase === "connected" && connection.profileId !== profile.id) {
        showToast("info", `Switching to ${profile.name}…`);
        await connect(profile.id);
      }
    },
    [connect, connection.phase, connection.profileId, setState, showToast, state]
  );

  const handleImport = useCallback(
    async (incoming: Profile[]) => {
      if (!state) return;
      const names = new Set(state.profiles.map((profile) => profile.name));
      const renamed = incoming.map((profile) => {
        let name = profile.name;
        let counter = 2;
        while (names.has(name)) {
          name = `${profile.name} (${counter})`;
          counter += 1;
        }
        names.add(name);
        return { ...profile, name };
      });
      const next = [...state.profiles, ...renamed];
      await saveProfiles(next);
      let nextSelected = state.selectedProfileId;
      if (!nextSelected && renamed[0]) {
        nextSelected = renamed[0].id;
        await saveSelectedProfileId(nextSelected);
      }
      setState({ ...state, profiles: next, selectedProfileId: nextSelected });
      setView("home");
      showToast(
        "success",
        `Imported ${renamed.length} server${renamed.length === 1 ? "" : "s"}.`
      );
    },
    [setState, showToast, state]
  );

  const confirmRename = useCallback(async () => {
    if (!renameTarget || !state) return;
    const name = renameValue.trim();
    if (!name) return;
    const next = state.profiles.map((profile) =>
      profile.id === renameTarget.id ? { ...profile, name } : profile
    );
    await saveProfiles(next);
    setState({ ...state, profiles: next });
    setRenameTarget(null);
    showToast("success", "Server renamed.");
  }, [renameTarget, renameValue, setState, showToast, state]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !state) return;
    if (
      connection.profileId === deleteTarget.id &&
      (connection.phase === "connected" || connection.phase === "connecting")
    ) {
      await sendBackground({ type: "disconnect" }).catch(() => undefined);
    }
    const next = state.profiles.filter((profile) => profile.id !== deleteTarget.id);
    const nextSelected =
      state.selectedProfileId === deleteTarget.id
        ? next[0]?.id ?? null
        : state.selectedProfileId;
    await saveProfiles(next);
    await saveSelectedProfileId(nextSelected);
    setState({ ...state, profiles: next, selectedProfileId: nextSelected });
    setDeleteTarget(null);
    setExitIp(null);
    await refresh();
    showToast("info", "Server removed.");
  }, [connection.phase, connection.profileId, deleteTarget, refresh, setState, showToast, state]);

  const confirmClearAll = useCallback(async () => {
    await sendBackground({ type: "disconnect" }).catch(() => undefined);
    await clearAllStoredData();
    const helper = state?.helper ?? { available: false };
    setState({
      connection: { phase: "disconnected" },
      profiles: [],
      selectedProfileId: null,
      helper,
      bypassList: state?.bypassList ?? [],
      restartNotice: false
    });
    setExitIp(null);
    setClearConfirm(false);
    setView("home");
    showToast("info", "All saved servers were removed.");
  }, [setState, showToast, state?.bypassList, state?.helper]);

  const dismissRestartNotice = useCallback(async () => {
    try {
      const response = await sendBackground({ type: "dismissRestartNotice" });
      if (!response.ok) {
        showToast("error", response.error);
      } else if (response.state) {
        setState(response.state);
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not dismiss the notice.");
    }
  }, [setState, showToast]);

  const openData = useCallback(async () => {
    try {
      const response = await sendBackground({ type: "openDataDir" });
      if (!response.ok) showToast("error", response.error);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not open the folder.");
    }
  }, [showToast]);

  const refreshHelper = useCallback(async () => {
    try {
      const response = await sendBackground({ type: "refreshHelper" });
      if (response.ok && response.state) {
        setState(response.state);
        showToast(
          response.state.helper.available ? "success" : "error",
          response.state.helper.available
            ? `Helper ready${response.state.helper.version ? ` (v${response.state.helper.version})` : ""}.`
            : response.state.helper.error || "The helper was not found."
        );
      } else if (!response.ok) {
        showToast("error", response.error);
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not refresh the helper.");
    }
  }, [setState, showToast]);

  const testExit = useCallback(async () => {
    setTesting(true);
    try {
      const response = await sendBackground({ type: "testExit" });
      if (response.ok && response.exitIp) {
        setExitIp(response.exitIp);
        showToast("success", `Exit IP: ${response.exitIp}`);
      } else if (!response.ok) {
        showToast("error", response.error);
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "The test failed.");
    } finally {
      setTesting(false);
    }
  }, [showToast]);

  const openSetup = useCallback(
    (from: View) => {
      setSetupReturn(from);
      setView("setup");
    },
    []
  );

  // Keep the stored selection valid after a storage-level change.

  if (!state) {
    return (
      <div className="app splash">
        <LogoMark size={52} />
        <h1>Browser Xray</h1>
        <div className="splash-spinner" />
        <p>Starting the extension…</p>
      </div>
    );
  }

  return (
    <div className="app">
      {view === "home" && (
        <>
          <Header
            helperAvailable={state.helper.available}
            helperChecked={true}
            onSettings={() => setView("settings")}
          />
          <main className="home">
            {state.restartNotice && <RestartNotice onDismiss={dismissRestartNotice} />}
            <UpdateNotice />
            <StatusCard
              connection={connection}
              profile={displayProfile}
              helper={state.helper}
              now={now}
              busy={action === "connect" || connection.phase === "connecting"}
              disabled={action !== null}
              testing={testing}
              exitIp={exitIp}
              onToggle={onToggle}
              onAddServer={() => setView("import")}
              onTestExit={() => void testExit()}
              onSetup={() => openSetup("home")}
            />
            <ServerList
              profiles={profiles}
              selectedId={selectedId}
              connectedProfileId={
                connection.phase === "connected" ? connection.profileId : undefined
              }
              onSelect={(profile) => void handleSelect(profile)}
              onAdd={() => setView("import")}
              onRename={(profile) => {
                setRenameTarget(profile);
                setRenameValue(profile.name);
              }}
              onDelete={(profile) => setDeleteTarget(profile)}
            />
          </main>
          <footer className="app-footer">
            <span className="footer-badge">
              <span className="footer-dot" />
              Browser-only routing
            </span>
            <span>v{chrome.runtime.getManifest().version}</span>
          </footer>
        </>
      )}

      {view === "import" && (
        <ImportView
          existingProfiles={profiles}
          onImport={(incoming) => void handleImport(incoming)}
          onBack={() => setView("home")}
        />
      )}

      {view === "settings" && (
        <SettingsView
          state={state}
          onBack={() => setView("home")}
          onOpenData={openData}
          onRefreshHelper={refreshHelper}
          onClearAll={() => setClearConfirm(true)}
          onSetup={() => openSetup("settings")}
          onToast={showToast}
        />
      )}

      {view === "setup" && (
        <SetupView
          onBack={() => setView(setupReturn)}
          onToast={showToast}
        />
      )}

      {toast && <Toast kind={toast.kind} message={toast.message} />}

      {renameTarget && (
        <Modal
          title="Rename server"
          onClose={() => setRenameTarget(null)}
          actions={
            <>
              <button className="ghost-button" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
              <button
                className="primary-button compact"
                onClick={() => void confirmRename()}
                disabled={!renameValue.trim()}
              >
                Save
              </button>
            </>
          }
        >
          <label className="field-label" htmlFor="rename-input">
            Server name
          </label>
          <input
            id="rename-input"
            className="text-input"
            value={renameValue}
            maxLength={100}
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void confirmRename();
            }}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Remove server?"
          onClose={() => setDeleteTarget(null)}
          actions={
            <>
              <button className="ghost-button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="danger-button compact" onClick={() => void confirmDelete()}>
                Remove
              </button>
            </>
          }
        >
          <p className="modal-copy">
            <strong>{deleteTarget.name}</strong> will be removed from this browser. If it is
            currently connected, the tunnel will be disconnected first.
          </p>
        </Modal>
      )}

      {clearConfirm && (
        <Modal
          title="Clear all servers?"
          onClose={() => setClearConfirm(false)}
          actions={
            <>
              <button className="ghost-button" onClick={() => setClearConfirm(false)}>
                Cancel
              </button>
              <button className="danger-button compact" onClick={() => void confirmClearAll()}>
                Clear all
              </button>
            </>
          }
        >
          <p className="modal-copy">
            This disconnects the browser and deletes all saved server links from local extension
            storage. It cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
