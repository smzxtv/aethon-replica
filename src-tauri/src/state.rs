use std::path::PathBuf;
use std::sync::Mutex;

use crate::core::session::CoreSession;

/// Long-lived process state shared across commands.
#[derive(Default)]
pub struct AppState {
    /// Lazily-resolved path to the bundled sing-box core binary.
    pub core_path: Mutex<Option<PathBuf>>,
    /// Active sing-box session, if any.
    pub session: Mutex<Option<CoreSession>>,
}