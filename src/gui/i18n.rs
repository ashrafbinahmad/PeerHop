//! Translations shared with the web UI (`ui/frontend/src/langs`).
//! Arabic is web-only: egui has no right-to-left text shaping.

use std::collections::HashMap;

pub const LANGS: &[(&str, &str, &str)] = &[
    ("en", "English", include_str!("../../ui/frontend/src/langs/en.json")),
    ("de", "Deutsch", include_str!("../../ui/frontend/src/langs/de.json")),
    ("es", "Español", include_str!("../../ui/frontend/src/langs/es.json")),
    ("fr", "Français", include_str!("../../ui/frontend/src/langs/fr.json")),
    ("id", "Bahasa Indonesia", include_str!("../../ui/frontend/src/langs/id.json")),
];

/// Desktop-only strings not (yet) in the shared language files.
const EXTRA: &[(&str, &str)] = &[
    ("language", "Language"),
    ("theme", "Theme"),
    ("theme_light", "Light"),
    ("theme_dark", "Dark"),
    ("theme_system", "System"),
    ("connect", "Connect"),
    ("chat", "Chat"),
    ("open", "Open"),
    ("open_with", "Open with…"),
    ("show_in_folder", "Show in folder"),
    ("copy", "Copy"),
    ("copied", "Copied"),
    ("change", "Change"),
    ("static_port", "Static port"),
    ("static_port_hint", "Keep the same address between launches"),
    ("port", "Port"),
    ("invalid_port", "Port must be between 1 and 65535"),
    ("port_in_use", "Port {{port}} is unavailable; using {{fallback}}"),
    ("preparing_folder", "Preparing folder…"),
    ("zip_failed", "Could not prepare folder"),
    ("no_devices", "No devices connected yet"),
    ("allow_sending", "Allow sending"),
    ("restrict_sending", "Restrict sending"),
    ("block", "Block"),
    ("unblock", "Unblock"),
    ("waiting_for_device", "Waiting for a device to download"),
    ("file_missing", "File no longer exists"),
    ("paste_hint", "Drop, paste (Ctrl+V) or pick files to share"),
    ("send", "Send"),
    ("sending", "Sending"),
    ("receiving", "Receiving"),
    ("failed", "Failed"),
    ("pending", "Pending"),
    ("link_copied", "Link copied"),
    ("version", "Version"),
    ("text_disabled", "Text transfer is turned off in Settings"),
    ("rate_now", "Rate now"),
    ("not_now", "Not now"),
];

pub struct I18n {
    pub code: &'static str,
    lang: HashMap<String, String>,
    en: HashMap<String, String>,
}

fn parse(json: &str) -> HashMap<String, String> {
    serde_json::from_str(json).unwrap_or_default()
}

fn resolve(code: &str) -> &'static str {
    LANGS.iter().find(|l| l.0 == code).map(|l| l.0).unwrap_or("en")
}

/// Saved choice → build-time default → OS locale → English.
pub fn detect(saved: &str) -> &'static str {
    let wanted = if !saved.is_empty() {
        saved.to_string()
    } else if let Some(d) = option_env!("VITE_DEFAULT_LANG").filter(|d| !d.is_empty()) {
        d.to_string()
    } else {
        sys_locale::get_locale().unwrap_or_default()
    };
    resolve(wanted.get(..2).unwrap_or("en"))
}

impl I18n {
    pub fn new(code: &str) -> Self {
        let code = resolve(code);
        let en = parse(LANGS[0].2);
        let lang = if code == "en" { HashMap::new() } else { parse(LANGS.iter().find(|l| l.0 == code).unwrap().2) };
        Self { code, lang, en }
    }

    pub fn t<'a>(&'a self, key: &'a str) -> &'a str {
        if let Some(v) = self.lang.get(key).or_else(|| self.en.get(key)) {
            return v;
        }
        EXTRA.iter().find(|e| e.0 == key).map(|e| e.1).unwrap_or(key)
    }

    /// `t` with `{{name}}` substitutions.
    pub fn tf(&self, key: &str, vars: &[(&str, &str)]) -> String {
        let mut s = self.t(key).to_string();
        for (k, v) in vars {
            s = s.replace(&format!("{{{{{k}}}}}"), v);
        }
        s
    }
}
