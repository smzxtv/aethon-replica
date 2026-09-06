use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

pub const CORE_SUBDIR: &str = "sing-box";

pub fn exe_name() -> &'static str {
    if cfg!(windows) {
        "sing-box.exe"
    } else {
        "sing-box"
    }
}

/// Resolve the sing-box executable, preferring (in order):
/// 1. resources next to the running binary (production bundle),
/// 2. the source-tree resources dir when developing from `src-tauri`.
pub fn resolve_core_path(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(res) = app.path().resolve(CORE_SUBDIR, Some(BaseDirectory::Resource)) {
        candidates.push(res.join(exe_name()));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(CORE_SUBDIR)
            .join(exe_name()),
    );

    candidates.into_iter().find(|p| p.is_file())
}

/// Read the first line of `sing-box version` output.
pub fn core_version(exe: &Path) -> String {
    match Command::new(exe).arg("version").output() {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let first = text.lines().next().unwrap_or("unknown");
            first.trim().to_string()
        }
        _ => "unknown".to_string(),
    }
}