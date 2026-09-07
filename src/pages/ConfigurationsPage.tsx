import { useState } from "react";
import { useApp } from "../store";
import type { Protocol } from "../types";

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "vmess", label: "VMess" },
  { value: "vless", label: "VLESS" },
  { value: "trojan", label: "Trojan" },
  { value: "hysteria2", label: "Hysteria2" },
  { value: "tuic", label: "TUIC" },
];

export default function ConfigurationsPage() {
  const { state, dispatch } = useApp();
  const { profiles, conn } = state;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("shadowsocks");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState(443);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  function resetForm() {
    setName("");
    setProtocol("shadowsocks");
    setAddress("");
    setPort(443);
    setUsername("");
    setPassword("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(id: string) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    setProtocol(p.protocol);
    setAddress(p.address);
    setPort(p.port);
    setUsername(p.params.username ?? "");
    setPassword(p.params.password ?? "");
    setEditingId(id);
    setShowForm(true);
  }

  function saveProfile() {
    if (!name.trim() || !address.trim() || port <= 0) return;
    const params: Record<string, string> = {};
    if (username.trim()) params.username = username.trim();
    if (password.trim()) params.password = password.trim();
    const profile = { id: editingId ?? `profile-${Date.now()}`, name: name.trim(), protocol, address: address.trim(), port, params };
    if (editingId) {
      dispatch({ type: "update-profile", profile });
    } else {
      dispatch({ type: "add-profile", profile });
    }
    resetForm();
  }
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>配置</h1>
          <p className="muted">管理服务器配置文件和协议设置。</p>
        </div>
      </header>

      <section className="card">
        <div className="diag-head">
          <h2>服务器配置</h2>
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "取消" : "添加配置"}
          </button>
        </div>

        {showForm && (
          <div className="profile-form">
            <div className="form-row">
              <label className="field">
                <span>名称</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="我的服务器" />
              </label>
              <label className="field">
                <span>协议</span>
                <select value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)}>
                  {PROTOCOLS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>地址</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="example.com" />
              </label>
              <label className="field">
                <span>端口</span>
                <input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>用户名（可选）</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label className="field">
                <span>密码（可选）</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <button className="primary" onClick={saveProfile}>
                {editingId ? "保存修改" : "添加"}
              </button>
              <button className="ghost" onClick={resetForm}>取消</button>
            </div>
          </div>
        )}
        <ul className="profile-list">
          {profiles.map((p) => (
            <li key={p.id} className={p.id === conn.profileId ? "selected" : ""}>
              <button className="profile-item" onClick={() => dispatch({ type: "select-profile", id: p.id })}>
                <strong>{p.name}</strong>
                <span className="muted">{p.protocol} · {p.address}:{p.port}</span>
              </button>
              <div className="profile-actions">
                <button className="ghost small" onClick={() => startEdit(p.id)}>编辑</button>
                <button className="ghost small danger" onClick={() => dispatch({ type: "remove-profile", id: p.id })}>删除</button>
              </div>
            </li>
          ))}
          {!profiles.length && <li className="muted empty">暂无配置，点击"添加配置"开始。</li>}
        </ul>
      </section>
    </div>
  );
}

