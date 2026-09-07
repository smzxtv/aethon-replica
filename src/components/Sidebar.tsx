import { useApp } from "../store";
import type { Page } from "../types";

const NAV: { id: Page; label: string }[] = [
  { id: "connect", label: "连接" },
  { id: "configurations", label: "配置" },
  { id: "settings", label: "设置" },
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
            ? `v${state.appInfo.appVersion} · 核心 ${state.appInfo.core.singBoxVersion}`
            : "正在连接后端…"}
        </div>
        <div className={`core-dot ${state.appInfo?.core.corePresent ? "ok" : ""}`}>
          {state.appInfo?.core.corePresent ? "核心就绪" : "核心缺失 — 运行 fetch:core"}
        </div>
      </div>
    </aside>
  );
}