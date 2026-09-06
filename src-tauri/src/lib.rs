mod commands;
mod core;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(AppState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::connect,
            commands::disconnect,
            commands::load_app_state,
            commands::save_app_state,
            commands::ensure_vpn_elevation,
            commands::test_endpoint,
            commands::recover_network,
            commands::routing_preflight,
            commands::routing_diagnostics,
            commands::routing_recover,
            commands::routing_cleanup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
