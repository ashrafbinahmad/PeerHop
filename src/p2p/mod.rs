//! web.peerhop.in interop: find browsers on this network and transfer files with
//! them over direct WebRTC data channels.
//!
//! - Rendezvous: signed ephemeral Nostr events on public relays, scoped to a room
//!   derived from the network (same room id as the web app), sealed with AES-GCM.
//! - Listing is passive (subscribe only). Announcing presence and accepting
//!   incoming connections happen only while "visible" is on.
//! - Every incoming transfer needs an explicit accept on this desktop.
//!
//! Wire format: see `PROTOCOL.md` in the PeerHop-web repository.

mod crypto;
mod nostr;
mod rtc;
mod session;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::hub::Hub;
use crate::store::Status;
use crypto::RoomKeys;
use nostr::{Event, Keys, Pool};
use session::{Cmd, OutFile, Report, Role};

pub use session::FileMeta;

const ROOM_API: &str = "https://web.peerhop.in/api/room";
const PRESENCE_EVERY: Duration = Duration::from_secs(8);
const PEER_TTL: Duration = Duration::from_secs(25);
const ROOM_RECHECK: Duration = Duration::from_secs(300);
const MAX_EVENT_SKEW: i64 = 120;

/// Store/UI key for a web peer (keeps them apart from LAN client IPs).
pub fn peer_key(peer: &str) -> String {
    format!("web:{peer}")
}

/// The peer id behind a store key, if it is a web peer.
pub fn peer_of(key: &str) -> Option<&str> {
    key.strip_prefix("web:")
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Device {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub label: String,
    /// Set by the PeerHop desktop app (absent for browsers on web.peerhop.in).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub app: bool,
}

impl Device {
    /// Coarse kind for icons: "peerhop" (desktop app), or the browser's "phone"/"tablet"/"desktop".
    pub fn icon_kind(&self) -> &'static str {
        match self.kind.as_str() {
            _ if self.app => "peerhop",
            "phone" => "phone",
            "tablet" => "tablet",
            _ => "web",
        }
    }
}

#[derive(Clone, Debug)]
pub struct WebPeer {
    pub id: String,
    pub name: String,
    pub device: Device,
    seen: Instant,
}

#[derive(Clone, Debug)]
pub struct Prompt {
    pub peer: String,
    pub name: String,
    pub job: u32,
    pub files: Vec<FileMeta>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum LinkStatus {
    #[default]
    Starting,
    /// Couldn't reach web.peerhop.in to learn the room (offline?).
    NoRoom,
    Connecting,
    Online,
}

#[derive(Default)]
struct State {
    status: LinkStatus,
    peers: HashMap<String, WebPeer>,
    prompts: Vec<Prompt>,
    visible: bool,
    name: String,
}

pub struct Shared {
    state: Mutex<State>,
    hub: RwLock<Arc<Hub>>,
    notify: Box<dyn Fn() + Send + Sync>,
}

impl Shared {
    pub(crate) fn hub(&self) -> Arc<Hub> {
        self.hub.read().clone()
    }

    pub(crate) fn notify(&self) {
        (self.notify)()
    }

    pub(crate) fn profile(&self) -> (String, Device) {
        (self.state.lock().name.clone(), this_device())
    }
}

fn this_device() -> Device {
    let os = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    };
    Device { kind: "desktop".into(), label: format!("{os} · PeerHop"), app: true }
}

enum Ctrl {
    Visible(bool),
    SendFiles { peer: String, files: Vec<OutFile> },
    SendText { peer: String, text: String },
    Respond { peer: String, job: u32, accept: bool },
}

/// Handle owned by the GUI. Dropping it stops everything.
pub struct WebLink {
    shared: Arc<Shared>,
    ctrl: mpsc::UnboundedSender<Ctrl>,
    task: tokio::task::JoinHandle<()>,
}

impl WebLink {
    pub fn start(rt: &tokio::runtime::Runtime, hub: Arc<Hub>, name: String, visible: bool, notify: impl Fn() + Send + Sync + 'static) -> Self {
        let shared = Arc::new(Shared {
            state: Mutex::new(State { visible, name, ..Default::default() }),
            hub: RwLock::new(hub),
            notify: Box::new(notify),
        });
        let (ctrl, rx) = mpsc::unbounded_channel();
        let task = rt.spawn(run(shared.clone(), rx));
        Self { shared, ctrl, task }
    }

    /// The server restarted with a fresh hub; future transfers go there.
    pub fn set_hub(&self, hub: Arc<Hub>) {
        *self.shared.hub.write() = hub;
    }

    pub fn set_name(&self, name: &str) {
        self.shared.state.lock().name = name.to_string();
    }

    pub fn set_visible(&self, visible: bool) {
        let _ = self.ctrl.send(Ctrl::Visible(visible));
    }

    pub fn status(&self) -> LinkStatus {
        self.shared.state.lock().status
    }

    /// Peers seen recently, sorted by name.
    pub fn peers(&self) -> Vec<WebPeer> {
        let mut v: Vec<WebPeer> = self.shared.state.lock().peers.values().cloned().collect();
        v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
        v
    }

    pub fn peer_name(&self, id: &str) -> Option<String> {
        self.shared.state.lock().peers.get(id).map(|p| p.name.clone())
    }

    pub fn peer_device(&self, id: &str) -> Option<Device> {
        self.shared.state.lock().peers.get(id).map(|p| p.device.clone())
    }

    /// Incoming offers waiting for accept/decline (oldest first).
    pub fn prompts(&self) -> Vec<Prompt> {
        self.shared.state.lock().prompts.clone()
    }

    pub fn respond(&self, peer: &str, job: u32, accept: bool) {
        self.shared.state.lock().prompts.retain(|p| !(p.peer == peer && p.job == job));
        let _ = self.ctrl.send(Ctrl::Respond { peer: peer.into(), job, accept });
    }

    /// Queues files for one or more peers; they show in the chat right away as
    /// waiting. One transaction per file carries every peer's progress, filed
    /// under the conversation `conv` (a peer key or a group key).
    pub fn send_files(&self, peers: &[String], conv: &str, files: Vec<(PathBuf, u64)>) {
        let hub = self.shared.hub();
        let keys: Vec<String> = peers.iter().map(|p| peer_key(p)).collect();
        let made: Vec<(PathBuf, String, u64, u64)> = files
            .into_iter()
            .map(|(path, size)| {
                let tx = hub.web_outgoing(&path, size, &keys, conv);
                let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
                (path, name, size, tx)
            })
            .collect();
        for peer in peers {
            let files = made.iter().map(|(path, name, size, tx)| OutFile { path: path.clone(), name: name.clone(), size: *size, tx: *tx }).collect();
            let _ = self.ctrl.send(Ctrl::SendFiles { peer: peer.clone(), files });
        }
    }

    pub fn send_text(&self, peers: &[String], conv: &str, text: String) {
        self.shared.hub().web_text(conv, text.clone(), true);
        for peer in peers {
            let _ = self.ctrl.send(Ctrl::SendText { peer: peer.clone(), text: text.clone() });
        }
    }
}

impl Drop for WebLink {
    fn drop(&mut self) {
        self.task.abort();
    }
}

// ---- signaling messages ---------------------------------------------------------

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Signal {
    Presence { name: String, device: Device },
    Bye,
    Sdp { to: String, sid: String, kind: String, sdp: String },
}

struct Room {
    keys: RoomKeys,
    me: Keys,
    pool: Pool,
}

impl Room {
    fn publish(&self, msg: &Signal) {
        let plain = serde_json::to_vec(msg).expect("signal serializes");
        let ev = self.me.sign(&self.keys.topic, self.keys.seal(&plain));
        self.pool.publish(&ev);
    }
}

struct SessionHandle {
    sid: String,
    tx: mpsc::UnboundedSender<Cmd>,
    open: bool,
    initiator: bool,
}

async fn resolve_room() -> Option<String> {
    if let Ok(room) = std::env::var("PEERHOP_WEB_ROOM") {
        return Some(room);
    }
    tokio::task::spawn_blocking(|| {
        let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(10))).build().into();
        let body: serde_json::Value = agent.get(ROOM_API).call().ok()?.body_mut().read_json().ok()?;
        body.get("room")?.as_str().map(str::to_string)
    })
    .await
    .ok()
    .flatten()
}

fn set_status(shared: &Shared, status: LinkStatus) {
    let changed = {
        let mut st = shared.state.lock();
        std::mem::replace(&mut st.status, status) != status
    };
    if changed {
        shared.notify();
    }
}

async fn run(shared: Arc<Shared>, mut ctrl: mpsc::UnboundedReceiver<Ctrl>) {
    loop {
        let Some(room_id) = resolve_room().await else {
            set_status(&shared, LinkStatus::NoRoom);
            // Keep draining commands so sends fail visibly instead of hanging.
            let wait = tokio::time::sleep(Duration::from_secs(30));
            tokio::pin!(wait);
            loop {
                tokio::select! {
                    _ = &mut wait => break,
                    c = ctrl.recv() => match c {
                        Some(Ctrl::Visible(v)) => shared.state.lock().visible = v,
                        Some(Ctrl::SendFiles { files, peer }) => fail_files(&shared, &peer, &files),
                        Some(_) => {}
                        None => return,
                    },
                }
            }
            continue;
        };
        set_status(&shared, LinkStatus::Connecting);
        if !run_room(&shared, &mut ctrl, &room_id).await {
            return;
        }
    }
}

fn fail_files(shared: &Shared, peer: &str, files: &[OutFile]) {
    let hub = shared.hub();
    let key = peer_key(peer);
    for f in files {
        if let Some(t) = hub.txs.lock().get_mut(f.tx) {
            t.client_status.insert(key.clone(), Status::Failed);
        }
        hub.broadcast_txn(f.tx);
    }
}

/// Runs until the room changes (returns true) or the link is dropped (false).
async fn run_room(shared: &Arc<Shared>, ctrl: &mut mpsc::UnboundedReceiver<Ctrl>, room_id: &str) -> bool {
    let (inbox_tx, mut inbox) = mpsc::channel::<Event>(512);
    let room = Room { keys: RoomKeys::new(room_id), me: Keys::generate(), pool: Pool::start(&RoomKeys::new(room_id).topic, inbox_tx) };
    let (report_tx, mut reports) = mpsc::unbounded_channel::<Report>();
    let mut sessions: HashMap<String, SessionHandle> = HashMap::new();
    let mut queued: HashMap<String, Vec<Cmd>> = HashMap::new();
    let mut seen_ids: HashMap<String, Instant> = HashMap::new();
    let mut presence = tokio::time::interval(PRESENCE_EVERY);
    let mut housekeeping = tokio::time::interval(Duration::from_secs(2));
    let mut recheck = tokio::time::interval(ROOM_RECHECK);
    recheck.tick().await;

    let me = room.me.public.clone();
    let spawn = |peer: &str, role: Role, sid: String, sessions: &mut HashMap<String, SessionHandle>| {
        let (tx, rx) = mpsc::unbounded_channel();
        let initiator = matches!(role, Role::Offer);
        tokio::spawn(session::run(shared.clone(), peer.to_string(), sid.clone(), role, rx, report_tx.clone()));
        sessions.insert(peer.to_string(), SessionHandle { sid, tx, open: false, initiator });
    };

    let result = loop {
        tokio::select! {
            _ = presence.tick() => {
                let (visible, name) = { let s = shared.state.lock(); (s.visible, s.name.clone()) };
                if visible {
                    room.publish(&Signal::Presence { name, device: this_device() });
                }
                let status = if room.pool.connected() > 0 { LinkStatus::Online } else { LinkStatus::Connecting };
                set_status(shared, status);
            }
            _ = housekeeping.tick() => {
                let now = Instant::now();
                seen_ids.retain(|_, at| now.duration_since(*at) < Duration::from_secs(300));
                let removed = {
                    let mut st = shared.state.lock();
                    let before = st.peers.len();
                    st.peers.retain(|id, p| sessions.contains_key(id) || now.duration_since(p.seen) < PEER_TTL);
                    before != st.peers.len()
                };
                if removed { shared.notify(); }
                let status = if room.pool.connected() > 0 { LinkStatus::Online } else { LinkStatus::Connecting };
                set_status(shared, status);
            }
            _ = recheck.tick() => {
                if resolve_room().await.is_some_and(|r| r != room_id) {
                    break true;
                }
            }
            c = ctrl.recv() => match c {
                None => break false,
                Some(Ctrl::Visible(v)) => {
                    let was = std::mem::replace(&mut shared.state.lock().visible, v);
                    if was && !v {
                        room.publish(&Signal::Bye);
                    } else if !was && v {
                        let name = shared.state.lock().name.clone();
                        room.publish(&Signal::Presence { name, device: this_device() });
                    }
                }
                Some(Ctrl::SendFiles { peer, files }) => {
                    deliver(&peer, Cmd::SendFiles(files), &mut sessions, &mut queued, &spawn);
                }
                Some(Ctrl::SendText { peer, text }) => {
                    deliver(&peer, Cmd::SendText(text), &mut sessions, &mut queued, &spawn);
                }
                Some(Ctrl::Respond { peer, job, accept }) => {
                    if let Some(s) = sessions.get(&peer) {
                        let _ = s.tx.send(Cmd::Respond { job, accept });
                    }
                }
            },
            Some(ev) = inbox.recv() => {
                if ev.pubkey == me || seen_ids.contains_key(&ev.id) {
                    continue;
                }
                seen_ids.insert(ev.id.clone(), Instant::now());
                if (ev.created_at - chrono::Utc::now().timestamp()).abs() > MAX_EVENT_SKEW || !ev.verify() {
                    continue;
                }
                let Some(plain) = room.keys.open(&ev.content) else { continue };
                let Ok(msg) = serde_json::from_slice::<Signal>(&plain) else { continue };
                match msg {
                    Signal::Presence { name, device } => {
                        let name: String = name.trim().chars().take(40).collect();
                        let mut st = shared.state.lock();
                        let fresh = !st.peers.contains_key(&ev.pubkey);
                        st.peers.insert(ev.pubkey.clone(), WebPeer { id: ev.pubkey.clone(), name: if name.is_empty() { "Device".into() } else { name }, device, seen: Instant::now() });
                        drop(st);
                        if fresh { shared.notify(); }
                    }
                    Signal::Bye => {
                        if !sessions.contains_key(&ev.pubkey) && shared.state.lock().peers.remove(&ev.pubkey).is_some() {
                            shared.notify();
                        }
                    }
                    Signal::Sdp { to, sid, kind, sdp } if to == me => match kind.as_str() {
                        "offer" => {
                            let visible = shared.state.lock().visible;
                            match sessions.get(&ev.pubkey) {
                                // Already talking on another sid: both sides dialed at once.
                                // The lower public key keeps its own offer; the other answers.
                                Some(s) if s.sid != sid => {
                                    if s.initiator && !s.open && me < ev.pubkey {
                                        continue;
                                    }
                                    sessions.remove(&ev.pubkey);
                                    spawn(&ev.pubkey, Role::Answer(sdp), sid, &mut sessions);
                                }
                                Some(_) => {}
                                // Strangers can only reach us while visible.
                                None if visible => spawn(&ev.pubkey, Role::Answer(sdp), sid, &mut sessions),
                                None => {}
                            }
                        }
                        "answer" => {
                            if let Some(s) = sessions.get(&ev.pubkey).filter(|s| s.sid == sid) {
                                let _ = s.tx.send(Cmd::Answer(sdp));
                            }
                        }
                        _ => {}
                    },
                    Signal::Sdp { .. } => {}
                }
            }
            Some(r) = reports.recv() => match r {
                Report::Signal { to, sid, kind, sdp } => {
                    room.publish(&Signal::Sdp { to, sid, kind: kind.into(), sdp });
                }
                Report::Open { peer, sid } => {
                    if let Some(s) = sessions.get_mut(&peer).filter(|s| s.sid == sid) {
                        s.open = true;
                        for cmd in queued.remove(&peer).unwrap_or_default() {
                            let _ = s.tx.send(cmd);
                        }
                    }
                }
                Report::Hello { peer, name, device } => {
                    let name: String = name.trim().chars().take(40).collect();
                    let mut st = shared.state.lock();
                    let entry = st.peers.entry(peer.clone()).or_insert_with(|| WebPeer { id: peer, name: String::new(), device: Device::default(), seen: Instant::now() });
                    if !name.is_empty() { entry.name = name; }
                    entry.device = device;
                    entry.seen = Instant::now();
                    drop(st);
                    shared.notify();
                }
                Report::Prompt { peer, job, files } => {
                    let name = shared.state.lock().peers.get(&peer).map(|p| p.name.clone()).unwrap_or_else(|| "Device".into());
                    shared.state.lock().prompts.push(Prompt { peer, name, job, files });
                    shared.notify();
                }
                Report::Ended { peer, sid } => {
                    if sessions.get(&peer).is_some_and(|s| s.sid == sid) {
                        sessions.remove(&peer);
                        shared.state.lock().prompts.retain(|p| p.peer != peer);
                        // Work queued for a connection that never opened has failed.
                        for cmd in queued.remove(&peer).unwrap_or_default() {
                            if let Cmd::SendFiles(files) = cmd {
                                fail_files(shared, &peer, &files);
                            }
                        }
                        shared.notify();
                    }
                }
            },
        }
    };
    if shared.state.lock().visible {
        room.publish(&Signal::Bye);
        // Give the relays a moment to forward it.
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    result
}

/// Sends to an open session, or queues and dials if needed.
fn deliver(peer: &str, cmd: Cmd, sessions: &mut HashMap<String, SessionHandle>, queued: &mut HashMap<String, Vec<Cmd>>, spawn: &impl Fn(&str, Role, String, &mut HashMap<String, SessionHandle>)) {
    match sessions.get(peer) {
        Some(s) if s.open => {
            let _ = s.tx.send(cmd);
        }
        Some(_) => queued.entry(peer.to_string()).or_default().push(cmd),
        None => {
            queued.entry(peer.to_string()).or_default().push(cmd);
            let sid = hex::encode(rand::random::<[u8; 8]>());
            spawn(peer, Role::Offer, sid, sessions);
        }
    }
}
