import { useEffect } from "react";
import { AppProvider, useApp } from "./store";
import { getAppInfo, loadAppState, saveAppState } from "./lib/core";
import Sidebar from "./components/Sidebar";
import ConnectPage from "./pages/ConnectPage";
import ConfigurationsPage from "./pages/ConfigurationsPage";
import SettingsPage from "./pages/SettingsPage";

function Shell() {
  const { state, dispatch } = useApp();

  // Load app metadata from the Rust backend.
  useEffect(() => {
    getAppInfo()
      .then((info) => dispatch({ type: "set-app-info", info }))
      .catch((err) =>
        dispatch({ type: "push-log", line: `[app] cannot reach backend: ${String(err)}` }),
      );
  }, [dispatch]);

  // Load persisted profiles/settings once on boot.
  useEffect(() => {
    loadAppState()
      .then((saved) => dispatch({ type: "hydrate", state: saved }))
      .catch((err) =>
        dispatch({ type: "push-log", line: `[app] failed to load saved state: ${String(err)}` }),
      );
  }, [dispatch]);

  // Debounce-save any change to profiles/settings/selection after hydration.
  useEffect(() => {
    if (!state.hydrated) return;
    const t = setTimeout(() => {
      saveAppState({
        profiles: state.profiles,
        selectedProfileId: state.conn.profileId,
        settings: state.settings,
        mode: state.conn.mode,
        protocol: state.conn.protocol,
        scanMode: state.conn.scanMode,
      }).catch((err) =>
        dispatch({ type: "push-log", line: `[app] failed to save state: ${String(err)}` }),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [
    state.hydrated,
    state.profiles,
    state.settings,
    state.conn.mode,
    state.conn.profileId,
    state.conn.protocol,
    state.conn.scanMode,
    dispatch,
  ]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        {state.page === "connect" && <ConnectPage />}
        {state.page === "configurations" && <ConfigurationsPage />}
        {state.page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
