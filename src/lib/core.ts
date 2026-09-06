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