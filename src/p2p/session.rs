//! One WebRTC connection to a web peer and the transfer protocol on its data channel.
//!
//! Control messages are JSON text frames; file bytes are binary frames sent in
//! order, file after file, never crossing a file boundary. Nothing is written to
//! disk until the user accepts the offer.

use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use str0m::Event;
use str0m::change::SdpPendingOffer;
use str0m::channel::ChannelId;
use str0m::IceConnectionState;
use tokio::sync::mpsc;

use super::rtc::Transport;
use super::{Device, Shared, peer_key};
use crate::store::Status;

/// Payload per binary frame (well under every browser's max-message-size).
const CHUNK: usize = 64 * 1024;
const LOW_WATER: usize = 1024 * 1024;
const MAX_FILES: usize = 1000;
const MAX_TEXT: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileMeta {
    pub name: String,
    pub size: u64,
    #[serde(default)]
    pub mime: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "t", rename_all = "lowercase")]
enum Ctl {
    Hello { name: String, device: Device },
    Offer { id: u32, files: Vec<FileMeta> },
    Accept { id: u32 },
    Decline { id: u32 },
    Cancel { id: u32 },
    Text { text: String },
}

pub enum Cmd {
    Answer(String),
    SendFiles(Vec<OutFile>),
    SendText(String),
    Respond { job: u32, accept: bool },
}

pub struct OutFile {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub tx: u64,
}

/// What a session reports back to the link.
pub enum Report {
    Signal { to: String, sid: String, kind: &'static str, sdp: String },
    Open { peer: String, sid: String },
    Hello { peer: String, name: String, device: Device },
    Prompt { peer: String, job: u32, files: Vec<FileMeta> },
    Ended { peer: String, sid: String },
}

pub enum Role {
    Offer,
    Answer(String),
}

struct OutJob {
    id: u32,
    files: Vec<OutFile>,
    idx: usize,
    offered: bool,
    accepted: bool,
    reader: Option<File>,
    sent: u64,
    chunk: Option<Vec<u8>>,
}

struct InJob {
    id: u32,
    files: Vec<FileMeta>,
    idx: usize,
    accepted: bool,
    writer: Option<(BufWriter<File>, PathBuf, u64)>,
    got: u64,
}

struct Session {
    shared: std::sync::Arc<Shared>,
    peer: String,
    key: String,
    sid: String,
    reports: mpsc::UnboundedSender<Report>,
    t: Transport,
    channel: Option<ChannelId>,
    writable: bool,
    outgoing: VecDeque<OutJob>,
    incoming: Option<InJob>,
    next_job: u32,
    last_activity: Instant,
    /// Control frames waiting for buffer space; always sent before file bytes.
    ctl_queue: VecDeque<Vec<u8>>,
}

pub async fn run(shared: std::sync::Arc<Shared>, peer: String, sid: String, role: Role, mut cmds: mpsc::UnboundedReceiver<Cmd>, reports: mpsc::UnboundedSender<Report>) {
    let ended = Report::Ended { peer: peer.clone(), sid: sid.clone() };
    let result = async {
        let mut t = Transport::new().await.map_err(|e| e.to_string())?;
        match role {
            Role::Offer => {
                let (sdp, pending, _) = t.create_offer();
                let _ = reports.send(Report::Signal { to: peer.clone(), sid: sid.clone(), kind: "offer", sdp });
                let answer = wait_answer(&mut cmds).await.ok_or("no answer")?;
                accept(&mut t, pending, &answer)?;
            }
            Role::Answer(offer) => {
                let sdp = t.accept_offer(&offer)?;
                let _ = reports.send(Report::Signal { to: peer.clone(), sid: sid.clone(), kind: "answer", sdp });
            }
        }
        let mut s = Session {
            key: peer_key(&peer),
            shared,
            peer: peer.clone(),
            sid: sid.clone(),
            reports: reports.clone(),
            t,
            channel: None,
            writable: false,
            outgoing: VecDeque::new(),
            incoming: None,
            next_job: 1,
            last_activity: Instant::now(),
            ctl_queue: VecDeque::new(),
        };
        let r = s.main(&mut cmds).await;
        s.fail_all();
        r
    }
    .await;
    if let Err(e) = result {
        crate::log_info!("web peer {}: session ended: {e}", &peer[..8.min(peer.len())]);
    }
    let _ = reports.send(ended);
}

async fn wait_answer(cmds: &mut mpsc::UnboundedReceiver<Cmd>) -> Option<String> {
    let deadline = tokio::time::sleep(CONNECT_TIMEOUT);
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            c = cmds.recv() => match c? {
                Cmd::Answer(sdp) => return Some(sdp),
                _ => {} // commands are only delivered after the channel opens
            },
            _ = &mut deadline => return None,
        }
    }
}

fn accept(t: &mut Transport, pending: SdpPendingOffer, answer: &str) -> Result<(), String> {
    t.accept_answer(pending, answer)
}

impl Session {
    async fn main(&mut self, cmds: &mut mpsc::UnboundedReceiver<Cmd>) -> Result<(), String> {
        let started = Instant::now();
        let mut events = Vec::new();
        let mut tick = tokio::time::interval(Duration::from_millis(250));
        loop {
            let mut deadline = self.t.drain(&mut events)?;
            for e in events.drain(..) {
                if !self.on_event(e)? {
                    return Ok(());
                }
            }
            if self.pump()? {
                // More to send right away; don't sleep.
                deadline = Instant::now();
            }
            if self.channel.is_none() && started.elapsed() > CONNECT_TIMEOUT {
                return Err("connection timed out".into());
            }
            if self.idle() && self.last_activity.elapsed() > IDLE_TIMEOUT {
                return Ok(());
            }
            tokio::select! {
                c = cmds.recv() => match c {
                    Some(c) => self.on_cmd(c)?,
                    None => return Ok(()),
                },
                r = self.t.step(deadline) => {
                    // One packet per turn: str0m must drain between inputs or its DTLS
                    // receive queue overflows under load.
                    r?;
                }
                _ = tick.tick() => self.on_tick()?,
            }
        }
    }

    fn idle(&self) -> bool {
        self.outgoing.is_empty() && self.incoming.is_none()
    }

    fn on_event(&mut self, e: Event) -> Result<bool, String> {
        match e {
            Event::ChannelOpen(id, _) => {
                self.channel = Some(id);
                self.writable = true;
                if let Some(mut ch) = self.t.rtc.channel(id) {
                    ch.set_buffered_amount_low_threshold(LOW_WATER);
                }
                let me = self.shared.profile();
                self.send_ctl(&Ctl::Hello { name: me.0, device: me.1 })?;
                let _ = self.reports.send(Report::Open { peer: self.peer.clone(), sid: self.sid.clone() });
            }
            Event::ChannelData(d) => {
                self.last_activity = Instant::now();
                if d.binary {
                    self.on_bytes(&d.data)?;
                } else if let Ok(ctl) = serde_json::from_slice::<Ctl>(&d.data) {
                    self.on_ctl(ctl)?;
                }
            }
            Event::ChannelBufferedAmountLow(_) => self.writable = true,
            Event::ChannelClose(_) => return Ok(false),
            Event::IceConnectionStateChange(IceConnectionState::Disconnected) => return Ok(false),
            _ => {}
        }
        Ok(true)
    }

    fn on_cmd(&mut self, c: Cmd) -> Result<(), String> {
        self.last_activity = Instant::now();
        match c {
            Cmd::Answer(_) => {}
            Cmd::SendFiles(files) => {
                let id = self.next_job;
                self.next_job += 1;
                self.outgoing.push_back(OutJob { id, files, idx: 0, offered: false, accepted: false, reader: None, sent: 0, chunk: None });
            }
            Cmd::SendText(text) => self.send_ctl(&Ctl::Text { text })?,
            Cmd::Respond { job, accept } => {
                let Some(inc) = self.incoming.as_mut().filter(|j| j.id == job && !j.accepted) else { return Ok(()) };
                if accept {
                    inc.accepted = true;
                    self.send_ctl(&Ctl::Accept { id: job })?;
                    self.open_next_incoming()?;
                } else {
                    self.incoming = None;
                    self.send_ctl(&Ctl::Decline { id: job })?;
                }
            }
        }
        Ok(())
    }

    fn on_ctl(&mut self, ctl: Ctl) -> Result<(), String> {
        match ctl {
            Ctl::Hello { name, device } => {
                let _ = self.reports.send(Report::Hello { peer: self.peer.clone(), name, device });
            }
            Ctl::Offer { id, files } => {
                let valid = !files.is_empty() && files.len() <= MAX_FILES && files.iter().all(|f| crate::util::sanitize_filename(&f.name).is_some());
                if self.incoming.is_some() || !valid {
                    return self.send_ctl(&Ctl::Decline { id });
                }
                self.incoming = Some(InJob { id, files: files.clone(), idx: 0, accepted: false, writer: None, got: 0 });
                let _ = self.reports.send(Report::Prompt { peer: self.peer.clone(), job: id, files });
            }
            Ctl::Accept { id } => {
                if let Some(job) = self.outgoing.front_mut().filter(|j| j.id == id && j.offered) {
                    job.accepted = true;
                }
            }
            Ctl::Decline { id } => {
                if self.outgoing.front().is_some_and(|j| j.id == id) {
                    let job = self.outgoing.pop_front().unwrap();
                    let hub = self.shared.hub();
                    for f in &job.files {
                        set_client_status(&hub, f.tx, &self.key, Status::Cancelled);
                    }
                }
            }
            Ctl::Cancel { id } => {
                if self.outgoing.front().is_some_and(|j| j.id == id) {
                    let job = self.outgoing.pop_front().unwrap();
                    self.end_out_job(job, Status::Cancelled);
                }
                if self.incoming.as_ref().is_some_and(|j| j.id == id) {
                    self.abort_incoming(Status::Cancelled);
                }
            }
            Ctl::Text { text } => {
                if !text.is_empty() && text.len() <= MAX_TEXT {
                    self.shared.hub().web_text(&self.key, text, false);
                    self.shared.notify();
                }
            }
        }
        Ok(())
    }

    // ---- receiving ------------------------------------------------------------

    /// Opens the next file of the accepted job, finishing zero-byte files immediately.
    fn open_next_incoming(&mut self) -> Result<(), String> {
        let hub = self.shared.hub();
        let dir = hub.shared().download_dir;
        let Some(job) = self.incoming.as_mut() else { return Ok(()) };
        while job.writer.is_none() && job.idx < job.files.len() {
            let meta = &job.files[job.idx];
            let name = crate::util::sanitize_filename(&meta.name).unwrap_or_else(|| "file".into());
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = crate::util::unique_path(&dir, &name);
            let file = File::create(&path).map_err(|e| e.to_string())?;
            let tx = hub.web_incoming(&self.key, &stored_name(&path), meta.size, &path);
            job.got = 0;
            if meta.size == 0 {
                hub.file_received(tx, &stored_name(&path), 0);
                job.idx += 1;
            } else {
                job.writer = Some((BufWriter::with_capacity(1 << 20, file), path, tx));
            }
        }
        if job.idx >= job.files.len() {
            self.incoming = None;
        }
        self.shared.notify();
        Ok(())
    }

    fn on_bytes(&mut self, data: &[u8]) -> Result<(), String> {
        let Some(job) = self.incoming.as_mut().filter(|j| j.accepted) else { return Ok(()) };
        let Some((w, _, _)) = job.writer.as_mut() else { return Ok(()) };
        let size = job.files[job.idx].size;
        if job.got + data.len() as u64 > size {
            // A sender may never cross a file boundary; treat it as corrupt.
            let id = job.id;
            self.abort_incoming(Status::Failed);
            return self.send_ctl(&Ctl::Cancel { id });
        }
        if w.write_all(data).is_err() {
            let id = job.id;
            self.abort_incoming(Status::Failed);
            return self.send_ctl(&Ctl::Cancel { id });
        }
        job.got += data.len() as u64;
        if job.got == size {
            if w.flush().is_err() {
                let id = job.id;
                self.abort_incoming(Status::Failed);
                return self.send_ctl(&Ctl::Cancel { id });
            }
            let (_, path, tx) = job.writer.take().unwrap();
            self.shared.hub().file_received(tx, &stored_name(&path), size);
            job.idx += 1;
            self.open_next_incoming()?;
        }
        Ok(())
    }

    fn abort_incoming(&mut self, status: Status) {
        let Some(mut job) = self.incoming.take() else { return };
        if let Some((w, path, tx)) = job.writer.take() {
            drop(w);
            let _ = std::fs::remove_file(&path);
            self.shared.hub().end_transfer(tx, status);
        }
        self.shared.notify();
    }

    // ---- sending --------------------------------------------------------------

    /// Writes as much as the channel accepts. Returns true if it stopped early
    /// with more ready to go (so the caller should loop without waiting).
    fn pump(&mut self) -> Result<bool, String> {
        let Some(ch_id) = self.channel else { return Ok(false) };
        if !self.flush_ctl()? {
            return Ok(false);
        }
        let Some(job) = self.outgoing.front_mut() else { return Ok(false) };
        if !job.offered {
            let files = job.files.iter().map(|f| FileMeta { name: f.name.clone(), size: f.size, mime: mime_guess::from_path(&f.path).first_or_octet_stream().to_string() }).collect();
            let id = job.id;
            job.offered = true;
            self.send_ctl(&Ctl::Offer { id, files })?;
            return Ok(false);
        }
        if !job.accepted || !self.writable {
            return Ok(false);
        }
        let hub = self.shared.hub();
        let mut budget = 64;
        while budget > 0 {
            budget -= 1;
            let job = self.outgoing.front_mut().unwrap();
            if job.idx >= job.files.len() {
                let job = self.outgoing.pop_front().unwrap();
                self.end_out_job(job, Status::Completed);
                return Ok(!self.outgoing.is_empty());
            }
            if job.chunk.is_none() {
                let f = &job.files[job.idx];
                if job.reader.is_none() {
                    job.reader = Some(File::open(&f.path).map_err(|e| e.to_string())?);
                    job.sent = 0;
                    set_client_status(&hub, f.tx, &self.key, Status::InProgress);
                }
                let left = (f.size - job.sent).min(CHUNK as u64) as usize;
                if left == 0 {
                    let tx = f.tx;
                    let size = f.size;
                    job.reader = None;
                    job.idx += 1;
                    hub.txs.lock().record_client_range(tx, &self.key, 0, size.saturating_sub(1), size.max(1));
                    set_client_status(&hub, tx, &self.key, Status::Completed);
                    hub.broadcast_txn(tx);
                    continue;
                }
                let mut buf = vec![0u8; left];
                job.reader.as_mut().unwrap().read_exact(&mut buf).map_err(|e| e.to_string())?;
                job.chunk = Some(buf);
            }
            let chunk = job.chunk.as_ref().unwrap();
            let Some(mut ch) = self.t.rtc.channel(ch_id) else { return Err("channel gone".into()) };
            if !ch.write(true, chunk).map_err(|e| e.to_string())? {
                self.writable = false;
                return Ok(false);
            }
            job.sent += chunk.len() as u64;
            job.chunk = None;
        }
        Ok(true)
    }

    fn end_out_job(&mut self, job: OutJob, status: Status) {
        let hub = self.shared.hub();
        for (i, f) in job.files.iter().enumerate() {
            let st = if status == Status::Completed || i < job.idx { Status::Completed } else { status };
            set_client_status(&hub, f.tx, &self.key, st);
        }
        self.shared.notify();
    }

    /// Progress reporting and cancellation from the desktop UI.
    fn on_tick(&mut self) -> Result<(), String> {
        let hub = self.shared.hub();
        if let Some(job) = self.outgoing.front() {
            if job.accepted && job.idx < job.files.len() {
                let f = &job.files[job.idx];
                let cancelled = {
                    let mut txs = hub.txs.lock();
                    txs.is_client_cancelled(f.tx, &self.key) || txs.is_cancelled(f.tx) || txs.get(f.tx).is_none()
                };
                if cancelled {
                    let job = self.outgoing.pop_front().unwrap();
                    let id = job.id;
                    self.end_out_job(job, Status::Cancelled);
                    return self.send_ctl(&Ctl::Cancel { id });
                }
                if job.sent > 0 {
                    hub.txs.lock().record_client_range(f.tx, &self.key, 0, job.sent - 1, f.size);
                    hub.broadcast_txn(f.tx);
                }
            }
        }
        if let Some(job) = self.incoming.as_ref() {
            if let Some((_, _, tx)) = job.writer.as_ref() {
                let tx = *tx;
                let cancelled = {
                    let mut txs = hub.txs.lock();
                    txs.is_cancelled(tx) || txs.get(tx).is_none()
                };
                if cancelled {
                    let id = job.id;
                    self.abort_incoming(Status::Cancelled);
                    return self.send_ctl(&Ctl::Cancel { id });
                }
                hub.txs.lock().update_progress(tx, job.got, job.files[job.idx].size);
                hub.broadcast_txn(tx);
            }
        }
        Ok(())
    }

    fn fail_all(&mut self) {
        while let Some(job) = self.outgoing.pop_front() {
            self.end_out_job(job, Status::Failed);
        }
        self.abort_incoming(Status::Failed);
    }

    fn send_ctl(&mut self, ctl: &Ctl) -> Result<(), String> {
        self.ctl_queue.push_back(serde_json::to_vec(ctl).map_err(|e| e.to_string())?);
        self.flush_ctl().map(|_| ())
    }

    /// Writes queued control frames; false while some are still waiting for space.
    fn flush_ctl(&mut self) -> Result<bool, String> {
        let Some(id) = self.channel else { return Ok(self.ctl_queue.is_empty()) };
        while let Some(frame) = self.ctl_queue.front() {
            let Some(mut ch) = self.t.rtc.channel(id) else { return Err("channel gone".into()) };
            if !ch.write(false, frame).map_err(|e| e.to_string())? {
                self.writable = false;
                return Ok(false);
            }
            self.ctl_queue.pop_front();
        }
        Ok(true)
    }
}

/// Name the file was actually saved under (may differ from the offered name).
fn stored_name(path: &std::path::Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn set_client_status(hub: &crate::hub::Hub, tx: u64, key: &str, status: Status) {
    if let Some(t) = hub.txs.lock().get_mut(tx) {
        t.client_status.insert(key.to_string(), status);
        if status == Status::Completed {
            t.client_progress.insert(key.to_string(), 100.0);
            t.client_bytes.insert(key.to_string(), t.file_size);
        }
    }
    hub.broadcast_txn(tx);
}
