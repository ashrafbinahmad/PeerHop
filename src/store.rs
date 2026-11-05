//! Transaction and client bookkeeping. Pure data structures; callers hold the lock.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::{Duration, Instant};

pub const SERVER_SENDER: &str = "server";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    File,
    Text,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    #[default]
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl Status {
    pub fn is_finished(self) -> bool {
        matches!(self, Status::Completed | Status::Failed | Status::Cancelled)
    }
}

fn is_zero(v: &u64) -> bool {
    *v == 0
}

/// One file or text transfer. Serialized shape is the wire format the mobile UI expects.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: u64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub client_ip: String,
    #[serde(rename = "type")]
    pub kind: Kind,
    /// `"server"` for desktop-originated transfers, otherwise the client IP.
    pub sender_id: String,
    pub transaction_percent: f64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub download_link: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub upload_link: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub saved_in_location: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub filename: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub file_size: u64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub server_file_path: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub text_content: String,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "is_zero")]
    pub bytes_transferred: u64,
    pub status: Status,

    /// Per-client download progress for desktop-originated files (keyed by client IP).
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub client_progress: BTreeMap<String, f64>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub client_status: BTreeMap<String, Status>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub client_bytes: BTreeMap<String, u64>,
    #[serde(skip)]
    client_ranges: HashMap<String, Vec<(u64, u64)>>,
}

impl Transaction {
    fn new(kind: Kind, sender_id: impl Into<String>) -> Self {
        Self {
            id: 0,
            client_ip: String::new(),
            kind,
            sender_id: sender_id.into(),
            transaction_percent: 0.0,
            download_link: String::new(),
            upload_link: String::new(),
            saved_in_location: String::new(),
            filename: String::new(),
            file_size: 0,
            server_file_path: String::new(),
            text_content: String::new(),
            timestamp: Utc::now(),
            bytes_transferred: 0,
            status: Status::Pending,
            client_progress: BTreeMap::new(),
            client_status: BTreeMap::new(),
            client_bytes: BTreeMap::new(),
            client_ranges: HashMap::new(),
        }
    }

    /// A file the desktop offers for download.
    pub fn outgoing_file(path: &std::path::Path, size: u64) -> Self {
        let mut t = Self::new(Kind::File, SERVER_SENDER);
        t.filename = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        t.file_size = size;
        t.server_file_path = path.to_string_lossy().into_owned();
        t
    }

    /// A file a client is uploading to the desktop.
    pub fn incoming_file(client_ip: &str, filename: &str, size: u64, saved_at: &std::path::Path) -> Self {
        let mut t = Self::new(Kind::File, client_ip);
        let saved = saved_at.to_string_lossy().into_owned();
        t.client_ip = client_ip.into();
        t.filename = filename.into();
        t.file_size = size;
        t.upload_link = "/api/upload".into();
        t.saved_in_location = saved.clone();
        t.server_file_path = saved;
        t.status = Status::InProgress;
        t
    }

    pub fn text(sender_id: &str, client_ip: &str, text: String) -> Self {
        let mut t = Self::new(Kind::Text, sender_id);
        t.client_ip = client_ip.into();
        t.text_content = text;
        t.status = Status::Completed;
        t
    }

    pub fn is_outgoing(&self) -> bool {
        self.sender_id == SERVER_SENDER
    }

    /// Path on this machine (sent source, or received destination).
    pub fn local_path(&self) -> Option<PathBuf> {
        let p = if !self.server_file_path.is_empty() { &self.server_file_path } else { &self.saved_in_location };
        (!p.is_empty()).then(|| PathBuf::from(p))
    }
}

/// Outcome of a progress update, so callers know when to notify.
#[derive(Debug, PartialEq, Eq)]
pub enum Progress {
    Ignored,
    Updated,
    /// This update moved the client to `completed`.
    ClientCompleted,
}

#[derive(Default)]
pub struct TxStore {
    txs: BTreeMap<u64, Transaction>,
    next_id: u64,
    /// Global cancellation flags, kept briefly so in-flight streams observe them.
    cancelled: HashMap<u64, Instant>,
    /// Per-client download cancellation, kept briefly to defeat browser auto-retry.
    client_cancelled: HashMap<(u64, String), Instant>,
}

const CANCEL_TTL: Duration = Duration::from_secs(1);
const CLIENT_CANCEL_TTL: Duration = Duration::from_secs(2);

impl TxStore {
    pub fn add(&mut self, mut txn: Transaction) -> u64 {
        self.next_id += 1;
        txn.id = self.next_id;
        txn.timestamp = Utc::now();
        if txn.kind == Kind::File {
            txn.download_link = format!("/api/download-file/{}", txn.id);
        }
        self.txs.insert(txn.id, txn);
        self.next_id
    }

    pub fn get(&self, id: u64) -> Option<&Transaction> {
        self.txs.get(&id)
    }

    /// All transactions, oldest first.
    pub fn all(&self) -> Vec<Transaction> {
        self.txs.values().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.txs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.txs.is_empty()
    }

    pub fn delete(&mut self, id: u64) -> Option<Transaction> {
        self.txs.remove(&id)
    }

    pub fn latest_outgoing_by_name(&self, filename: &str) -> Option<u64> {
        self.txs
            .values()
            .rev()
            .find(|t| t.kind == Kind::File && t.is_outgoing() && t.filename == filename)
            .map(|t| t.id)
    }

    fn purge_expired(&mut self) {
        let now = Instant::now();
        self.cancelled.retain(|_, at| now.duration_since(*at) < CANCEL_TTL);
        self.client_cancelled.retain(|_, at| now.duration_since(*at) < CLIENT_CANCEL_TTL);
    }

    pub fn is_cancelled(&mut self, id: u64) -> bool {
        self.purge_expired();
        self.cancelled.contains_key(&id) || self.txs.get(&id).is_some_and(|t| t.status == Status::Cancelled)
    }

    pub fn is_client_cancelled(&mut self, id: u64, ip: &str) -> bool {
        self.purge_expired();
        self.client_cancelled.contains_key(&(id, ip.to_string()))
    }

    /// Upload-style progress (single stream). Marks completed at 100%.
    pub fn update_progress(&mut self, id: u64, bytes: u64, total: u64) {
        let cancelled = self.is_cancelled(id);
        let Some(t) = self.txs.get_mut(&id) else { return };
        if cancelled || t.status == Status::Cancelled {
            return;
        }
        t.bytes_transferred = bytes;
        if total > 0 {
            t.transaction_percent = (bytes as f64 / total as f64 * 100.0).min(100.0);
            t.status = if bytes >= total { Status::Completed } else { Status::InProgress };
        }
    }

    /// Download progress for one client, tracked as merged byte ranges so parallel
    /// range requests (Android browsers) add up instead of overwriting each other.
    pub fn record_client_range(&mut self, id: u64, ip: &str, start: u64, end_inclusive: u64, total: u64) -> Progress {
        let blocked = self.is_cancelled(id) || self.is_client_cancelled(id, ip);
        let Some(t) = self.txs.get_mut(&id) else { return Progress::Ignored };
        if blocked || t.status == Status::Cancelled || total == 0 {
            return Progress::Ignored;
        }
        let ranges = t.client_ranges.entry(ip.to_string()).or_default();
        merge_range(ranges, (start, end_inclusive.min(total - 1)));
        let downloaded: u64 = ranges.iter().map(|(s, e)| e - s + 1).sum();

        let was_completed = t.client_status.get(ip) == Some(&Status::Completed);
        let pct = (downloaded as f64 / total as f64 * 100.0).min(100.0);
        let status = if downloaded >= total { Status::Completed } else { Status::InProgress };
        t.client_bytes.insert(ip.into(), downloaded);
        t.client_progress.insert(ip.into(), pct);
        t.client_status.insert(ip.into(), status);
        if status == Status::Completed && !was_completed { Progress::ClientCompleted } else { Progress::Updated }
    }

    pub fn set_status(&mut self, id: u64, status: Status) {
        if let Some(t) = self.txs.get_mut(&id) {
            t.status = status;
        }
    }

    pub fn finish_upload(&mut self, id: u64, written: u64) {
        if let Some(t) = self.txs.get_mut(&id) {
            t.bytes_transferred = written;
            t.file_size = written;
            t.transaction_percent = 100.0;
            t.status = Status::Completed;
        }
    }

    /// Cancel a whole transaction (e.g. the desktop stopping an incoming upload).
    pub fn cancel(&mut self, id: u64) -> bool {
        let Some(t) = self.txs.get_mut(&id) else { return false };
        t.status = Status::Cancelled;
        self.cancelled.insert(id, Instant::now());
        true
    }

    /// Stop one client's download of a desktop file and reset its progress.
    pub fn cancel_client_download(&mut self, id: u64, ip: &str) -> bool {
        let Some(t) = self.txs.get_mut(&id) else { return false };
        t.client_progress.insert(ip.into(), 0.0);
        t.client_status.insert(ip.into(), Status::Cancelled);
        t.client_bytes.insert(ip.into(), 0);
        t.client_ranges.remove(ip);
        self.client_cancelled.insert((id, ip.into()), Instant::now());
        true
    }

    pub fn cancel_all_in_progress(&mut self) {
        let now = Instant::now();
        for (id, t) in self.txs.iter_mut() {
            if !t.status.is_finished() {
                t.status = Status::Cancelled;
                self.cancelled.insert(*id, now);
            }
            for st in t.client_status.values_mut() {
                if !st.is_finished() {
                    *st = Status::Cancelled;
                }
            }
        }
    }

    /// Cancel every active upload from / download to `ip` (used when blocking a device).
    pub fn cancel_client_transactions(&mut self, ip: &str) {
        let now = Instant::now();
        for (id, t) in self.txs.iter_mut() {
            if let Some(st) = t.client_status.get_mut(ip) {
                if !st.is_finished() {
                    *st = Status::Cancelled;
                    self.client_cancelled.insert((*id, ip.into()), now);
                }
            }
            if !t.status.is_finished() && (t.sender_id == ip || t.client_ip == ip) {
                t.status = Status::Cancelled;
                self.cancelled.insert(*id, now);
            }
        }
    }

    /// Cancel uploads currently coming from `ip` (used when restricting sending).
    pub fn cancel_uploads_from(&mut self, ip: &str) {
        let ids: Vec<u64> = self
            .txs
            .values()
            .filter(|t| t.sender_id == ip && t.status == Status::InProgress)
            .map(|t| t.id)
            .collect();
        for id in ids {
            self.cancel(id);
        }
    }
}

/// Insert an inclusive range into a sorted, non-overlapping list, merging neighbours.
fn merge_range(ranges: &mut Vec<(u64, u64)>, new: (u64, u64)) {
    ranges.push(new);
    ranges.sort_unstable();
    let mut merged: Vec<(u64, u64)> = Vec::with_capacity(ranges.len());
    for &(s, e) in ranges.iter() {
        match merged.last_mut() {
            Some(last) if s <= last.1.saturating_add(1) => last.1 = last.1.max(e),
            _ => merged.push((s, e)),
        }
    }
    *ranges = merged;
}

// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub name: String,
    pub user_agent: String,
    pub ip: String,
    pub last_seen: DateTime<Utc>,
    pub platform: String,
    pub blocked: bool,
    pub sending_blocked: bool,
    #[serde(skip)]
    first_seen: Instant,
}

#[derive(Default)]
pub struct ClientStore {
    clients: HashMap<String, Client>,
    blocked: HashSet<String>,
    sending_blocked: HashSet<String>,
}

const CLIENT_ACTIVE_WINDOW: chrono::TimeDelta = chrono::TimeDelta::minutes(5);

pub fn parse_platform(user_agent: &str) -> &'static str {
    let ua = user_agent.to_lowercase();
    if ua.contains("android") {
        "android"
    } else if ua.contains("iphone") || ua.contains("ipad") || ua.contains("ipod") || ua.contains("macintosh") || ua.contains("mac os") {
        "iOS"
    } else if ua.contains("linux") {
        "linux"
    } else if ua.contains("windows") {
        "windows"
    } else {
        "unknown"
    }
}

impl ClientStore {
    /// Record activity from a device. Returns `true` if it was not active before.
    pub fn touch(&mut self, user_agent: &str, ip: IpAddr) -> bool {
        let ip = ip.to_string();
        let now = Utc::now();
        let platform = parse_platform(user_agent).to_string();
        let blocked = self.blocked.contains(&ip);
        let sending_blocked = self.sending_blocked.contains(&ip);
        match self.clients.get_mut(&ip) {
            Some(c) => {
                let was_active = now - c.last_seen < CLIENT_ACTIVE_WINDOW;
                c.last_seen = now;
                if !user_agent.is_empty() {
                    c.user_agent = user_agent.into();
                    c.platform = platform;
                }
                !was_active
            }
            None => {
                self.clients.insert(
                    ip.clone(),
                    Client {
                        name: platform.clone(),
                        user_agent: user_agent.into(),
                        ip,
                        last_seen: now,
                        platform,
                        blocked,
                        sending_blocked,
                        first_seen: Instant::now(),
                    },
                );
                true
            }
        }
    }

    /// Devices seen in the last five minutes, in order of first connection.
    pub fn active(&self) -> Vec<Client> {
        let cutoff = Utc::now() - CLIENT_ACTIVE_WINDOW;
        let mut v: Vec<Client> = self.clients.values().filter(|c| c.last_seen > cutoff).cloned().collect();
        v.sort_by_key(|c| c.first_seen);
        v
    }

    pub fn get(&self, ip: &str) -> Option<&Client> {
        self.clients.get(ip)
    }

    pub fn rename(&mut self, ip: &str, name: &str) -> bool {
        self.clients.get_mut(ip).map(|c| c.name = name.into()).is_some()
    }

    pub fn set_blocked(&mut self, ip: &str, blocked: bool) -> bool {
        let Some(c) = self.clients.get_mut(ip) else { return false };
        c.blocked = blocked;
        if blocked { self.blocked.insert(ip.into()) } else { self.blocked.remove(ip) };
        true
    }

    pub fn set_sending_blocked(&mut self, ip: &str, blocked: bool) -> bool {
        let Some(c) = self.clients.get_mut(ip) else { return false };
        c.sending_blocked = blocked;
        if blocked { self.sending_blocked.insert(ip.into()) } else { self.sending_blocked.remove(ip) };
        true
    }

    pub fn is_blocked(&self, ip: &str) -> bool {
        self.blocked.contains(ip)
    }

    pub fn is_sending_blocked(&self, ip: &str) -> bool {
        self.blocked.contains(ip) || self.sending_blocked.contains(ip)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_parallel_ranges() {
        let mut r = vec![];
        merge_range(&mut r, (100, 199));
        merge_range(&mut r, (0, 49));
        assert_eq!(r, vec![(0, 49), (100, 199)]);
        merge_range(&mut r, (50, 99));
        assert_eq!(r, vec![(0, 199)]);
        merge_range(&mut r, (10, 20));
        assert_eq!(r, vec![(0, 199)]);
    }

    #[test]
    fn client_completion_reported_once() {
        let mut s = TxStore::default();
        let id = s.add(Transaction::outgoing_file(std::path::Path::new("a.bin"), 100));
        assert_eq!(s.record_client_range(id, "1.2.3.4", 0, 49, 100), Progress::Updated);
        assert_eq!(s.record_client_range(id, "1.2.3.4", 50, 99, 100), Progress::ClientCompleted);
        assert_eq!(s.record_client_range(id, "1.2.3.4", 0, 99, 100), Progress::Updated);
        let t = s.get(id).unwrap();
        assert_eq!(t.client_bytes["1.2.3.4"], 100);
        assert_eq!(t.download_link, format!("/api/download-file/{id}"));
    }

    #[test]
    fn client_cancel_blocks_progress() {
        let mut s = TxStore::default();
        let id = s.add(Transaction::outgoing_file(std::path::Path::new("a.bin"), 100));
        s.cancel_client_download(id, "ip");
        assert!(s.is_client_cancelled(id, "ip"));
        assert_eq!(s.record_client_range(id, "ip", 0, 10, 100), Progress::Ignored);
    }

    #[test]
    fn serializes_wire_format() {
        let mut s = TxStore::default();
        let id = s.add(Transaction::text("server", "", "hi".into()));
        let v = serde_json::to_value(s.get(id).unwrap()).unwrap();
        assert_eq!(v["type"], "text");
        assert_eq!(v["senderId"], "server");
        assert_eq!(v["status"], "completed");
        assert_eq!(v["textContent"], "hi");
        assert!(v.get("fileSize").is_none());
        assert!(v.get("clientRanges").is_none());
    }
}
