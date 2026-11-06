//! OS integration: opening files, notifications, clipboard, single instance and
//! the Windows Share Target pipe used by `ShareShim.exe`.

use serde::Deserialize;
use std::future::Future;
use std::path::{Path, PathBuf};

#[cfg(windows)]
pub const SHARE_PIPE: &str = r"\\.\pipe\peerhop-share";
#[cfg(windows)]
const STORE_PRODUCT_ID: &str = "9N5VVVHD710V";

/// Payload written by ShareShim or forwarded by a second instance.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default)]
pub struct ShareData {
    pub files: Vec<String>,
    pub text: String,
    pub url: String,
    pub title: String,
}

pub fn open_file(path: &Path) {
    #[cfg(windows)]
    {
        // Files received from other devices carry a "mark of the web" that triggers warnings.
        let mut zone = path.as_os_str().to_owned();
        zone.push(":Zone.Identifier");
        let _ = std::fs::remove_file(zone);
    }
    let _ = open::that_detached(path);
}

pub fn show_in_folder(path: &Path) {
    let path = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    if path.is_dir() {
        let _ = open::that_detached(&path);
        return;
    }
    #[cfg(windows)]
    if path.exists() {
        use std::os::windows::process::CommandExt;
        // raw_arg keeps the quoting explorer expects: /select,"C:\a b\c.txt"
        let _ = std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", path.display())).spawn();
        return;
    }
    #[cfg(target_os = "macos")]
    if path.exists() {
        let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
        return;
    }
    // Missing file or no "select" support: open the containing folder.
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
        let _ = open::that_detached(parent);
    }
}

pub fn open_with(path: &Path) {
    #[cfg(windows)]
    {
        let _ = crate::net::command("rundll32.exe").arg("shell32.dll,OpenAs_RunDLL").arg(path).spawn();
    }
    #[cfg(not(windows))]
    open_file(path);
}

pub fn open_url(url: &str) {
    let _ = open::that_detached(url);
}

pub fn notify(title: impl AsRef<str>, body: impl AsRef<str>) {
    let _ = notify_rust::Notification::new().summary(title.as_ref()).body(body.as_ref()).show();
}

/// Opens the Microsoft Store rating dialog (Windows only).
pub fn request_review() {
    #[cfg(windows)]
    {
        let uri = format!("ms-windows-store://review/?ProductId={STORE_PRODUCT_ID}");
        let script = format!(
            "try {{ $r = [Windows.Services.Store.StoreRequestHelper]::SendRequestAsync(16, '{STORE_PRODUCT_ID}'); $r.GetResults() | Out-Null }} catch {{ Start-Process -FilePath '{uri}' }}"
        );
        std::thread::spawn(move || {
            let ok = crate::net::command("powershell")
                .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
                .status()
                .is_ok_and(|s| s.success());
            if !ok {
                open_url(&uri);
            }
        });
    }
}

/// True while Ctrl+V (or Shift+Insert) is physically held. egui emits no event
/// for a paste whose clipboard holds files or an image, so the GUI polls this.
pub fn paste_chord_down() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_INSERT, VK_SHIFT};
        let down = |vk: u16| GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0;
        (down(VK_CONTROL) && down(b'V' as u16)) || (down(VK_SHIFT) && down(VK_INSERT))
    }
    #[cfg(not(windows))]
    false
}

/// File paths currently on the clipboard (Explorer "Copy").
pub fn clipboard_files() -> Vec<PathBuf> {
    #[cfg(windows)]
    unsafe {
        use std::os::windows::ffi::OsStringExt;
        use windows_sys::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
        use windows_sys::Win32::UI::Shell::{DragQueryFileW, HDROP};
        const CF_HDROP: u32 = 15;
        let mut out = vec![];
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return out;
        }
        let handle = GetClipboardData(CF_HDROP);
        if !handle.is_null() {
            let drop = handle as HDROP;
            let count = DragQueryFileW(drop, u32::MAX, std::ptr::null_mut(), 0);
            for i in 0..count {
                let len = DragQueryFileW(drop, i, std::ptr::null_mut(), 0) as usize;
                let mut buf = vec![0u16; len + 1];
                DragQueryFileW(drop, i, buf.as_mut_ptr(), buf.len() as u32);
                out.push(PathBuf::from(std::ffi::OsString::from_wide(&buf[..len])));
            }
        }
        CloseClipboard();
        out
    }
    #[cfg(not(windows))]
    Vec::new()
}

/// Share payload left by ShareShim when the app was not running (cold start).
pub fn take_cold_start_share() -> Option<ShareData> {
    let path = cold_start_share_path();
    let bytes = std::fs::read(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    serde_json::from_slice(&bytes).ok()
}

fn cold_start_share_path() -> PathBuf {
    std::env::temp_dir().join("peerhop_share.json")
}

/// Hands a share payload (see [`ShareData`]) to the running app, or leaves it
/// for [`take_cold_start_share`] when the app is not running. Used by ShareShim.
#[cfg(windows)]
pub fn deliver_share(payload: &serde_json::Value) {
    let payload = payload.to_string();
    if !write_share_pipe(&payload, 1) {
        let _ = std::fs::write(cold_start_share_path(), payload);
    }
}

#[cfg(windows)]
fn write_share_pipe(payload: &str, attempts: u32) -> bool {
    use std::io::Write;
    for i in 0..attempts {
        if i > 0 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if let Ok(mut pipe) = std::fs::OpenOptions::new().write(true).open(SHARE_PIPE) {
            return pipe.write_all(payload.as_bytes()).is_ok();
        }
    }
    false
}

/// Existing paths passed on the command line ("Send with PeerHop").
pub fn cli_files() -> Vec<String> {
    std::env::args().skip(1).filter(|a| Path::new(a).exists()).collect()
}

/// Ensures one GUI instance. When another is already running, `files` are
/// forwarded to it, its window is focused, and `false` is returned.
pub fn acquire_single_instance(files: &[String]) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
        use windows_sys::Win32::System::Threading::CreateMutexW;
        let name: Vec<u16> = "Local\\PeerHopSingleInstance\0".encode_utf16().collect();
        // The handle is intentionally leaked: it must live as long as the process.
        let _handle = CreateMutexW(std::ptr::null(), 1, name.as_ptr());
        if GetLastError() == ERROR_ALREADY_EXISTS {
            if !files.is_empty() {
                send_to_running(files);
            }
            focus_existing_window();
            return false;
        }
        true
    }
    #[cfg(not(windows))]
    {
        let _ = files;
        true
    }
}

#[cfg(windows)]
fn send_to_running(files: &[String]) {
    let payload = serde_json::json!({ "title": "Shared from command-line", "files": files }).to_string();
    write_share_pipe(&payload, 5);
}

#[cfg(windows)]
fn focus_existing_window() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SW_RESTORE, SetForegroundWindow, ShowWindow};
    let title: Vec<u16> = "PeerHop\0".encode_utf16().collect();
    unsafe {
        let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
        if !hwnd.is_null() {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
    }
}

/// Accepts payloads on the share pipe forever (Windows); a no-op elsewhere.
pub fn serve_share_pipe(on_share: impl Fn(ShareData) + Send + 'static) -> impl Future<Output = ()> + Send + 'static {
    async move {
        #[cfg(windows)]
        {
            use tokio::io::AsyncReadExt;
            use tokio::net::windows::named_pipe::ServerOptions;
            let mut first = true;
            loop {
                let mut server = match ServerOptions::new().first_pipe_instance(first).create(SHARE_PIPE) {
                    Ok(s) => s,
                    Err(e) => {
                        crate::log_warn!("Share pipe unavailable: {e}");
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        continue;
                    }
                };
                first = false;
                if server.connect().await.is_err() {
                    continue;
                }
                let mut buf = Vec::new();
                // The writer closes the pipe when done, which ends the read (as EOF or BrokenPipe).
                let _ = tokio::time::timeout(std::time::Duration::from_secs(5), server.read_to_end(&mut buf)).await;
                match serde_json::from_slice::<ShareData>(&buf) {
                    Ok(data) => on_share(data),
                    Err(e) => crate::log_warn!("Ignoring malformed share payload: {e}"),
                }
            }
        }
        #[cfg(not(windows))]
        drop(on_share);
    }
}
