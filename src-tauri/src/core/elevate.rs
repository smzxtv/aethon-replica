//! Windows elevation helpers for VPN (TUN) mode.
//! On non-Windows targets these behave as "already elevated".

/// True when the current process runs with administrator privileges.
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        #[allow(clippy::needless_bool)]
        {
            is_elevated::is_elevated()
        }
    }
    #[cfg(not(windows))]
    {
        true
    }
}

/// Relaunch the current executable with the "runas" verb (UAC) and report
/// whether the elevated instance was successfully spawned. The user may
/// cancel the UAC prompt, in which case the original process stays alive.
pub fn relaunch_elevated() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ptr::null_mut;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let exe =
            std::env::current_exe().map_err(|e| format!("cannot locate executable: {e}"))?;
        let args: Vec<String> = std::env::args().skip(1).filter(|a| a != "--elevated").collect();
        let params = args.join(" ");

        let verb: Vec<u16> = "runas\0".encode_utf16().collect();
        let mut exe_wide: Vec<u16> =
            exe.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut params_wide: Vec<u16> = params.encode_utf16().chain(std::iter::once(0)).collect();

        let hret = unsafe {
            ShellExecuteW(
                null_mut(),
                verb.as_ptr(),
                exe_wide.as_mut_ptr(),
                params_wide.as_mut_ptr(),
                std::ptr::null(),
                SW_SHOWNORMAL as i32,
            )
        };
        // ShellExecuteW success is indicated by a return value > 32.
        if (hret as isize) <= 32 {
            Err(format!("elevation request failed (ShellExecuteW -> {hret:?})"))
        } else {
            Ok(true)
        }
    }
    #[cfg(not(windows))]
    {
        Ok(true)
    }
}