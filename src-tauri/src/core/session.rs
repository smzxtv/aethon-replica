use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

/// A running sing-box session: child process + background log pump threads.
pub struct CoreSession {
    child: Arc<Mutex<Option<Child>>>,
    readers: Vec<thread::JoinHandle<()>>,
    monitor: Option<thread::JoinHandle<()>>,
    alive: Arc<AtomicBool>,
}

impl CoreSession {
    pub fn spawn(
        app: AppHandle,
        exe: &Path,
        config_path: &Path,
        dir: &Path,
    ) -> Result<Self, String> {
        let mut child = Command::new(exe)
            .args(["run", "-c"])
            .arg(config_path)
            .current_dir(dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to start sing-box core: {e}"))?;

        let stdout = child.stdout.take().ok_or("core stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("core stderr unavailable")?;

        let readers = vec![
            pump_logs(app.clone(), stdout, "out"),
            pump_logs(app.clone(), stderr, "err"),
        ];

        // Spawn a monitor thread that watches for unexpected process exit.
        // If the core dies (e.g. config error), auto-clear the session so the
        // user can retry without getting "session already active" errors.
        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_clone = Arc::clone(&child_arc);
        let alive = Arc::new(AtomicBool::new(true));
        let alive_clone = Arc::clone(&alive);
        let app_clone = app.clone();
        let monitor = thread::spawn(move || {
            // Wait a moment for the process to either stabilize or exit.
            thread::sleep(Duration::from_millis(1500));
            // If the child has already exited, mark alive=false so cleanup runs.
            let mut guard = child_clone.lock().unwrap();
            if let Some(ref mut c) = *guard {
                if let Ok(Some(code)) = c.try_wait() {
                    alive_clone.store(false, Ordering::SeqCst);
                    let _ = app_clone.emit("core-log", format!("[core] process exited with code {code}"));
                    let _ = app_clone.emit("core-exited", "monitor");
                }
            }
        });

        Ok(Self {
            child: child_arc,
            readers,
            monitor: Some(monitor),
            alive,
        })
    }

    /// Terminate the child, reap it, and join the log threads.
    pub fn kill(mut self) -> Result<(), String> {
        self.alive.store(false, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().unwrap().take() {
            child.kill().map_err(|e| format!("failed to stop core: {e}"))?;
            let _ = child.wait();
        }
        for handle in self.readers.drain(..) {
            let _ = handle.join();
        }
        if let Some(monitor) = self.monitor.take() {
            let _ = monitor.join();
        }
        Ok(())
    }

    /// Check if the session is still alive (core process running).
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
}

fn pump_logs(
    app: AppHandle,
    stream: impl Read + Send + 'static,
    tag: &'static str,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let trimmed = line.trim_end();
                    if !trimmed.is_empty() {
                        let _ = app.emit("core-log", format!("[{tag}] {trimmed}"));
                    }
                }
            }
        }
        // Stream closed => the core process has exited.
        let _ = app.emit("core-exited", tag);
    })
}