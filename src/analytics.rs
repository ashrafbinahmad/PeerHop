//! Anonymous usage counters, aggregated per country in the PeerHop Firebase
//! Realtime Database (the same one the landing site uses):
//!
//! ```text
//! countryStats/<country code>/downloads   installs (counted once per install)
//!                            /transfers   completed file transfers
//!                            /bytes       total size of those transfers
//! ```
//!
//! Nothing identifying is sent: the country comes from ipinfo.io and only the
//! three counters above are incremented (server-side, so concurrent installs
//! don't overwrite each other). Transfers are batched and flushed every minute
//! and on exit. Users can turn it off in Settings ("Share usage stats").
//!
//! Forks: point `DB` at your own Firebase project (rules in
//! `firebase/database.rules.json`), or your users get counted as PeerHop's.

use std::path::PathBuf;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::time::{Duration, Instant};

const DB: &str = "https://peerhop-users-default-rtdb.firebaseio.com/countryStats";
const GEO: &str = "https://ipinfo.io/json";
const FLUSH_EVERY: Duration = Duration::from_secs(60);
/// Country lookup retry interval while offline.
const GEO_RETRY: Duration = Duration::from_secs(300);

enum Event {
    Transfer(u64),
    Enabled(bool),
    /// Flush now; the sender is signalled when done.
    Flush(Sender<()>),
}

pub struct Analytics {
    tx: Sender<Event>,
}

impl Analytics {
    pub fn start(enabled: bool) -> Self {
        let (tx, rx) = channel();
        std::thread::Builder::new().name("analytics".into()).spawn(move || run(rx, enabled)).ok();
        Self { tx }
    }

    /// Turning it off drops anything not yet sent.
    pub fn set_enabled(&self, on: bool) {
        let _ = self.tx.send(Event::Enabled(on));
    }

    /// One completed file transfer (either direction) of `bytes`.
    pub fn transfer(&self, bytes: u64) {
        let _ = self.tx.send(Event::Transfer(bytes));
    }

    /// Sends what's pending, waiting at most `timeout` (used on exit).
    pub fn flush(&self, timeout: Duration) {
        let (done, wait) = channel();
        if self.tx.send(Event::Flush(done)).is_ok() {
            let _ = wait.recv_timeout(timeout);
        }
    }
}

#[derive(Default)]
struct Pending {
    downloads: u64,
    transfers: u64,
    bytes: u64,
}

impl Pending {
    fn is_empty(&self) -> bool {
        self.downloads == 0 && self.transfers == 0
    }
}

fn run(rx: Receiver<Event>, mut enabled: bool) {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(10))).build().into();
    let marker = install_marker();
    let new_install = || Pending { downloads: u64::from(!marker.exists()), ..Default::default() };
    let mut pending = if enabled { new_install() } else { Pending::default() };
    let mut country: Option<String> = None;
    let mut geo_at: Option<Instant> = None;
    // First flush shortly after start, so a new install is counted even on a short session.
    let mut last_flush = Instant::now().checked_sub(FLUSH_EVERY - Duration::from_secs(5)).unwrap_or_else(Instant::now);

    loop {
        let wait = FLUSH_EVERY.saturating_sub(last_flush.elapsed());
        let (event, closed) = match rx.recv_timeout(wait) {
            Ok(e) => (Some(e), false),
            Err(RecvTimeoutError::Timeout) => (None, false),
            Err(RecvTimeoutError::Disconnected) => (None, true),
        };
        let mut done = None;
        match event {
            Some(Event::Enabled(on)) => {
                enabled = on;
                pending = if on { new_install() } else { Pending::default() };
                continue;
            }
            Some(Event::Transfer(_)) if !enabled => continue,
            Some(Event::Transfer(bytes)) => {
                pending.transfers += 1;
                pending.bytes += bytes;
                if last_flush.elapsed() < FLUSH_EVERY {
                    continue;
                }
            }
            Some(Event::Flush(d)) => done = Some(d),
            None => {}
        }

        if !pending.is_empty() {
            if country.is_none() && geo_at.is_none_or(|t| t.elapsed() >= GEO_RETRY || done.is_some()) {
                geo_at = Some(Instant::now());
                country = lookup_country(&agent);
            }
            if let Some(cc) = &country {
                if send(&agent, cc, &pending) {
                    if pending.downloads > 0 {
                        mark_installed(&marker);
                    }
                    pending = Pending::default();
                }
            }
        }
        last_flush = Instant::now();
        if let Some(d) = done {
            let _ = d.send(());
        }
        if closed {
            return;
        }
    }
}

/// Two-letter country code, or "Unknown" when the service answers without one.
fn lookup_country(agent: &ureq::Agent) -> Option<String> {
    let body: serde_json::Value = agent.get(GEO).call().ok()?.body_mut().read_json().ok()?;
    let cc = body.get("country").and_then(|c| c.as_str()).unwrap_or("");
    Some(sanitize_key(cc))
}

/// Firebase keys can't contain `. $ # [ ] /`; country codes are plain letters.
fn sanitize_key(cc: &str) -> String {
    let cc: String = cc.trim().chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_uppercase();
    if cc.is_empty() { "Unknown".into() } else { cc }
}

fn send(agent: &ureq::Agent, cc: &str, p: &Pending) -> bool {
    let inc = |n: u64| serde_json::json!({ ".sv": { "increment": n } });
    let mut body = serde_json::Map::new();
    if p.downloads > 0 {
        body.insert("downloads".into(), inc(p.downloads));
    }
    if p.transfers > 0 {
        body.insert("transfers".into(), inc(p.transfers));
        body.insert("bytes".into(), inc(p.bytes));
    }
    let url = format!("{DB}/{cc}.json");
    match agent.patch(&url).send_json(serde_json::Value::Object(body)) {
        Ok(_) => true,
        Err(e) => {
            crate::util::log("WARN", format_args!("analytics: {e}"));
            false
        }
    }
}

/// Present once this install has been counted as a download.
fn install_marker() -> PathBuf {
    crate::settings::app_data_dir().join("counted")
}

fn mark_installed(path: &PathBuf) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, crate::APP_VERSION);
}

#[cfg(test)]
mod tests {
    #[test]
    fn country_keys_are_safe() {
        assert_eq!(super::sanitize_key("in"), "IN");
        assert_eq!(super::sanitize_key(""), "Unknown");
        assert_eq!(super::sanitize_key("a.b/$"), "AB");
    }
}
