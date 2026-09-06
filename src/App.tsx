import { useEffect } from "react";
import { AppProvider, useApp } from "./store";
import { getAppInfo } from "./lib/core";
import Sidebar from "./components/Sidebar";
import ConnectPage from "./pages/ConnectPage";
import ConfigurationsPage from "./pages/ConfigurationsPage";
import SettingsPage from "./pages/SettingsPage";

function Shell() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    getAppInfo()
      .then((info) => dispatch({ type: "set-app-info", info }))
      .catch((err) =>
        dispatch({ type: "push-log", line: `[app] cannot reach backend: ${String(err)}` }),
      );
  }, [dispatch]);

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
