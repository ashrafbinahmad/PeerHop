//! Persistent settings, stored as JSON in the same location and format the Go
//! version used (`%APPDATA%\PeerHop\settings.json` or `~/.peerhop/settings.json`),
//! so existing installs keep their configuration.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub text_transfer_enabled: bool,
    pub security_enabled: bool,
    pub is_dark_mode: bool,
    pub theme_id: String,
    pub accent_id: String,
    pub desktop_device_name: String,
    pub static_port_enabled: bool,
    pub static_port: u16,
    pub download_path: String,

    // Desktop-only state (previously kept in the WebView's localStorage).
    pub language: String,
    pub share_count: u32,
    pub has_reviewed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            text_transfer_enabled: false,
            security_enabled: true,
            is_dark_mode: false,
            theme_id: "system".into(),
            accent_id: "blue".into(),
            desktop_device_name: crate::util::hostname(),
            static_port_enabled: false,
            static_port: 9090,
            download_path: default_download_path().to_string_lossy().into_owned(),
            language: String::new(),
            share_count: 0,
            has_reviewed: false,
        }
    }
}

pub fn app_data_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir).join("PeerHop"),
        _ => home_dir().join(".peerhop"),
    }
}

pub fn home_dir() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn default_download_path() -> PathBuf {
    home_dir().join("Downloads").join("peerhop-desktop")
}

fn settings_path() -> PathBuf {
    app_data_dir().join("settings.json")
}

impl Settings {
    pub fn load() -> Self {
        let mut s: Settings = std::fs::read(settings_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let d = Settings::default();
        if s.desktop_device_name.trim().is_empty() {
            s.desktop_device_name = d.desktop_device_name;
        }
        if s.download_path.trim().is_empty() {
            s.download_path = d.download_path;
        }
        if s.theme_id.is_empty() {
            s.theme_id = d.theme_id;
        } else if !["day", "night", "system"].contains(&s.theme_id.as_str()) {
            // Retired colour presets map to the closest of light/dark.
            s.theme_id = if s.is_dark_mode { "night" } else { "day" }.into();
        }
        // Accent colours were removed; keep the field for older readers.
        s.accent_id = d.accent_id;
        if s.static_port == 0 {
            s.static_port = d.static_port;
        }
        s
    }

    /// Writes atomically (temp file + rename) so a crash never leaves a truncated file.
    pub fn save(&self) -> std::io::Result<()> {
        let path = settings_path();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(tmp, path)
    }
}
