use serde::Serialize;
use tauri::{AppHandle, Manager};

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

/// Reports application metadata plus the state of the bundled sing-box core.
/// Stage 1 will add connect/disconnect/session commands alongside this.
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