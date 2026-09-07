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
  { value: "auto", label: "自动" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "vmess", label: "VMess" },
  { value: "vless", label: "VLESS" },
  { value: "trojan", label: "Trojan" },
  { value: "hysteria2", label: "Hysteria2" },
  { value: "tuic", label: "TUIC" },
  { value: "http", label: "HTTP 代理 (Cloudflare/通用)" },
];

const SCAN_MODES: { value: ScanMode; label: string }[] = [
  { value: "disabled", label: "关闭" },
  { value: "quick", label: "快速" },
  { value: "full", label: "完整" },
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
        dispatch({ type: "push-log", line: "[核心] 会话已关闭" });
      } catch (err) {
        dispatch({ type: "set-status", status: "error" });
        dispatch({ type: "push-log", line: `[核心] ${String(err)}` });
      }
      return;
    }
    // 自动选择：未选中任何配置时，若存在配置则默认选第一个。
    let profile = selectedProfile;
    if (!profile && profiles.length > 0) {
      profile = profiles[0];
      dispatch({ type: "select-profile", id: profile.id });
      dispatch({ type: "push-log", line: `[核心] 已自动选择配置：${profile.name}` });
    }
    if (!profile) {
      dispatch({ type: "push-log", line: "[核心] 请先在「配置」页添加一个服务器配置" });
      return;
    }
    if (conn.mode === "vpn") {
      try {
        const result = await ensureVpnElevation();
        if (result === "relaunching") {
          setElevating(true);
          return;
        }
      } catch (err) {
        dispatch({ type: "push-log", line: `[权限] ${String(err)}` });
        return;
      }
    }
    dispatch({ type: "set-status", status: "connecting" });
    try {
      await connectClient({
        mode: conn.mode,
        protocol: profile.protocol,
        address: profile.address,
        port: profile.port,
        params: profile.params,
        socksPort: settings.socksPort,
        logLevel: settings.logLevel,
      });
    } catch (err) {
      dispatch({ type: "set-status", status: "error" });
      dispatch({ type: "push-log", line: `[核心] ${String(err)}` });
    }
  }
  async function testConnection() {
    if (!selectedProfile) return;
    dispatch({ type: "push-log", line: `[诊断] 正在测试 ${selectedProfile.address}:${selectedProfile.port}…` });
    try {
      const result = await testEndpoint(selectedProfile.address, selectedProfile.port);
      dispatch({ type: "push-log", line: `[诊断] ${result}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[诊断] ${String(err)}` });
    }
  }

  async function recover() {
    dispatch({ type: "push-log", line: "[诊断] 正在恢复网络…" });
    try {
      const result = await recoverNetwork();
      dispatch({ type: "push-log", line: `[诊断] ${result}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[诊断] ${String(err)}` });
    }
  }
  const [routingInfo, setRoutingInfo] = useState<RoutingDiagnostics | null>(null);
  const [preflightInfo, setPreflightInfo] = useState<PreflightReport | null>(null);

  async function runPreflight() {
    dispatch({ type: "push-log", line: "[路由] 正在运行预检…" });
    try {
      const report = await routingPreflight();
      setPreflightInfo(report);
      dispatch({ type: "push-log", line: `[路由] 预检: ${report.messages.join(" ")}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[路由] ${String(err)}` });
    }
  }

  async function runRoutingDiagnostics() {
    dispatch({ type: "push-log", line: "[路由] 正在收集诊断信息…" });
    try {
      const info = await routingDiagnostics();
      setRoutingInfo(info);
      dispatch({ type: "push-log", line: `[路由] 适配器=${info.activeTunAdapters.length} 路由=${info.defaultRoutes.length} DNS=${info.dnsServers.length}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[路由] ${String(err)}` });
    }
  }
  async function runRoutingRecover() {
    dispatch({ type: "push-log", line: "[路由] 正在扫描残留适配器…" });
    try {
      const stale = await routingRecover();
      dispatch({ type: "push-log", line: `[路由] ${stale.length === 0 ? "无残留适配器" : `发现: ${stale.join(", ")}`}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[路由] ${String(err)}` });
    }
  }

  async function runRoutingCleanup() {
    dispatch({ type: "push-log", line: "[路由] 正在清理路由/DNS…" });
    try {
      const report = await routingCleanup();
      dispatch({ type: "push-log", line: `[路由] DNS=${report.dns ?? "?"} 路由=${report.route ?? "?"} 残留=${report.stale_adapters ?? "?"}` });
    } catch (err) {
      dispatch({ type: "push-log", line: `[路由] ${String(err)}` });
    }
  }
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>连接</h1>
          <p className="muted">系统级 VPN 路由或本地 SOCKS5 代理。</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <section className="card">
        <h2>模式</h2>
        <div className="mode-grid">
          <button
            className={`mode-card ${conn.mode === "vpn" ? "selected" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "vpn" as ConnectionMode })}
          >
            <strong>VPN 模式</strong>
            <span>通过 TUN 适配器进行系统级路由</span>
          </button>
          <button
            className={`mode-card ${conn.mode === "socks5" ? "selected" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "socks5" as ConnectionMode })}
          >
            <strong>手动 SOCKS5</strong>
            <span>仅代理 · 127.0.0.1:{state.settings.socksPort}</span>
          </button>
        </div>
      </section>
      <section className="card">
        <h2>配置</h2>
        <div className="form-row">
          <label className="field">
            <span>服务器配置</span>
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
              {!profiles.length && <option value="">暂无配置</option>}
            </select>
          </label>

          <label className="field">
            <span>协议</span>
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
            <span>扫描模式</span>
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
          已请求管理员权限 — 请确认 UAC 提示。应用将重启并提升权限，然后请再次按连接。
        </div>
      )}

      <div className="connect-row">
        <button
          className={`connect-btn ${status === "connected" ? "danger" : ""}`}
          onClick={handleConnect}
        >
          {status === "connected" ? "断开" : "连接"}
        </button>
      </div>
      <section className="card routing">
        <div className="diag-head">
          <h2>路由（VPN 模式）</h2>
          <div className="diag-actions">
            <button className="ghost" onClick={runPreflight}>预检</button>
            <button className="ghost" onClick={runRoutingDiagnostics}>诊断</button>
            <button className="ghost" onClick={runRoutingRecover}>恢复适配器</button>
            <button className="ghost" onClick={runRoutingCleanup}>清理</button>
          </div>
        </div>
        {preflightInfo && (
          <div className="routing-status">
            <span className={`badge ${preflightInfo.canStart ? "ok" : "warn"}`}>
              {preflightInfo.canStart ? "就绪" : "已阻止"}
            </span>
            <span className="muted">
              权限={preflightInfo.elevated ? "是" : "否"} · wintun=
              {preflightInfo.wintunAvailable ? "是" : "否"} · 残留适配器=
              {preflightInfo.staleAdapters.length}
            </span>
          </div>
        )}
        {routingInfo && (
          <dl className="routing-details">
            <dt>TUN 适配器</dt>
            <dd>{routingInfo.activeTunAdapters.join(", ") || "无"}</dd>
            <dt>默认路由</dt>
            <dd>{routingInfo.defaultRoutes.join(", ") || "无"}</dd>
            <dt>DNS 服务器</dt>
            <dd>{routingInfo.dnsServers.join(", ") || "无"}</dd>
            <dt>wintun.dll</dt>
            <dd>{routingInfo.wintunPath ?? "未找到"}</dd>
          </dl>
        )}
        {!preflightInfo && !routingInfo && (
          <p className="muted">
            VPN 模式需要管理员权限和 wintun.dll。使用上方按钮查看路由状态。
          </p>
        )}
      </section>
      <section className="card diagnostics">
        <div className="diag-head">
          <h2>诊断</h2>
          <div className="diag-actions">
            <button className="ghost" onClick={testConnection} disabled={!selectedProfile}>
              测试连接
            </button>
            <button className="ghost" onClick={recover}>
              恢复网络
            </button>
            <button className="ghost" onClick={() => dispatch({ type: "clear-logs" })}>
              清空
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
