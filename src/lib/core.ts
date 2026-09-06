import { invoke } from "@tauri-apps/api/core";

export interface CoreInfo {
  singBoxVersion: string;
  corePath: string | null;
  corePresent: boolean;
}

export interface AppInfo {
  appName: string;
  appVersion: string;
  core: CoreInfo;
}

/** Read application + bundled core metadata from the Rust backend. */
export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

export interface ConnectRequest {
  mode: "vpn" | "socks5";
  protocol: string;
  address: string;
  port: number;
  params: Record<string, string>;
  socksPort: number;
  logLevel: string;
}

/** Start a sing-box session.
 *  Log lines stream back over the `core-log` event; process exit over `core-exited`. */
export function connectClient(req: ConnectRequest): Promise<void> {
  return invoke<void>("connect", { req });
}

/** Tear down the active session. */
export function disconnectClient(): Promise<void> {
  return invoke<void>("disconnect");
}