import { createContext, useReducer, useContext } from "react";
import type { Dispatch, ReactNode } from "react";
import type { AppInfo } from "./lib/core";
import type {
  ConnectionMode,
  ConnectionSettings,
  ConnectionState,
  GeneralSettings,
  Page,
  Protocol,
  ScanMode,
  ServerProfile,
} from "./types";

export interface PersistedPayload {
  profiles: ServerProfile[];
  selectedProfileId: string | null;
  settings: GeneralSettings;
  mode: ConnectionMode;
  protocol: Protocol;
  scanMode: ScanMode;
}

export interface AppModel {
  page: Page;
  appInfo: AppInfo | null;
  /** false until the persisted state has been loaded from disk */
  hydrated: boolean;
  profiles: ServerProfile[];
  conn: ConnectionSettings;
  status: ConnectionState;
  logs: string[];
  settings: GeneralSettings;
}

export type Action =
  | { type: "set-page"; page: Page }
  | { type: "set-app-info"; info: AppInfo }
  | { type: "hydrate"; state: Partial<PersistedPayload> }
  | { type: "add-profile"; profile: ServerProfile }
  | { type: "update-profile"; profile: ServerProfile }
  | { type: "remove-profile"; id: string }
  | { type: "select-profile"; id: string | null }
  | { type: "set-mode"; mode: ConnectionMode }
  | { type: "set-protocol"; protocol: Protocol }
  | { type: "set-scan-mode"; scanMode: ScanMode }
  | { type: "set-status"; status: ConnectionState }
  | { type: "push-log"; line: string }
  | { type: "clear-logs" }
  | { type: "set-settings"; patch: Partial<GeneralSettings> };

const initialState: AppModel = {
  page: "connect",
  appInfo: null,
  hydrated: false,
  profiles: [],
  conn: { profileId: null, mode: "vpn", protocol: "auto", scanMode: "disabled" },
  status: "disconnected",
  logs: ["[app] Aethon Replica ready"],
  settings: {
    socksPort: 1819,
    logLevel: "info",
    autoUpdate: true,
    autoUpdateHours: 12,
    autoDownload: false,
  },
};

function reducer(state: AppModel, action: Action): AppModel {
  switch (action.type) {
    case "set-page":
      return { ...state, page: action.page };
    case "set-app-info":
      return { ...state, appInfo: action.info };
    case "hydrate":
      return {
        ...state,
        hydrated: true,
        profiles: action.state.profiles ?? state.profiles,
        conn: {
          profileId: action.state.selectedProfileId ?? state.conn.profileId,
          mode: action.state.mode ?? state.conn.mode,
          protocol: action.state.protocol ?? state.conn.protocol,
          scanMode: action.state.scanMode ?? state.conn.scanMode,
        },
        settings: { ...state.settings, ...action.state.settings },
      };
    case "add-profile":
      return { ...state, profiles: [...state.profiles, action.profile] };
    case "update-profile":
      return {
        ...state,
        profiles: state.profiles.map((p) => (p.id === action.profile.id ? action.profile : p)),
      };
    case "remove-profile":
      return {
        ...state,
        profiles: state.profiles.filter((p) => p.id !== action.id),
        conn:
          state.conn.profileId === action.id
            ? { ...state.conn, profileId: null }
            : state.conn,
      };
    case "select-profile":
      return { ...state, conn: { ...state.conn, profileId: action.id } };
    case "set-mode":
      return { ...state, conn: { ...state.conn, mode: action.mode } };
    case "set-protocol":
      return { ...state, conn: { ...state.conn, protocol: action.protocol } };
    case "set-scan-mode":
      return { ...state, conn: { ...state.conn, scanMode: action.scanMode } };
    case "set-status":
      return { ...state, status: action.status };
    case "push-log":
      return { ...state, logs: [...state.logs, action.line].slice(-500) };
    case "clear-logs":
      return { ...state, logs: [] };
    case "set-settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      return state;
  }
}

interface Ctx {
  state: AppModel;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}