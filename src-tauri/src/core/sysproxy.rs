//! Windows system proxy auto-configuration.
//!
//! On connect (SOCKS5/mixed mode) we point the Windows system proxy at the
//! local mixed inbound so every browser picks the tunnel up without manual
//! setup. On disconnect the proxy is switched off again.

use std::process::Command;

const INET_SETTINGS_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";

fn reg_add(value: &str, kind: &str, data: &str) -> Result<(), String> {
    let out = Command::new("reg")
        .args(["add", INET_SETTINGS_KEY, "/v", value, "/t", kind, "/d", data, "/f"])
        .output()
        .map_err(|e| format!("cannot run reg.exe: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "reg add {value} failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// Nudge WinINET so running browsers notice the registry change immediately.
#[cfg(windows)]
fn refresh_wininet() {
    use windows_sys::Win32::Networking::WinInet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };
    unsafe {
        InternetSetOptionW(std::ptr::null_mut(), INTERNET_OPTION_SETTINGS_CHANGED, std::ptr::null_mut(), 0);
        InternetSetOptionW(std::ptr::null_mut(), INTERNET_OPTION_REFRESH, std::ptr::null_mut(), 0);
    }
}

#[cfg(not(windows))]
fn refresh_wininet() {}

/// Enable the system proxy pointing at `127.0.0.1:port`.
pub fn enable(port: u16) -> Result<(), String> {
    reg_add("ProxyServer", "REG_SZ", &format!("127.0.0.1:{port}"))?;
    reg_add("ProxyEnable", "REG_DWORD", "1")?;
    refresh_wininet();
    Ok(())
}

/// Disable the system proxy (restores direct connections).
pub fn disable() -> Result<(), String> {
    reg_add("ProxyEnable", "REG_DWORD", "0")?;
    refresh_wininet();
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn enable_and_disable_roundtrip() {
        super::enable(1819).unwrap();
        super::disable().unwrap();
    }
}
