import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useApp } from "../store";
import {
  connectClient,
  disconnectClient,
  ensureVpnElevation,
  recoverNetwork,
  testEndpoint,
  routingPreflight,
  routingDiagnostics,
  routingRecover,
  routingCleanup,
} from "../lib/core";
import type { PreflightReport, RoutingDiagnostics } from "../lib/core";
import StatusBadge from "../components/StatusBadge";
import type { ConnectionMode, ConnectionState, Protocol, ScanMode } from "../types";

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "vmess", label: "VMess" },
  { value: "vless", label: "VLESS" },
  { value: "trojan", label: "Trojan" },
  { value: "hysteria2", label: "Hysteria2" },
  { value: "tuic", label: "TUIC" },
];

const SCAN_MODES: { value: ScanMode; label: string }[] = [
  { value: "disabled", label: "Off" },
  { value: "quick", label: "Quick" },
  { value: "full", label: "Full" },
];

export default function ConnectPage() {
  const { state, dispatch } = useApp();
  const { conn, status, profiles, logs, settings } = state;
  const selectedProfile = profiles.find((p) => p.id === conn.profileId);
  const [elevating, setElevating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];
    listen<string>("core-log", (event) => {
      if (!cancelled) dispatch({ type: "push-log", line: event.payload });
    }).then((fn) => unlisteners.push(fn));
    listen<string>("core-status", (event) => {
      if (!cancelled)
        dispatch({ type: "set-status", status: event.payload as ConnectionState });
    }).then((fn) => unlisteners.push(fn));
    listen<string>("core-exited", () => {
      if (!cancelled) dispatch({ type: "set-status", status: "disconnected" });
    }).then((fn) => unlisteners.push(fn));
    return () => {
      cancelled = true;
      for (const fn of unlisteners) fn();
    };
  }, [dispatch]);

  async function handleConnect() {
    if (status === "connected") {
      try {
        await disconnectClient();
        dispatch({ type: "push-log", line: "[core] session torn down by user" });
      } catch (err) {
        dispatch({ type: "push-log", line: `[core] ${String(err)}` });
      }
      return;
    }
    if (!selectedProfile) {
      dispatch({ type: "set-status", status: "error" });
      dispatch({ type: "push-log", line: "[app] create a server profile first" });
      return;
    }
    if (conn.mode === "vpn") {
      try {
        const elev = await ensureVpnElevation();
        if (elev !== "elevated") {
          setElevating(true);
          dispatch({
            type: "push-log",
            line: "[app] administrator privileges requested — please confirm the UAC prompt",
          });
          return;
        }
      } catch (err) {
        dispatch({ type: "set-status", status: "error" });
        dispatch({ type: "push-log", line: `[app] elevation failed: ${String(err)}` });
        return;
      }
    }
    const protocol = conn.protocol === "auto" ? selectedProfile.protocol : conn.protocol;
    dispatch({ type: "set-status", status: "connecting" });
    dispatch({
      type: "push-log",
      line: `[core] starting session (mode=${conn.mode}, protocol=${protocol})…`,
    });
    try {
      await connectClient({
        mode: conn.mode,
        protocol,
        address: selectedProfile.address,
        port: selectedProfile.port,
        params: selectedProfile.params,
        socksPort: settings.socksPort,
        logLevel: settings.logLevel,
      });
      // The authoritative status arrives over core-status / core-exited events.
    } catch (err) {
      dispatch({ type: "set-status", status: "error" });
      dispatch({ type: "push-log", line: `[core] ${String(err)}` });
    }
  }

  async function testConnection() {
    if (!selectedProfile) return;
    dispatch({ type: "push-log", line: `[diag] testing ${selectedProfile.address}:${selectedProfile.port}…` });
    try {
      const result = await testEndpoint(selectedProfile.address, selectedProfile.port);
      dispatch({ type: "push-log", line: `[diag] ${result}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[diag] ${String(err)}` });
    }
  }

  async function recover() {
    dispatch({ type: "push-log", line: "[diag] recovering network…" });
    try {
      const result = await recoverNetwork();
      dispatch({ type: "push-log", line: `[diag] ${result}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[diag] ${String(err)}` });
    }
  }

  // ---------------------------------------------------------------------------
  // Routing diagnostics (VPN/TUN mode)
  // ---------------------------------------------------------------------------
  const [routingInfo, setRoutingInfo] = useState<RoutingDiagnostics | null>(null);
  const [preflightInfo, setPreflightInfo] = useState<PreflightReport | null>(null);

  async function runPreflight() {
    dispatch({ type: "push-log", line: "[routing] running pre-flight…" });
    try {
      const report = await routingPreflight();
      setPreflightInfo(report);
      dispatch({
        type: "push-log",
        line: `[routing] pre-flight: ${report.messages.join(" ")}`,
      });
    } catch (err) {
      dispatch({ type: "push-log", line: `[routing] ${String(err)}` });
    }
  }

  async function runRoutingDiagnostics() {
    dispatch({ type: "push-log", line: "[routing] gathering diagnostics…" });
    try {
      const info = await routingDiagnostics();
      setRoutingInfo(info);
      dispatch({
        type: "push-log",
        line: `[routing] adapters=${info.activeTunAdapters.length} routes=${info.defaultRoutes.length} dns=${info.dnsServers.length}`,
      });
    } catch (err) {
      dispatch({ type: "push-log", line: `[routing] ${String(err)}` });
    }
  }

  async function runRoutingRecover() {
    dispatch({ type: "push-log", line: "[routing] scanning for stale adapters…" });
    try {
      const stale = await routingRecover();
      dispatch({
        type: "push-log",
        line: `[routing] ${stale.length === 0 ? "no orphaned adapters" : `found: ${stale.join(", ")}`}`,
      });
    } catch (err) {
      dispatch({ type: "push-log", line: `[routing] ${String(err)}` });
    }
  }

  async function runRoutingCleanup() {
    dispatch({ type: "push-log", line: "[routing] cleaning up routes/DNS…" });
    try {
      const report = await routingCleanup();
      dispatch({
        type: "push-log",
        line: `[routing] dns=${report.dns ?? "?"} route=${report.route ?? "?"} stale=${report.stale_adapters ?? "?"}`,
      });
    } catch (err) {
      dispatch({ type: "push-log", line: `[routing] ${String(err)}` });
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Connect</h1>
          <p className="muted">System-wide VPN routing or a local SOCKS5 proxy.</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <section className="card">
        <h2>Mode</h2>
        <div className="mode-grid">
          <button
            className={`mode-card ${conn.mode === "vpn" ? "selected" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "vpn" as ConnectionMode })}
          >
            <strong>VPN Mode</strong>
            <span>System-wide route via TUN adapter</span>
          </button>
          <button
            className={`mode-card ${conn.mode === "socks5" ? "selected" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "socks5" as ConnectionMode })}
          >
            <strong>Manual SOCKS5</strong>
            <span>Proxy only · 127.0.0.1:{state.settings.socksPort}</span>
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Profile</h2>
        <div className="form-row">
          <label className="field">
            <span>Server profile</span>
            <select
              value={conn.profileId ?? ""}
              onChange={(e) =>
                dispatch({ type: "select-profile", id: e.target.value || null })
              }
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.address}:{p.port}
                </option>
              ))}
              {!profiles.length && <option value="">no profiles yet</option>}
            </select>
          </label>

          <label className="field">
            <span>Protocol</span>
            <select
              value={conn.protocol}
              onChange={(e) =>
                dispatch({ type: "set-protocol", protocol: e.target.value as Protocol })
              }
            >
              {PROTOCOLS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Scan mode</span>
            <select
              value={conn.scanMode}
              onChange={(e) =>
                dispatch({ type: "set-scan-mode", scanMode: e.target.value as ScanMode })
              }
            >
              {SCAN_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedProfile && (
          <p className="hint">
            {selectedProfile.protocol} · {selectedProfile.address}:{selectedProfile.port}
            {Object.keys(selectedProfile.params).length > 0
              ? " · " + Object.keys(selectedProfile.params).join(", ")
              : ""}
          </p>
        )}
      </section>

      {elevating && (
        <div className="notice">
          Administrator privileges were requested — please confirm the UAC prompt. The app will
          restart elevated, then press Connect again.
        </div>
      )}

      <div className="connect-row">
        <button
          className={`connect-btn ${status === "connected" ? "danger" : ""}`}
          onClick={handleConnect}
        >
          {status === "connected" ? "Disconnect" : "Connect"}
        </button>
      </div>

      <section className="card routing">
        <div className="diag-head">
          <h2>Routing (VPN mode)</h2>
          <div className="diag-actions">
            <button className="ghost" onClick={runPreflight}>
              Pre-flight
            </button>
            <button className="ghost" onClick={runRoutingDiagnostics}>
              Diagnostics
            </button>
            <button className="ghost" onClick={runRoutingRecover}>
              Recover adapters
            </button>
            <button className="ghost" onClick={runRoutingCleanup}>
              Cleanup
            </button>
          </div>
        </div>
        {preflightInfo && (
          <div className="routing-status">
            <span className={`badge ${preflightInfo.canStart ? "ok" : "warn"}`}>
              {preflightInfo.canStart ? "ready" : "blocked"}
            </span>
            <span className="muted">
              elevation={preflightInfo.elevated ? "yes" : "no"} · wintun=
              {preflightInfo.wintunAvailable ? "yes" : "no"} · stale adapters=
              {preflightInfo.staleAdapters.length}
            </span>
          </div>
        )}
        {routingInfo && (
          <dl className="routing-details">
            <dt>TUN adapters</dt>
            <dd>{routingInfo.activeTunAdapters.join(", ") || "none"}</dd>
            <dt>Default route</dt>
            <dd>{routingInfo.defaultRoutes.join(", ") || "none"}</dd>
            <dt>DNS servers</dt>
            <dd>{routingInfo.dnsServers.join(", ") || "none"}</dd>
            <dt>wintun.dll</dt>
            <dd>{routingInfo.wintunPath ?? "not found"}</dd>
          </dl>
        )}
        {!preflightInfo && !routingInfo && (
          <p className="muted">
            VPN mode requires elevation and wintun.dll. Use the buttons above to inspect the
            routing state.
          </p>
        )}
      </section>

      <section className="card diagnostics">
        <div className="diag-head">
          <h2>Diagnostics</h2>
          <div className="diag-actions">
            <button className="ghost" onClick={testConnection} disabled={!selectedProfile}>
              Test connection
            </button>
            <button className="ghost" onClick={recover}>
              Recover network
            </button>
            <button className="ghost" onClick={() => dispatch({ type: "clear-logs" })}>
              Clear
            </button>
          </div>
        </div>
        <pre className="log-view">
          {logs.map((l, i) => (
            <span key={i}>
              {l}
              {"\n"}
            </span>
          ))}
        </pre>
      </section>
    </div>
  );
}