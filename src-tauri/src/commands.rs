use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::core::config::{build_config, ConnectParams};
use crate::core::routing;
use crate::core::session::CoreSession;
use crate::core::singbox;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreInfo {
    pub sing_box_version: String,
    pub core_path: Option<String>,
    pub core_present: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_name: String,
    pub app_version: String,
    pub core: CoreInfo,
}

/// Payload from the Connect page describing a single session to start.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub mode: String,
    pub protocol: String,
    pub address: String,
    pub port: u16,
    pub params: HashMap<String, String>,
    pub socks_port: u16,
    pub log_level: String,
}

/// Server profile, mirrored from the frontend store for persistence.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PersistedProfile {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub address: String,
    pub port: u16,
    pub params: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    pub socks_port: u16,
    pub log_level: String,
    pub auto_update: bool,
    pub auto_update_hours: u32,
    pub auto_download: bool,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            socks_port: 1819,
            log_level: "info".into(),
            auto_update: true,
            auto_update_hours: 12,
            auto_download: false,
        }
    }
}

/// Whole frontend state that survives restarts.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub profiles: Vec<PersistedProfile>,
    pub selected_profile_id: Option<String>,
    pub settings: PersistedSettings,
    pub mode: String,
    pub protocol: String,
    pub scan_mode: String,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            profiles: vec![],
            selected_profile_id: None,
            settings: PersistedSettings::default(),
            mode: "vpn".into(),
            protocol: "auto".into(),
            scan_mode: "disabled".into(),
        }
    }
}

fn state_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    Ok(dir.join("app-state.json"))
}

/// Reports application metadata plus the state of the bundled sing-box core.
#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let pkg = app.package_info();
    let path = app
        .state::<AppState>()
        .core_path
        .lock()
        .unwrap()
        .clone();

    let (core_present, core_path, sing_box_version) = match path {
        Some(p) if p.is_file() => {
            (true, Some(p.display().to_string()), singbox::core_version(&p))
        }
        _ => match singbox::resolve_core_path(&app) {
            Some(p) => {
                let version = singbox::core_version(&p);
                *app.state::<AppState>().core_path.lock().unwrap() = Some(p.clone());
                (true, Some(p.display().to_string()), version)
            }
            None => (false, None, "core not fetched".to_string()),
        },
    };

    AppInfo {
        app_name: pkg.name.to_string(),
        app_version: pkg.version.to_string(),
        core: CoreInfo {
            sing_box_version,
            core_path,
            core_present,
        },
    }
}

/// Start a sing-box session described by `req`.
///
/// Emits `core-status: "connected"` on success; log lines stream over
/// `core-log` and process exit over `core-exited`.
#[tauri::command]
pub fn connect(app: AppHandle, req: ConnectRequest) -> Result<(), String> {
    #[cfg(windows)]
    if req.mode == "vpn" && !crate::core::elevate::is_elevated() {
        return Err("VPN mode requires administrator privileges — click Connect again to elevate".to_string());
    }

    // Routing pre-flight + stale adapter recovery for VPN (TUN) mode.
    if req.mode == "vpn" {
        match routing::prepare_for_tun(&app) {
            Ok(report) if !report.can_start => {
                return Err(report.messages.join(" "));
            }
            Ok(_) => {}
            Err(e) => return Err(e),
        }
    }

    {
        let state = app.state::<AppState>();
        let guard = state.session.lock().unwrap();
        if guard.is_some() {
            return Err("a session is already active; disconnect first".to_string());
        }
    }

    let exe = app
        .state::<AppState>()
        .core_path
        .lock()
        .unwrap()
        .clone()
        .or_else(|| singbox::resolve_core_path(&app))
        .ok_or_else(|| "sing-box core not found — run `npm run fetch:core`".to_string())?;

    let params = ConnectParams {
        mode: req.mode,
        protocol: req.protocol,
        address: req.address,
        port: req.port,
        params: req.params,
        socks_port: req.socks_port,
        log_level: req.log_level,
    };
    let cfg = build_config(&params)?;

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    let config_path = dir.join("session.json");
    let pretty =
        serde_json::to_string_pretty(&cfg).map_err(|e| format!("cannot serialize config: {e}"))?;
    std::fs::write(&config_path, pretty).map_err(|e| format!("cannot write config: {e}"))?;

    let session = CoreSession::spawn(app.clone(), &exe, &config_path, &dir)?;
    *app.state::<AppState>().session.lock().unwrap() = Some(session);
    *app.state::<AppState>().session_mode.lock().unwrap() = params.mode.clone();

    let _ = app.emit("core-status", "connected");
    Ok(())
}

/// Tear down the active session (if any) and clean up the child process.
#[tauri::command]
pub fn disconnect(app: AppHandle) -> Result<(), String> {
    let session = app
        .state::<AppState>()
        .session
        .lock()
        .unwrap()
        .take();
    if let Some(session) = session {
        session.kill()?;
    }

    // Post-session routing cleanup for VPN (TUN) mode.
    let mode = app.state::<AppState>().session_mode.lock().unwrap().clone();
    *app.state::<AppState>().session_mode.lock().unwrap() = String::new();
    if mode == "vpn" {
        let _ = routing::teardown_after_tun(&app);
    }

    let _ = app.emit("core-status", "disconnected");
    Ok(())
}

/// Load previously persisted frontend state (profiles, settings, selection).
#[tauri::command]
pub fn load_app_state(app: AppHandle) -> PersistedState {
    match state_file_path(&app) {
        Ok(path) => std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        Err(_) => PersistedState::default(),
    }
}

/// Persist frontend state so it survives restarts.
#[tauri::command]
pub fn save_app_state(app: AppHandle, state: PersistedState) -> Result<(), String> {
    let path = state_file_path(&app)?;
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("cannot serialize state: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("cannot write state: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ElevationStatus {
    Elevated,
    Relaunching,
}

/// Ensure the process is running elevated for VPN (TUN) mode. If not, relaunch
/// the app via UAC and exit this copy; the frontend shows a notice meanwhile.
#[tauri::command]
pub fn ensure_vpn_elevation(app: AppHandle) -> Result<ElevationStatus, String> {
    if crate::core::elevate::is_elevated() {
        return Ok(ElevationStatus::Elevated);
    }
    match crate::core::elevate::relaunch_elevated() {
        Ok(true) => {
            let _ = app.emit("elevation-relaunching", ());
            let app2 = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                app2.exit(0);
            });
            Ok(ElevationStatus::Relaunching)
        }
        Ok(false) => Err("elevation was requested but not confirmed".to_string()),
        Err(e) => Err(e),
    }
}

/// Probe TCP reachability of a server endpoint (used by the Test button).
#[tauri::command]
pub fn test_endpoint(address: String, port: u16) -> Result<String, String> {
    use std::net::{SocketAddr, ToSocketAddrs};
    use std::time::Duration;

    let host = format!("{address}:{port}");
    let addrs: Vec<SocketAddr> = host
        .to_socket_addrs()
        .map_err(|e| format!("cannot resolve {address}: {e}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("{address} resolved to no addresses"));
    }
    for addr in addrs {
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(8)).is_ok() {
            return Ok(format!("{address}:{port} reachable ({addr})"));
        }
    }
    Err(format!("{address}:{port} unreachable"))
}

/// Stop any active session and flush the local DNS cache.
#[tauri::command]
pub fn recover_network(app: AppHandle) -> Result<String, String> {
    let session = {
        let state = app.state::<AppState>();
        let mut guard = state.session.lock().unwrap();
        guard.take()
    };
    if let Some(s) = session {
        let _ = s.kill();
    }
    let _ = app.emit("core-status", "disconnected");

    #[cfg(windows)]
    {
        match std::process::Command::new("ipconfig").arg("/flushdns").output() {
            Ok(o) if o.status.success() => Ok("session stopped; DNS cache flushed".to_string()),
            Ok(o) => Ok(format!("session stopped; ipconfig exited with {o:?}")),
            Err(e) => Ok(format!("session stopped; ipconfig unavailable: {e}")),
        }
    }
    #[cfg(not(windows))]
    {
        Ok("session stopped".to_string())
    }
}

/// Pre-flight check before starting a TUN session: elevation, wintun, stale adapters.
#[tauri::command]
pub fn routing_preflight(app: AppHandle) -> Result<crate::core::routing::PreflightReport, String> {
    crate::core::routing::prepare_for_tun(&app)
}

/// Full routing snapshot for diagnostics (adapters, routes, DNS).
#[tauri::command]
pub fn routing_diagnostics(app: AppHandle) -> crate::core::routing::RoutingDiagnostics {
    crate::core::routing::diagnostics(&app)
}

/// Detect and report orphaned TUN adapters from crashed sessions.
#[tauri::command]
pub fn routing_recover(app: AppHandle) -> Result<Vec<String>, String> {
    crate::core::routing::recover_stale_adapters(&app)
}

/// Flush DNS cache and verify the default route is restored.
#[tauri::command]
pub fn routing_cleanup(app: AppHandle) -> Result<std::collections::HashMap<String, String>, String> {
    crate::core::routing::cleanup(&app)
}