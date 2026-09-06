import { invoke } from "@tauri-apps/api/core";
import type {
  ConnectionMode,
  GeneralSettings,
  Protocol,
  ScanMode,
  ServerProfile,
} from "../types";

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

/** Result of an elevation request for VPN mode. */
export type ElevationStatus = "elevated" | "relaunching";

/** Ensure the process runs elevated (relaunches via UAC if needed). */
export function ensureVpnElevation(): Promise<ElevationStatus> {
  return invoke<ElevationStatus>("ensure_vpn_elevation");
}

/** Probe TCP reachability of a server endpoint. */
export function testEndpoint(address: string, port: number): Promise<string> {
  return invoke<string>("test_endpoint", { address, port });
}

/** Stop any session and flush the DNS cache. */
export function recoverNetwork(): Promise<string> {
  return invoke<string>("recover_network");
}

export interface PersistedPayload {
  profiles: ServerProfile[];
  selectedProfileId: string | null;
  settings: GeneralSettings;
  mode: ConnectionMode;
  protocol: Protocol;
  scanMode: ScanMode;
}

/** Load previously persisted frontend state. */
export function loadAppState(): Promise<PersistedPayload> {
  return invoke<PersistedPayload>("load_app_state");
}

/** Persist frontend state so it survives restarts. */
export function saveAppState(payload: PersistedPayload): Promise<void> {
  return invoke<void>("save_app_state", { state: payload });
}

// ---------------------------------------------------------------------------
// Routing helpers (VPN/TUN mode)
// ---------------------------------------------------------------------------

export interface PreflightReport {
  canStart: boolean;
  elevated: boolean;
  wintunAvailable: boolean;
  staleAdapters: string[];
  messages: string[];
}

export interface RoutingDiagnostics {
  elevated: boolean;
  wintunAvailable: boolean;
  wintunPath: string | null;
  activeTunAdapters: string[];
  defaultRoutes: string[];
  dnsServers: string[];
}

/** Pre-flight check before starting a TUN session. */
export function routingPreflight(): Promise<PreflightReport> {
  return invoke<PreflightReport>("routing_preflight");
}

/** Full routing snapshot for diagnostics. */
export function routingDiagnostics(): Promise<RoutingDiagnostics> {
  return invoke<RoutingDiagnostics>("routing_diagnostics");
}

/** Detect orphaned TUN adapters from crashed sessions. */
export function routingRecover(): Promise<string[]> {
  return invoke<string[]>("routing_recover");
}

/** Flush DNS cache and verify the default route. */
export function routingCleanup(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("routing_cleanup");
}

// ---------------------------------------------------------------------------
// Update checker (GitHub Releases)
// ---------------------------------------------------------------------------

export interface UpdateAsset {
  name: string;
  url: string;
  sha256: string | null;
  size: number;
}

export interface UpdateInfo {
  updateRepo: string;
  latestVersion: string;
  publishedAt: string | null;
  releaseNotes: string;
  updateAvailable: boolean;
  assets: UpdateAsset[];
}

export interface DownloadResult {
  asset: string;
  savedPath: string;
  verified: boolean;
  launched: boolean;
}

export interface UpdateProgress {
  asset: string;
  received: number;
  total: number;
}

/** Check GitHub Releases for a newer version. */
export function checkForUpdates(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>("check_for_updates");
}

/** Download a specific asset from the latest release. */
export function downloadUpdate(assetName: string): Promise<DownloadResult> {
  return invoke<DownloadResult>("download_update", { assetName });
}

/** Compare two version strings (semver-ish). */
export function versionCompare(latest: string, current: string): Promise<boolean> {
  return invoke<boolean>("version_compare", { latest, current });
}