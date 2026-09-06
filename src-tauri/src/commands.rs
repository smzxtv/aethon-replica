use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::core::config::{build_config, ConnectParams};
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
    let _ = app.emit("core-status", "disconnected");
    Ok(())
}