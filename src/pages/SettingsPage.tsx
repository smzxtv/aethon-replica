import { useState } from "react";
import { useApp } from "../store";
import type { LogLevel } from "../types";

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const { settings, appInfo } = state;
  const [lastCheck, setLastCheck] = useState("never checked");

  function checkNow() {
    // Stage 2 wires this to the GitHub Releases endpoint + SHA-256 verification.
    const now = new Date().toLocaleString();
    setLastCheck(`checked ${now} — no updates found (backend lands in Stage 2)`);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Routing, proxy and update options.</p>
        </div>
      </header>

      <section className="card">
        <h2>Local proxy</h2>
        <div className="form-row">
          <label className="field">
            <span>SOCKS5 listener port</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={settings.socksPort}
              onChange={(e) =>
                dispatch({ type: "set-settings", patch: { socksPort: Number(e.target.value) } })
              }
            />
          </label>
          <label className="field">
            <span>Log level</span>
            <select
              value={settings.logLevel}
              onChange={(e) =>
                dispatch({
                  type: "set-settings",
                  patch: { logLevel: e.target.value as LogLevel },
                })
              }
            >
              {(["error", "warn", "info", "debug", "trace"] as LogLevel[]).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Updates</h2>
        <div className="form-row">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) =>
                dispatch({ type: "set-settings", patch: { autoUpdate: e.target.checked } })
              }
            />
            <span>Check on launch and every {settings.autoUpdateHours} h while running</span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.autoDownload}
              onChange={(e) =>
                dispatch({ type: "set-settings", patch: { autoDownload: e.target.checked } })
              }
            />
            <span>Download updates automatically (SHA-256 verified)</span>
          </label>
        </div>
        <div className="form-row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={checkNow}>
            Check now
          </button>
          <span className="muted">{lastCheck}</span>
        </div>
      </section>

      <section className="card">
        <h2>About</h2>
        <dl className="about">
          <dt>App</dt>
          <dd>{appInfo ? `${appInfo.appName} v${appInfo.appVersion}` : "…"}</dd>
          <dt>Core</dt>
          <dd>{appInfo ? appInfo.core.singBoxVersion : "…"}</dd>
          <dt>Core path</dt>
          <dd>{appInfo?.core.corePath ?? "not fetched"}</dd>
        </dl>
      </section>
    </div>
  );
}