import { useState } from "react";
import { useApp } from "../store";
import type { Protocol, ServerProfile } from "../types";

const PROTOCOLS: Protocol[] = [
  "auto",
  "shadowsocks",
  "vmess",
  "vless",
  "trojan",
  "hysteria2",
  "tuic",
];

function blankProfile(): ServerProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    protocol: "shadowsocks",
    address: "",
    port: 443,
    params: {},
  };
}

export default function ConfigurationsPage() {
  const { state, dispatch } = useApp();
  const [editing, setEditing] = useState<ServerProfile | null>(null);
  const [paramsText, setParamsText] = useState("{}");

  function startEdit(p?: ServerProfile) {
    if (p) {
      setEditing({ ...p });
      setParamsText(JSON.stringify(p.params, null, 2));
    } else {
      setEditing(blankProfile());
      setParamsText("{}");
    }
  }

  function save() {
    if (!editing) return;
    let params: Record<string, string> = {};
    try {
      params = paramsText.trim() ? JSON.parse(paramsText) : {};
    } catch {
      window.alert("Params must be valid JSON.");
      return;
    }
    const profile = { ...editing, params };
    const exists = state.profiles.some((p) => p.id === profile.id);
    if (exists) dispatch({ type: "update-profile", profile });
    else dispatch({ type: "add-profile", profile });
    setEditing(null);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Configurations</h1>
          <p className="muted">Server profiles used by Connect.</p>
        </div>
        <button className="primary" onClick={() => startEdit()}>
          New configuration
        </button>
      </header>

      <section className="card">
        {state.profiles.length === 0 && <p className="muted">No profiles yet — create one.</p>}
        <ul className="profile-list">
          {state.profiles.map((p) => (
            <li key={p.id} className="profile-row">
              <div>
                <strong>{p.name || p.address}</strong>
                <span className="muted">
                  {p.protocol} · {p.address}:{p.port}
                </span>
              </div>
              <div className="row-actions">
                <button className="ghost" onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button
                  className="ghost danger-text"
                  onClick={() => dispatch({ type: "remove-profile", id: p.id })}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {state.profiles.some((p) => p.id === editing.id)
                ? "Edit configuration"
                : "New configuration"}
            </h2>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Protocol</span>
                <select
                  value={editing.protocol}
                  onChange={(e) =>
                    setEditing({ ...editing, protocol: e.target.value as Protocol })
                  }
                >
                  {PROTOCOLS.map((pr) => (
                    <option key={pr} value={pr}>
                      {pr}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Address</span>
                <input
                  value={editing.address}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={editing.port}
                  onChange={(e) => setEditing({ ...editing, port: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              <span>Params (JSON)</span>
              <textarea
                rows={5}
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}