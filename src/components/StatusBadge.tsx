import type { ConnectionState } from "../types";

const MAP: Record<ConnectionState, { label: string; className: string }> = {
  disconnected: { label: "已断开", className: "off" },
  connecting: { label: "连接中…", className: "busy" },
  connected: { label: "已连接", className: "on" },
  error: { label: "错误", className: "err" },
};

export default function StatusBadge({ status }: { status: ConnectionState }) {
  const m = MAP[status];
  return (
    <span className={`badge ${m.className}`}>
      <i className="dot" />
      {m.label}
    </span>
  );
}