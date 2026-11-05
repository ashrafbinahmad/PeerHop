//! State for one running server session, shared by HTTP handlers, WebSocket
//! connections and the desktop UI. A restart creates a fresh `Hub`.

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use serde_json::json;
use std::collections::HashSet;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Notify, broadcast};

use crate::store::{ClientStore, Status, Transaction, TxStore};

/// Which front-end the web page should render (`/api/meta` "app").
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Desktop app: unified chat-style page.
    Desktop,
    /// CLI sending one file.
    CliSend,
    /// CLI receiving uploads.
    CliReceive,
}

/// Values the web clients can observe; changed only by the desktop.
#[derive(Clone)]
pub struct Shared {
    pub text_transfer_enabled: bool,
    pub security_enabled: bool,
    pub theme_id: String,
    pub accent_id: String,
    pub is_dark: bool,
    pub desktop_name: String,
    pub download_dir: PathBuf,
}

/// Events the embedding app (GUI/CLI) may react to.
#[derive(Debug, Clone)]
pub enum HubEvent {
    /// Anything visible changed; repaint.
    Changed,
    /// A client finished uploading a file to us.
    FileReceived { name: String, size: u64 },
    /// A client finished downloading one of our files.
    ClientFinished { ip: String, name: String, size: u64 },
}

pub type Listener = Arc<dyn Fn(HubEvent) + Send + Sync>;

/// Serialized WebSocket message; `kind` lets blocked clients be filtered.
#[derive(Clone)]
pub struct WsMsg {
    pub kind: &'static str,
    pub json: Arc<str>,
}

pub struct Hub {
    pub mode: Mode,
    pub security_token: String,
    pub txs: Mutex<TxStore>,
    pub clients: Mutex<ClientStore>,
    shared: RwLock<Shared>,
    /// File served by `/api/download` (first file of the latest share).
    current_file: Mutex<Option<PathBuf>>,
    local_ips: RwLock<HashSet<IpAddr>>,
    tx: broadcast::Sender<WsMsg>,
    listener: RwLock<Option<Listener>>,
    closed: AtomicBool,
    closed_notify: Notify,
}

impl Hub {
    pub fn new(mode: Mode, shared: Shared) -> Arc<Self> {
        let (tx, _) = broadcast::channel(512);
        Arc::new(Self {
            mode,
            security_token: crate::util::random_token(),
            txs: Mutex::default(),
            clients: Mutex::default(),
            shared: RwLock::new(shared),
            current_file: Mutex::new(None),
            local_ips: RwLock::new(crate::net::local_ips()),
            tx,
            listener: RwLock::new(None),
            closed: AtomicBool::new(false),
            closed_notify: Notify::new(),
        })
    }

    pub fn set_listener(&self, l: Listener) {
        *self.listener.write() = Some(l);
    }

    pub fn emit(&self, ev: HubEvent) {
        let l = self.listener.read().clone();
        if let Some(l) = l {
            l(ev);
        }
    }

    pub fn shared(&self) -> Shared {
        self.shared.read().clone()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsMsg> {
        self.tx.subscribe()
    }

    // ---- lifecycle -------------------------------------------------------

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }

    pub async fn closed(&self) {
        let notified = self.closed_notify.notified();
        if self.is_closed() {
            return;
        }
        notified.await;
    }

    /// Stop every transfer and disconnect clients (server restart / exit).
    pub fn close(&self) {
        self.txs.lock().cancel_all_in_progress();
        self.broadcast_all_transactions("transactions_update");
        self.closed.store(true, Ordering::Release);
        self.closed_notify.notify_waiters();
    }

    // ---- client identity ------------------------------------------------

    pub fn refresh_local_ips(&self) {
        *self.local_ips.write() = crate::net::local_ips();
    }

    /// The desktop itself (or loopback) is never shown as a connected device.
    pub fn is_local(&self, ip: IpAddr) -> bool {
        ip.is_loopback() || ip == IpAddr::from([192, 168, 137, 1]) || self.local_ips.read().contains(&ip)
    }

    pub fn touch_client(&self, user_agent: &str, ip: IpAddr) {
        if self.is_local(ip) {
            return;
        }
        if self.clients.lock().touch(user_agent, ip) {
            self.broadcast_devices();
        }
    }

    // ---- broadcasting ---------------------------------------------------

    pub fn broadcast(&self, kind: &'static str, data: impl Serialize) {
        let json = json!({ "type": kind, "data": data }).to_string();
        let _ = self.tx.send(WsMsg { kind, json: json.into() });
        self.emit(HubEvent::Changed);
    }

    pub fn broadcast_txn(&self, id: u64) {
        let txn = self.txs.lock().get(id).cloned();
        if let Some(txn) = txn {
            self.broadcast("transaction_update", txn);
        }
    }

    pub fn broadcast_all_transactions(&self, kind: &'static str) {
        let all = self.txs.lock().all();
        self.broadcast(kind, json!({ "transactions": all }));
    }

    pub fn broadcast_devices(&self) {
        let clients = self.clients.lock().active();
        self.broadcast("devices_update", json!({ "clients": clients }));
    }

    /// Initial snapshot sent to a new WebSocket connection.
    pub fn init_messages(&self) -> Vec<WsMsg> {
        let s = self.shared();
        let msg = |kind: &'static str, data: serde_json::Value| WsMsg {
            kind,
            json: json!({ "type": kind, "data": data }).to_string().into(),
        };
        vec![
            msg("transactions_init", json!({ "transactions": self.txs.lock().all() })),
            msg("devices_init", json!({ "clients": self.clients.lock().active() })),
            msg("desktop_name_init", json!({ "name": s.desktop_name })),
            msg("settings_init", json!({ "textTransferEnabled": s.text_transfer_enabled })),
            msg("theme_init", json!({ "themeId": s.theme_id, "accentId": s.accent_id, "isDarkMode": s.is_dark })),
        ]
    }

    // ---- desktop actions --------------------------------------------------

    pub fn current_file(&self) -> Option<PathBuf> {
        self.current_file.lock().clone()
    }

    /// Offer files for download. Returns the new transaction ids.
    pub fn offer_files(&self, files: &[(PathBuf, u64)]) -> Vec<u64> {
        let ids: Vec<u64> = {
            let mut txs = self.txs.lock();
            files.iter().map(|(p, size)| txs.add(Transaction::outgoing_file(p, *size))).collect()
        };
        if let Some((first, _)) = files.first() {
            *self.current_file.lock() = Some(first.clone());
        }
        for id in &ids {
            self.broadcast_txn(*id);
        }
        ids
    }

    pub fn send_text(&self, sender_id: &str, client_ip: &str, text: String) -> u64 {
        let id = self.txs.lock().add(Transaction::text(sender_id, client_ip, text));
        self.broadcast_txn(id);
        id
    }

    /// Remove a transaction, optionally deleting its file from disk.
    pub fn delete_transaction(&self, id: u64, delete_file: bool) -> bool {
        let Some(txn) = self.txs.lock().delete(id) else { return false };
        if delete_file {
            if let Some(path) = txn.local_path() {
                match std::fs::remove_file(&path) {
                    Ok(()) => crate::log_info!("Deleted file from disk: {}", path.display()),
                    Err(e) => crate::log_warn!("Failed to delete {}: {e}", path.display()),
                }
            }
        }
        self.broadcast("transaction_deleted", json!({ "id": id }));
        true
    }

    pub fn cancel_transaction(&self, id: u64) -> bool {
        let ok = self.txs.lock().cancel(id);
        if ok {
            self.broadcast_txn(id);
        }
        ok
    }

    pub fn cancel_client_download(&self, id: u64, ip: &str) -> bool {
        let ok = self.txs.lock().cancel_client_download(id, ip);
        if ok {
            self.broadcast_txn(id);
        }
        ok
    }

    pub fn rename_client(&self, ip: &str, name: &str) -> bool {
        let ok = self.clients.lock().rename(ip, name);
        if ok {
            self.broadcast_devices();
        }
        ok
    }

    pub fn set_client_blocked(&self, ip: &str, blocked: bool) -> bool {
        if !self.clients.lock().set_blocked(ip, blocked) {
            return false;
        }
        if blocked {
            self.txs.lock().cancel_client_transactions(ip);
            self.broadcast_all_transactions("transactions_update");
        }
        self.broadcast_devices();
        true
    }

    pub fn set_client_sending_blocked(&self, ip: &str, blocked: bool) -> bool {
        if !self.clients.lock().set_sending_blocked(ip, blocked) {
            return false;
        }
        if blocked {
            self.txs.lock().cancel_uploads_from(ip);
            self.broadcast_all_transactions("transactions_update");
        }
        self.broadcast_devices();
        true
    }

    pub fn set_desktop_name(&self, name: &str) {
        self.shared.write().desktop_name = name.into();
        self.broadcast("desktop_name_update", json!({ "name": name }));
    }

    pub fn set_text_transfer(&self, enabled: bool) {
        self.shared.write().text_transfer_enabled = enabled;
        self.broadcast("settings_update", json!({ "textTransferEnabled": enabled }));
    }

    pub fn set_security(&self, enabled: bool) {
        self.shared.write().security_enabled = enabled;
        self.broadcast("security_update", json!({ "securityEnabled": enabled }));
    }

    pub fn set_theme(&self, theme_id: &str, accent_id: &str, is_dark: bool) {
        {
            let mut s = self.shared.write();
            s.theme_id = theme_id.into();
            s.accent_id = accent_id.into();
            s.is_dark = is_dark;
        }
        self.broadcast("theme_update", json!({ "themeId": theme_id, "accentId": accent_id, "isDarkMode": is_dark }));
    }

    pub fn set_download_dir(&self, dir: &Path) {
        self.shared.write().download_dir = dir.to_path_buf();
    }

    /// Mark a transfer as failed/cancelled and broadcast it.
    pub fn end_transfer(&self, id: u64, status: Status) {
        self.txs.lock().set_status(id, status);
        self.broadcast_txn(id);
    }
}
