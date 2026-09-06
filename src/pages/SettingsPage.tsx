import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useApp } from "../store";
import type { LogLevel } from "../types";
import {
  checkForUpdates,
  downloadUpdate,
  type UpdateInfo,
  type UpdateProgress,
  type DownloadResult,
} from "../lib/core";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "done" | "error";

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const { settings, appInfo } = state;
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("never");
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null);

  // Listen for update events from the backend.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    listen<UpdateProgress>("update-progress", (e) => {
      setProgress(e.payload);
    }).then((fn) => unlisteners.push(fn));
    listen<DownloadResult>("update-downloaded", (e) => {
      setDownloadResult(e.payload);
      setUpdateStatus("done");
      setProgress(null);
    }).then((fn) => unlisteners.push(fn));
    listen<UpdateInfo>("update-available", (e) => {
      setUpdateInfo(e.payload);
      setUpdateStatus("available");
    }).then((fn) => unlisteners.push(fn));
    return () => {
      for (const fn of unlisteners) fn();
    };
  }, []);

  // Auto-update check on launch + every N hours while running.
  useEffect(() => {
    if (!settings.autoUpdate) return;
    let cancelled = false;
    const doCheck = () => {
      if (cancelled) return;
      checkForUpdates()
        .then(() => setLastCheck(new Date().toLocaleString()))
        .catch(() => setLastCheck(`failed at ${new Date().toLocaleString()}`));
    };
    doCheck();
    const ms = settings.autoUpdateHours * 60 * 60 * 1000;
    const interval = setInterval(doCheck, ms);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [settings.autoUpdate, settings.autoUpdateHours]);

  async function checkNow() {
    setUpdateStatus("checking");
    setUpdateError(null);
    setDownloadResult(null);
    try {
      const info = await checkForUpdates();
      if (info) {
        setUpdateInfo(info);
        setUpdateStatus("available");
        dispatch({
          type: "push-log",
          line: `[update] new version available: ${info.latestVersion}`,
        });
      } else {
        setUpdateStatus("idle");
        dispatch({ type: "push-log", line: "[update] already up to date" });
      }
      setLastCheck(new Date().toLocaleString());
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
      dispatch({ type: "push-log", line: `[update] ${String(err)}` });
    }
  }

  async function startDownload() {
    if (!updateInfo) return;
    const asset =
      updateInfo.assets.find((a) => a.name.includes("Windows-x64-Installer.exe")) ??
      updateInfo.assets.find((a) => a.name.endsWith(".exe")) ??
      updateInfo.assets[0];
    if (!asset) return;
    setUpdateStatus("downloading");
    setProgress(null);
    dispatch({
      type: "push-log",
      line: `[update] downloading ${asset.name} (${asset.size} bytes)…`,
    });
    try {
      const result = await downloadUpdate(asset.name);
      dispatch({
        type: "push-log",
        line: `[update] saved to ${result.savedPath} (verified=${result.verified}, launched=${result.launched})`,
      });
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
      dispatch({ type: "push-log", line: `[update] ${String(err)}` });
    }
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
          <button className="primary" onClick={checkNow} disabled={updateStatus === "checking"}>
            {updateStatus === "checking" ? "Checking…" : "Check now"}
          </button>
          {updateInfo && updateStatus === "available" && (
            <button className="primary" onClick={startDownload}>
              Download {updateInfo.latestVersion}
            </button>
          )}
          <span className="muted">Last check: {lastCheck}</span>
        </div>

        {updateStatus === "downloading" && progress && (
          <div className="update-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${progress.total > 0 ? (progress.received / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="muted">
              {(progress.received / 1024 / 1024).toFixed(1)} /{" "}
              {(progress.total / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        )}

        {updateStatus === "available" && updateInfo && (
          <div className="update-available">
            <h3>
              {updateInfo.latestVersion} available
              {updateInfo.publishedAt && (
                <span className="muted"> · published {updateInfo.publishedAt}</span>
              )}
            </h3>
            <pre className="release-notes">{updateInfo.releaseNotes}</pre>
          </div>
        )}

        {updateStatus === "done" && downloadResult && (
          <div className="notice">
            Update downloaded to {downloadResult.savedPath}
            {downloadResult.verified && " · SHA-256 verified"}
            {downloadResult.launched && " · installer launched"}
          </div>
        )}

        {updateStatus === "error" && updateError && (
          <div className="notice error">{updateError}</div>
        )}
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