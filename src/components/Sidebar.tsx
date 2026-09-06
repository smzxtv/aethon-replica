import { useApp } from "../store";
import type { Page } from "../types";

const NAV: { id: Page; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "configurations", label: "Configurations" },
  { id: "settings", label: "Settings" },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AR</div>
        <div>
          <div className="brand-name">Aethon Replica</div>
          <div className="brand-sub">sing-box frontend</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${state.page === item.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "set-page", page: item.id })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div>
          {state.appInfo
            ? `v${state.appInfo.appVersion} · core ${state.appInfo.core.singBoxVersion}`
            : "contacting backend…"}
        </div>
        <div className={`core-dot ${state.appInfo?.core.corePresent ? "ok" : ""}`}>
          {state.appInfo?.core.corePresent ? "core ready" : "core missing — run fetch:core"}
        </div>
      </div>
    </aside>
  );
}