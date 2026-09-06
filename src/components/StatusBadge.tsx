import type { ConnectionState } from "../types";

const MAP: Record<ConnectionState, { label: string; className: string }> = {
  disconnected: { label: "Disconnected", className: "off" },
  connecting: { label: "Connecting…", className: "busy" },
  connected: { label: "Connected", className: "on" },
  error: { label: "Error", className: "err" },
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