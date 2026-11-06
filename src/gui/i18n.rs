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
    ("web_title", "Nearby"),
    ("web_visible", "Visible to nearby devices"),
    ("web_visible_hint", "PeerHop on other computers and browsers on web.peerhop.in on this network can find this PC and ask to send files"),
    ("web_empty", "Open PeerHop or web.peerhop.in on another device on this network"),
    ("web_offline", "Can't reach the nearby-devices service"),
    ("web_connecting", "Connecting…"),
    ("web_device", "Nearby device"),
    ("web_offer", "{{name}} wants to send {{what}}"),
    ("web_files", "{{n}} files"),
    ("accept", "Accept"),
    ("decline", "Decline"),
    ("send_files", "Send files"),
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
    ("public_title", "Public QR"),
    ("you", "You"),
    ("show_qr", "Show QR code"),
    ("link_qr_hint", "Scan with a phone on any network to open it"),
    ("usage_stats", "Share usage stats"),
    ("source_code", "Source code"),
    ("open_source_licenses", "Open-source licenses"),
    ("usage_stats_hint", "Anonymous counts per country: installs, and the number and total size of file transfers. No files, names or addresses"),
    ("waiting_devices", "Waiting for devices"),
    ("devices_count", "{{n}} devices"),
    ("direct_encrypted", "Direct · encrypted"),
    ("direct_encrypted_hint", "Files go straight between the two devices over an encrypted connection"),
    ("in_use", "In use"),
    ("use_this", "Use this network"),
    ("web_card_hint", "Any network · no QR needed"),
    ("web_card_visible", "Visible"),
    ("web_card_hidden", "Hidden"),
    ("web_card_show", "Click to become visible"),
    ("web_card_hide", "Click to hide"),
    ("minimize", "Minimize"),
    ("maximize", "Maximize"),
    ("restore", "Restore down"),
    ("wants_to_send", "Wants to send you files"),
    ("network_title", "Ways to connect"),
    ("public_hint", "Phones and browsers that scan the QR code"),
    ("public_connect_title", "Scan to connect"),
    ("public_connect_hint", "Scan with your phone, or open the link in a browser"),
    ("devices_n", "{{n}} devices connected"),
    ("members_n", "{{n}} devices · {{m}} online"),
    ("online", "online"),
    ("offline", "offline"),
    ("peer_offline", "Offline — open PeerHop on that device to send"),
    ("say_hello", "Send something"),
    ("message", "Message"),
    ("send_folder", "Send folder"),
    ("today", "Today"),
    ("yesterday", "Yesterday"),
    ("transferring", "transferring"),
    ("left", "{{t}} left"),
    ("waiting_accept", "Waiting to accept"),
    ("copy_path", "Copy path"),
    ("info", "Info"),
    ("close", "Close"),
    ("new_group", "Multi-send"),
    ("new_group_hint", "Pick several devices to send the same files to all of them at once. Kept until PeerHop closes."),
    ("pick_members", "Send to"),
    ("members", "Devices"),
    ("no_members", "No devices left"),
    ("add_members", "Add devices"),
    ("create", "Start multi-send"),
    ("delete_group", "Remove multi-send"),
    ("save_contact", "Save"),
    ("save_hint", "Keep this PC in the sidebar, even while it is offline"),
    ("saved", "Saved"),
    ("unsave", "Remove from saved"),
    ("web_visible_on", "Visible to nearby devices"),
    ("web_visible_off", "Hidden from nearby devices"),
    ("this_session", "This session"),
    ("total_size", "Total size"),
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
