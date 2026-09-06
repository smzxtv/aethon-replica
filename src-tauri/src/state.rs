use std::path::PathBuf;
use std::sync::Mutex;

/// Long-lived process state shared across commands.
#[derive(Default)]
pub struct AppState {
    /// Lazily-resolved path to the bundled sing-box core binary.
    pub core_path: Mutex<Option<PathBuf>>,
}