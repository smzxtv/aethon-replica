use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;

use tauri::{AppHandle, Emitter};

/// A running sing-box session: child process + background log pump threads.
pub struct CoreSession {
    child: Child,
    readers: Vec<thread::JoinHandle<()>>,
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

        Ok(Self { child, readers })
    }

    /// Terminate the child, reap it, and join the log threads.
    pub fn kill(mut self) -> Result<(), String> {
        self.child
            .kill()
            .map_err(|e| format!("failed to stop core: {e}"))?;
        let _ = self.child.wait();
        for handle in self.readers.drain(..) {
            let _ = handle.join();
        }
        Ok(())
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