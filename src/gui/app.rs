//! Desktop application state, server lifecycle and top-level layout.

use eframe::egui;
use egui::{Align2, Color32, CornerRadius, FontId, Frame, Id, Key, Margin, RichText, Stroke, Ui, vec2};
use egui_phosphor::regular as icon;
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::{Duration, Instant};

use peerhop::hub::{Hub, HubEvent, Mode, Shared};
use peerhop::net::NetworkProfile;
use peerhop::platform::{self, ShareData};
use peerhop::server::Server;
use peerhop::settings::Settings;
use peerhop::store::{Client, SERVER_SENDER, Transaction};

use super::i18n::{self, I18n};
use super::notifier::{self, Note};
use super::theme::{self, Palette};
use super::thumbs::Thumbs;
use super::widgets::{self, QrCache};

/// Below this window width the layout collapses to a single tabbed panel.
const SINGLE_PANEL_BELOW: f32 = 600.0;
/// Side panel width range; it narrows on small windows so chat keeps room.
const SIDE_MIN: f32 = 280.0;
const SIDE_MAX: f32 = 330.0;
const REVIEW_AT: &[u32] = &[2, 5, 8, 10, 20, 30, 40, 50];
const SHARE_DEDUPE: Duration = Duration::from_secs(3);

pub enum Msg {
    Share(ShareData),
    ServerStarted { result: Result<Server, String>, wanted: u16 },
    Networks(Vec<NetworkProfile>),
    Zipped(Result<PathBuf, String>),
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    Chat,
    Connect,
    Settings,
}

pub enum Modal {
    Restart { reason: RestartReason },
    DeleteTxn { id: u64, history_only: bool, has_file: bool },
    CancelClient { id: u64, ip: String, device: String, file: String },
    CancelUpload { id: u64, file: String },
    WifiQr { ssid: String, password: String },
    Review { stars: u8 },
}

#[derive(Clone, Copy)]
pub enum RestartReason {
    Manual,
    PortChange,
}

#[derive(Clone, Copy, PartialEq)]
pub enum ToastKind {
    Info,
    Success,
    Error,
}

struct Toast {
    text: String,
    kind: ToastKind,
    at: Instant,
}

#[derive(Default)]
struct Speed {
    bytes: u64,
    at: Option<Instant>,
    bps: f64,
}

pub struct App {
    rt: tokio::runtime::Runtime,
    ctx: egui::Context,
    pub(crate) settings: Settings,
    pub(crate) i18n: Arc<I18n>,
    lang_shared: Arc<Mutex<Arc<I18n>>>,
    pub(crate) pal: Palette,

    server: Option<Server>,
    pub(crate) hub: Arc<Hub>,
    pub(crate) port: u16,
    pub(crate) restarting: bool,

    tx: Sender<Msg>,
    rx: Receiver<Msg>,
    dirty: Arc<AtomicBool>,
    focused: Arc<AtomicBool>,
    notes: Sender<Note>,

    pub(crate) txs: Vec<Transaction>,
    pub(crate) clients: Vec<Client>,
    speeds: HashMap<(u64, String), Speed>,
    pub(crate) networks: Vec<NetworkProfile>,
    pub(crate) networks_loaded: bool,
    pub(crate) selected_ip: Option<Ipv4Addr>,

    pub(crate) wide: bool,
    pub(crate) tab: Tab,
    pub(crate) side_tab: usize,
    pub(crate) text_mode: bool,
    pub(crate) draft: String,
    pub(crate) modal: Option<Modal>,
    toasts: Vec<Toast>,
    /// When each transaction first appeared (drives its entry animation).
    appeared: HashMap<u64, Instant>,
    /// Deleted transactions kept briefly so they can fade and collapse away.
    pub(crate) leaving: Vec<(Transaction, Instant)>,
    /// Theme cross-fade: from, to, start.
    pal_fade: Option<(Palette, Palette, Instant)>,
    /// Last tab switch: when, and which way the content should slide (-1 left, 1 right).
    tab_switch: Option<(Instant, f32)>,
    /// Last time a device connected (pulses the status dot).
    pub(crate) joined_at: Option<Instant>,
    pub(crate) thumbs: Thumbs,
    pub(crate) qr: QrCache,
    pub(crate) logo: egui::TextureHandle,
    pub(crate) zipping: usize,
    last_share: Option<(u64, Instant)>,
    paste_latch: bool,

    pub(crate) mobile_open: bool,
    pub(crate) desktop_open: bool,
    pub(crate) show_more_networks: bool,
    pub(crate) revealed: HashSet<String>,
    pub(crate) client_names: HashMap<String, String>,
    pub(crate) name_edit: String,
    pub(crate) port_edit: String,
}

pub fn load_png(bytes: &[u8]) -> Option<egui::ColorImage> {
    let img = image::load_from_memory(bytes).ok()?.to_rgba8();
    let (w, h) = img.dimensions();
    Some(egui::ColorImage::from_rgba_unmultiplied([w as usize, h as usize], img.as_raw()))
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>, initial_files: Vec<String>) -> Self {
        let ctx = cc.egui_ctx.clone();
        theme::install_fonts(&ctx);

        let mut settings = Settings::load();
        settings.is_dark_mode = theme::is_dark(&settings.theme_id, ctx.system_theme());
        let i18n = Arc::new(I18n::new(i18n::detect(&settings.language)));
        let lang_shared = Arc::new(Mutex::new(i18n.clone()));
        let pal = theme::palette(settings.is_dark_mode);
        theme::apply(&ctx, &pal);

        let logo_img = load_png(include_bytes!("../../ui/frontend/src/assets/images/appicon.png")).unwrap_or_else(|| egui::ColorImage::filled([1, 1], Color32::TRANSPARENT));
        let logo = ctx.load_texture("logo", logo_img, egui::TextureOptions::LINEAR);

        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().worker_threads(4).build().expect("tokio runtime");
        let (tx, rx) = channel();
        let focused = Arc::new(AtomicBool::new(true));
        let notes = notifier::spawn(lang_shared.clone(), focused.clone());

        // Shares arriving from ShareShim or a second launch.
        {
            let tx = tx.clone();
            let ctx = ctx.clone();
            rt.spawn(platform::serve_share_pipe(move |d| {
                let _ = tx.send(Msg::Share(d));
                ctx.request_repaint();
            }));
        }
        // Network discovery shells out (netsh/nmcli), so it lives on its own thread.
        {
            let tx = tx.clone();
            let ctx = ctx.clone();
            std::thread::Builder::new()
                .name("networks".into())
                .spawn(move || {
                    let mut first = true;
                    loop {
                        if tx.send(Msg::Networks(peerhop::net::network_profiles())).is_err() {
                            return;
                        }
                        ctx.request_repaint();
                        if first {
                            first = false;
                            peerhop::net::try_enable_hotspot();
                            continue;
                        }
                        std::thread::sleep(Duration::from_secs(10));
                    }
                })
                .ok();
        }

        if let Some(share) = platform::take_cold_start_share() {
            let _ = tx.send(Msg::Share(share));
        }
        if !initial_files.is_empty() {
            let _ = tx.send(Msg::Share(ShareData { files: initial_files, ..Default::default() }));
        }

        let placeholder = Hub::new(Mode::Desktop, shared_from(&settings));
        let name_edit = settings.desktop_device_name.clone();
        let port_edit = settings.static_port.to_string();
        let mut app = Self {
            rt,
            ctx: ctx.clone(),
            settings,
            i18n,
            lang_shared,
            pal,
            server: None,
            hub: placeholder,
            port: 0,
            restarting: false,
            tx,
            rx,
            dirty: Arc::new(AtomicBool::new(true)),
            focused,
            notes,
            txs: Vec::new(),
            clients: Vec::new(),
            speeds: HashMap::new(),
            networks: Vec::new(),
            networks_loaded: false,
            selected_ip: None,
            wide: true,
            tab: Tab::Connect,
            side_tab: 0,
            text_mode: false,
            draft: String::new(),
            modal: None,
            toasts: Vec::new(),
            appeared: HashMap::new(),
            leaving: Vec::new(),
            pal_fade: None,
            tab_switch: None,
            joined_at: None,
            thumbs: Thumbs::new(ctx.clone()),
            qr: QrCache::default(),
            logo,
            zipping: 0,
            last_share: None,
            paste_latch: false,
            mobile_open: true,
            desktop_open: false,
            show_more_networks: false,
            revealed: HashSet::new(),
            client_names: HashMap::new(),
            name_edit,
            port_edit,
        };
        app.restart_server();
        app
    }

    pub(crate) fn t(&self, key: &'static str) -> &str {
        self.i18n.t(key)
    }

    pub(crate) fn toast(&mut self, text: impl Into<String>, kind: ToastKind) {
        self.toasts.push(Toast { text: text.into(), kind, at: Instant::now() });
        if self.toasts.len() > 4 {
            self.toasts.remove(0);
        }
    }

    pub(crate) fn save_settings(&self) {
        if let Err(e) = self.settings.save() {
            peerhop::log_warn!("Saving settings failed: {e}");
        }
    }

    // ---- server ----------------------------------------------------------

    /// Stop the current server (if any) and start a fresh session.
    pub(crate) fn restart_server(&mut self) {
        if let Some(mut old) = self.server.take() {
            old.stop();
        }
        let hub = Hub::new(Mode::Desktop, shared_from(&self.settings));
        self.attach_listener(&hub);
        self.hub = hub.clone();
        self.dirty.store(true, Ordering::Relaxed);
        self.restarting = true;
        self.speeds.clear();

        let wanted = if self.settings.static_port_enabled { self.settings.static_port } else { 0 };
        let tx = self.tx.clone();
        let ctx = self.ctx.clone();
        self.rt.spawn(async move {
            let mut result = Server::start(hub.clone(), wanted).await;
            // The previous session may take a moment to release a static port.
            for _ in 0..10 {
                if result.is_ok() || wanted == 0 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
                result = Server::start(hub.clone(), wanted).await;
            }
            if result.is_err() && wanted != 0 {
                result = Server::start(hub, 0).await;
            }
            let _ = tx.send(Msg::ServerStarted { result: result.map_err(|e| e.to_string()), wanted });
            ctx.request_repaint();
        });
    }

    fn attach_listener(&self, hub: &Arc<Hub>) {
        let ctx = self.ctx.clone();
        let dirty = self.dirty.clone();
        let notes = Mutex::new(self.notes.clone());
        let weak = Arc::downgrade(hub);
        hub.set_listener(Arc::new(move |ev| match ev {
            HubEvent::Changed => {
                dirty.store(true, Ordering::Relaxed);
                ctx.request_repaint();
            }
            HubEvent::FileReceived { name, size } => {
                let _ = notes.lock().send(Note::Received { name, size });
            }
            HubEvent::ClientFinished { ip, name, size } => {
                let device = weak.upgrade().and_then(|h| h.clients.lock().get(&ip).map(|c| c.name.clone())).unwrap_or(ip);
                let _ = notes.lock().send(Note::ClientDone { device, name, size });
            }
        }));
    }

    pub(crate) fn current_ip(&self) -> Ipv4Addr {
        match self.selected_ip {
            Some(ip) if self.networks.iter().any(|n| n.ip == ip) => ip,
            _ => self.networks.first().map(|n| n.ip).unwrap_or_else(peerhop::net::primary_ip),
        }
    }

    /// Address phones and browsers open; carries the token when security is on.
    pub(crate) fn server_url(&self) -> String {
        let base = format!("http://{}:{}", self.current_ip(), self.port);
        if self.settings.security_enabled { format!("{base}/?security={}", self.hub.security_token) } else { base }
    }

    pub(crate) fn server_ready(&self) -> bool {
        self.server.is_some() && !self.restarting
    }

    // ---- sharing -----------------------------------------------------------

    pub(crate) fn share_paths(&mut self, paths: Vec<PathBuf>) {
        let (dirs, files): (Vec<_>, Vec<_>) = paths.into_iter().partition(|p| p.is_dir());
        let files: Vec<(PathBuf, u64)> = files
            .into_iter()
            .filter_map(|p| std::fs::metadata(&p).ok().filter(|m| m.is_file()).map(|m| (p, m.len())))
            .collect();
        if !files.is_empty() {
            self.hub.offer_files(&files);
            self.count_share();
        }
        if !dirs.is_empty() {
            self.zipping += 1;
            let tx = self.tx.clone();
            let ctx = self.ctx.clone();
            std::thread::spawn(move || {
                let r = peerhop::util::zip_paths(&dirs).map_err(|e| e.to_string());
                let _ = tx.send(Msg::Zipped(r));
                ctx.request_repaint();
            });
        }
        self.tab = Tab::Chat;
    }

    pub(crate) fn pick_files(&mut self) {
        if let Some(files) = rfd::FileDialog::new().pick_files() {
            self.share_paths(files);
        }
    }

    pub(crate) fn send_text(&mut self) {
        let text = self.draft.trim().to_string();
        if text.is_empty() {
            return;
        }
        self.hub.send_text(SERVER_SENDER, "", text);
        self.draft.clear();
    }

    fn count_share(&mut self) {
        self.settings.share_count += 1;
        self.save_settings();
        if cfg!(windows) && !self.settings.has_reviewed && REVIEW_AT.contains(&self.settings.share_count) && self.modal.is_none() {
            self.modal = Some(Modal::Review { stars: 0 });
        }
    }

    fn handle_share(&mut self, share: ShareData) {
        // ShareShim and the single-instance hand-off can both deliver the same share.
        let hash = {
            use std::hash::{Hash, Hasher};
            let mut h = std::collections::hash_map::DefaultHasher::new();
            (&share.files, &share.text, &share.url).hash(&mut h);
            h.finish()
        };
        if let Some((last, at)) = self.last_share {
            if last == hash && at.elapsed() < SHARE_DEDUPE {
                return;
            }
        }
        self.last_share = Some((hash, Instant::now()));

        let files: Vec<PathBuf> = share.files.iter().map(PathBuf::from).collect();
        if !files.is_empty() {
            self.share_paths(files);
        }
        for text in [share.text, share.url] {
            let text = text.trim().to_string();
            if !text.is_empty() {
                self.hub.send_text(SERVER_SENDER, "", text);
                self.tab = Tab::Chat;
            }
        }
    }

    // ---- per-frame bookkeeping ---------------------------------------------

    fn pump(&mut self, ctx: &egui::Context) {
        self.focused.store(ctx.input(|i| i.focused), Ordering::Relaxed);
        while let Ok(msg) = self.rx.try_recv() {
            match msg {
                Msg::Share(s) => self.handle_share(s),
                Msg::Networks(n) => {
                    self.networks_loaded = true;
                    if n != self.networks {
                        self.networks = n;
                        self.hub.refresh_local_ips();
                    }
                }
                Msg::Zipped(r) => {
                    self.zipping = self.zipping.saturating_sub(1);
                    match r {
                        Ok(path) => {
                            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                            self.hub.offer_files(&[(path, size)]);
                            self.count_share();
                        }
                        Err(e) => self.toast(format!("{}: {e}", self.t("zip_failed")), ToastKind::Error),
                    }
                }
                Msg::ServerStarted { result, wanted } => match result {
                    Ok(server) if Arc::ptr_eq(&server.hub, &self.hub) => {
                        self.port = server.port;
                        if wanted != 0 && server.port != wanted {
                            let msg = self.i18n.tf("port_in_use", &[("port", &wanted.to_string()), ("fallback", &server.port.to_string())]);
                            self.toast(msg, ToastKind::Error);
                        }
                        self.server = Some(server);
                        self.restarting = false;
                    }
                    // A newer restart superseded this one.
                    Ok(mut stale) => stale.stop(),
                    Err(e) => {
                        self.restarting = false;
                        self.toast(format!("{}: {e}", self.t("failed_to_restart")), ToastKind::Error);
                    }
                },
            }
        }
        if self.dirty.swap(false, Ordering::Relaxed) {
            self.refresh_snapshot();
        }
        self.handle_drop_and_paste(ctx);
    }

    fn refresh_snapshot(&mut self) {
        let old = std::mem::replace(&mut self.txs, self.hub.txs.lock().all());
        let kept: HashSet<u64> = self.txs.iter().map(|t| t.id).collect();
        let gone = Instant::now();
        self.leaving.extend(old.into_iter().filter(|t| !kept.contains(&t.id)).map(|t| (t, gone)));
        let clients = self.hub.clients.lock().active();
        let before: HashSet<&str> = self.clients.iter().map(|c| c.ip.as_str()).collect();
        let after: HashSet<&str> = clients.iter().map(|c| c.ip.as_str()).collect();
        let joined: Vec<String> = clients.iter().filter(|c| !before.contains(c.ip.as_str())).map(|c| c.name.clone()).collect();
        let left: Vec<String> = self.clients.iter().filter(|c| !after.contains(c.ip.as_str())).map(|c| c.name.clone()).collect();
        self.clients = clients;
        if !joined.is_empty() {
            self.joined_at = Some(Instant::now());
        }
        for name in joined {
            self.toast(format!("{} · {name}", self.t("device_connected")), ToastKind::Success);
            // Connection done: get the QR out of the way and show the conversation.
            self.mobile_open = false;
            self.desktop_open = false;
            self.tab = Tab::Chat;
        }
        for name in left {
            self.toast(format!("{} · {name}", self.t("device_disconnected")), ToastKind::Info);
        }

        let now = Instant::now();
        let mut live = HashSet::new();
        for t in &self.txs {
            let samples: Vec<(String, u64)> = if t.is_outgoing() {
                t.client_bytes.iter().map(|(ip, b)| (ip.clone(), *b)).collect()
            } else {
                vec![(String::new(), t.bytes_transferred)]
            };
            for (ip, bytes) in samples {
                let key = (t.id, ip);
                let s = self.speeds.entry(key.clone()).or_default();
                match s.at {
                    Some(at) if bytes >= s.bytes => {
                        let dt = now.duration_since(at).as_secs_f64();
                        if dt >= 0.25 {
                            let inst = (bytes - s.bytes) as f64 / dt;
                            s.bps = if s.bps == 0.0 { inst } else { s.bps * 0.7 + inst * 0.3 };
                            s.bytes = bytes;
                            s.at = Some(now);
                        }
                    }
                    _ => *s = Speed { bytes, at: Some(now), bps: 0.0 },
                }
                live.insert(key);
            }
        }
        self.speeds.retain(|k, _| live.contains(k));

        let ids: HashSet<u64> = self.txs.iter().map(|t| t.id).collect();
        for id in &ids {
            self.appeared.entry(*id).or_insert(now);
        }
        self.appeared.retain(|id, _| ids.contains(id));
    }

    fn animate_theme(&mut self) {
        let Some((from, to, at)) = self.pal_fade else { return };
        let t = egui::emath::easing::cubic_in_out((at.elapsed().as_secs_f32() / 0.3).min(1.0));
        self.pal = from.lerp(&to, t);
        theme::apply(&self.ctx, &self.pal);
        if t >= 1.0 {
            self.pal_fade = None;
        } else {
            self.ctx.request_repaint();
        }
    }

    /// Progress (eased) and direction of the current tab slide.
    fn tab_slide(&self) -> (f32, f32) {
        match self.tab_switch {
            Some((at, dir)) => (egui::emath::easing::cubic_out((at.elapsed().as_secs_f32() / 0.22).min(1.0)), dir),
            None => (1.0, 0.0),
        }
    }

    /// 0..1 entry animation of a transaction's bubble (eased).
    pub(crate) fn appear(&self, id: u64) -> f32 {
        let age = self.appeared.get(&id).map(|t| t.elapsed().as_secs_f32()).unwrap_or(1.0);
        egui::emath::easing::cubic_out((age / 0.3).min(1.0))
    }

    pub(crate) fn speed(&self, id: u64, ip: &str) -> f64 {
        self.speeds.get(&(id, ip.to_string())).map(|s| s.bps).unwrap_or(0.0)
    }

    pub(crate) fn client_name(&self, ip: &str) -> String {
        self.clients.iter().find(|c| c.ip == ip).map(|c| c.name.clone()).unwrap_or_else(|| ip.to_string())
    }

    pub(crate) fn client_platform(&self, ip: &str) -> &str {
        self.clients.iter().find(|c| c.ip == ip).map(|c| c.platform.as_str()).unwrap_or("")
    }

    fn handle_drop_and_paste(&mut self, ctx: &egui::Context) {
        let dropped: Vec<PathBuf> = ctx.input(|i| i.raw.dropped_files.iter().map(|f| f.path().to_path_buf()).filter(|p| !p.as_os_str().is_empty()).collect());
        if !dropped.is_empty() && self.modal.is_none() {
            self.share_paths(dropped);
        }
        if self.modal.is_some() || ctx.egui_wants_keyboard_input() {
            return;
        }
        // Linux file managers put file:// URIs on the clipboard as text.
        let pasted_text: Vec<String> = ctx.input(|i| {
            i.events.iter().filter_map(|e| if let egui::Event::Paste(s) = e { Some(s.clone()) } else { None }).collect()
        });
        for text in pasted_text {
            let paths: Vec<PathBuf> = text.lines().filter_map(|l| l.trim().strip_prefix("file://")).map(|p| PathBuf::from(percent_decode(p))).filter(|p| p.exists()).collect();
            if !paths.is_empty() {
                self.share_paths(paths);
            }
        }
        // Windows: egui reports no event for a non-text paste, so watch the chord directly.
        let chord = ctx.input(|i| i.focused) && platform::paste_chord_down();
        if chord && !self.paste_latch {
            self.paste_latch = true;
            let files = platform::clipboard_files();
            if !files.is_empty() {
                self.share_paths(files);
            } else if let Some(path) = clipboard_image_to_file() {
                self.share_paths(vec![path]);
            }
        } else if !chord {
            self.paste_latch = false;
        }
        if self.paste_latch {
            ctx.request_repaint_after(Duration::from_millis(50));
        }
    }

    // ---- settings actions ---------------------------------------------------

    pub(crate) fn set_theme(&mut self, mode: &str) {
        self.settings.theme_id = mode.into();
        self.sync_theme();
        self.save_settings();
    }

    /// Re-resolves light/dark (mode or OS changed) and pushes it to the UI and phones.
    fn sync_theme(&mut self) {
        let dark = theme::is_dark(&self.settings.theme_id, self.ctx.system_theme());
        let target_dark = self.pal_fade.as_ref().map_or(self.pal.dark, |f| f.1.dark);
        if dark == target_dark {
            return;
        }
        // Cross-fade from whatever is on screen now; `animate_theme` drives it.
        self.pal_fade = Some((self.pal, theme::palette(dark), Instant::now()));
        self.settings.is_dark_mode = dark;
        self.hub.set_theme(if dark { "night" } else { "day" }, &self.settings.accent_id, dark);
    }

    pub(crate) fn set_language(&mut self, code: &str) {
        self.settings.language = code.into();
        self.i18n = Arc::new(I18n::new(code));
        *self.lang_shared.lock() = self.i18n.clone();
        self.save_settings();
    }

    /// Restart now, or confirm first if devices would be disconnected.
    pub(crate) fn request_restart(&mut self, reason: RestartReason) {
        if self.clients.is_empty() && self.txs.is_empty() {
            self.restart_server();
            if matches!(reason, RestartReason::Manual) {
                self.toast(self.t("restarted").to_string(), ToastKind::Success);
            }
        } else {
            self.modal = Some(Modal::Restart { reason });
        }
    }

    // ---- modals & overlays --------------------------------------------------

    fn modals(&mut self, ctx: &egui::Context) {
        let Some(mut modal) = self.modal.take() else { return };
        let p = self.pal;
        let mut keep = true;
        let frame = Frame::new().fill(p.card).stroke(Stroke::new(1.0, p.border)).corner_radius(14).inner_margin(16).shadow(ctx.global_style().visuals.window_shadow);
        let resp = egui::Modal::new(Id::new("modal")).frame(frame).backdrop_color(Color32::from_black_alpha(110)).show(ctx, |ui| {
            ui.set_width(320.0);
            match &mut modal {
                Modal::Restart { reason } => {
                    ui.heading(self.t("restart_confirmation_title"));
                    ui.label(widgets::sub(&p, self.t("restart_confirmation_message")));
                    ui.add_space(8.0);
                    let (ok, cancel) = buttons(ui, &p, self.t("proceed_and_restart"), self.t("cancel"), p.danger);
                    if ok {
                        self.restart_server();
                        if matches!(reason, RestartReason::Manual) {
                            self.toast(self.t("restarted").to_string(), ToastKind::Success);
                        }
                        keep = false;
                    }
                    if cancel {
                        // A cancelled port change reverts the field.
                        self.port_edit = self.settings.static_port.to_string();
                        keep = false;
                    }
                }
                Modal::DeleteTxn { id, history_only, has_file } => {
                    ui.heading(self.t("delete_transaction"));
                    ui.label(widgets::sub(&p, self.t("delete_history_confirm")));
                    if *has_file {
                        ui.add_space(4.0);
                        ui.checkbox(history_only, self.t("remove_from_history_only"));
                    }
                    ui.add_space(8.0);
                    let (ok, cancel) = buttons(ui, &p, self.t("delete"), self.t("cancel"), p.danger);
                    if ok {
                        self.delete_txn(*id, *has_file && !*history_only);
                        keep = false;
                    }
                    keep &= !cancel;
                }
                Modal::CancelClient { id, ip, device, file } => {
                    ui.heading(self.t("cancel_transfer"));
                    ui.label(format!("{device} · {file}"));
                    ui.label(widgets::sub(&p, self.t("this_will_end_transfer")));
                    ui.add_space(8.0);
                    let (ok, cancel) = buttons(ui, &p, self.t("stop"), self.t("cancel"), p.danger);
                    if ok {
                        self.hub.cancel_client_download(*id, ip);
                        keep = false;
                    }
                    keep &= !cancel;
                }
                Modal::CancelUpload { id, file } => {
                    ui.heading(self.t("cancel_transfer"));
                    ui.label(self.i18n.tf("stop_receiving", &[("filename", file)]));
                    ui.label(widgets::sub(&p, self.t("this_will_end_transfer")));
                    ui.add_space(8.0);
                    let (ok, cancel) = buttons(ui, &p, self.t("stop"), self.t("cancel"), p.danger);
                    if ok {
                        self.hub.cancel_transaction(*id);
                        keep = false;
                    }
                    keep &= !cancel;
                }
                Modal::WifiQr { ssid, password } => {
                    ui.vertical_centered(|ui| {
                        ui.heading(ssid.as_str());
                        ui.label(widgets::sub(&p, self.t("scan_to_connect_wifi")));
                        ui.add_space(8.0);
                        let payload = peerhop::net::wifi_qr_payload(ssid, password);
                        widgets::qr(ui, &mut self.qr, &payload, 240.0, None);
                        ui.add_space(8.0);
                        if widgets::secondary(ui, &p, self.t("cancel")).clicked() {
                            keep = false;
                        }
                    });
                }
                Modal::Review { stars } => {
                    ui.vertical_centered(|ui| {
                        ui.heading(self.t("rate_app"));
                        ui.label(widgets::sub(&p, self.t("review_prompt_hint")));
                        ui.add_space(8.0);
                        ui.horizontal(|ui| {
                            ui.add_space((ui.available_width() - 5.0 * 36.0) / 2.0);
                            for n in 1..=5u8 {
                                let filled = n <= *stars;
                                let glyph = icon::STAR;
                                let color = if filled { theme::hex(0xeab308) } else { p.sub_text };
                                let r = ui.add(egui::Label::new(RichText::new(glyph).size(28.0).color(color)).sense(egui::Sense::click()));
                                if r.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                                    *stars = n;
                                }
                            }
                        });
                        ui.add_space(8.0);
                    });
                    let (ok, later) = buttons(ui, &p, self.t("continue"), self.t("not_now"), p.accent);
                    if ok && *stars > 0 {
                        self.settings.has_reviewed = true;
                        self.save_settings();
                        if *stars >= 4 {
                            platform::request_review();
                        } else {
                            platform::open_url(super::FEEDBACK_URL);
                        }
                        keep = false;
                    }
                    keep &= !later;
                }
            }
        });
        if resp.should_close() && !matches!(modal, Modal::Review { .. }) {
            keep = false;
        }
        if keep && self.modal.is_none() {
            self.modal = Some(modal);
        }
    }

    pub(crate) fn delete_txn(&mut self, id: u64, delete_file: bool) {
        if let Some(path) = self.txs.iter().find(|t| t.id == id).and_then(|t| t.local_path()) {
            self.thumbs.forget(&path);
        }
        self.hub.delete_transaction(id, delete_file);
    }

    fn toasts(&mut self, ctx: &egui::Context) {
        self.toasts.retain(|t| t.at.elapsed() < Duration::from_millis(3200));
        if self.toasts.is_empty() {
            return;
        }
        let p = self.pal;
        egui::Area::new(Id::new("toasts")).anchor(Align2::CENTER_BOTTOM, vec2(0.0, -86.0)).order(egui::Order::Tooltip).interactable(false).show(ctx, |ui| {
            for t in &self.toasts {
                let (glyph, color) = match t.kind {
                    ToastKind::Info => (icon::INFO, p.sub_text),
                    ToastKind::Success => (icon::CHECK_CIRCLE, p.success),
                    ToastKind::Error => (icon::WARNING_CIRCLE, p.danger),
                };
                let age = t.at.elapsed().as_secs_f32();
                let enter = egui::emath::easing::cubic_out((age / 0.22).min(1.0));
                let exit = ((3.2 - age) / 0.35).clamp(0.0, 1.0);
                ui.scope(|ui| {
                ui.multiply_opacity(enter * exit);
                ui.add_space((1.0 - enter) * 12.0);
                Frame::new()
                    .fill(p.card)
                    .stroke(Stroke::new(1.0, p.border))
                    .corner_radius(12)
                    .inner_margin(Margin::symmetric(12, 7))
                    .shadow(egui::Shadow { offset: [0, 4], blur: 16, spread: 0, color: Color32::from_black_alpha(40) })
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(glyph).color(color).size(16.0));
                            ui.label(&t.text);
                        });
                    });
                });
                ui.add_space(6.0);
            }
        });
        ctx.request_repaint_after(Duration::from_millis(16));
    }

    fn drop_overlay(&self, ctx: &egui::Context) {
        if ctx.input(|i| i.raw.hovered_files.is_empty()) {
            return;
        }
        let p = self.pal;
        let rect = ctx.content_rect();
        let painter = ctx.layer_painter(egui::LayerId::new(egui::Order::Foreground, Id::new("drop")));
        painter.rect_filled(rect, CornerRadius::ZERO, p.bg.gamma_multiply(0.92));
        let pulse = (ctx.input(|i| i.time) as f32 * 4.0).sin() * 0.5 + 0.5;
        painter.rect_stroke(rect.shrink(14.0 + pulse * 4.0), CornerRadius::same(18), Stroke::new(2.0 + pulse, p.accent.gamma_multiply(0.6 + 0.4 * pulse)), egui::StrokeKind::Inside);
        painter.text(rect.center() - vec2(0.0, 22.0 + pulse * 6.0), Align2::CENTER_CENTER, icon::UPLOAD_SIMPLE, FontId::proportional(44.0), p.accent);
        ctx.request_repaint();
        painter.text(rect.center() + vec2(0.0, 26.0), Align2::CENTER_CENTER, self.t("drop_files"), FontId::proportional(18.0), p.text);
    }
}

fn buttons(ui: &mut Ui, p: &Palette, ok: &str, cancel: &str, ok_color: Color32) -> (bool, bool) {
    let mut res = (false, false);
    ui.horizontal(|ui| {
        let w = (ui.available_width() - 8.0) / 2.0;
        res.1 = ui.add_sized([w, 32.0], egui::Button::new(RichText::new(cancel).color(p.text)).fill(p.input).corner_radius(8)).clicked();
        res.0 = ui
            .add_sized([w, 32.0], egui::Button::new(widgets::bold(ok, 13.5).color(theme::on(ok_color))).fill(ok_color).corner_radius(8))
            .clicked();
    });
    res.1 |= ui.input(|i| i.key_pressed(Key::Escape));
    res
}

/// Vertical scroll area spanning the full width (scrollbar on the outer edge),
/// with the content padded inside it.
fn edge_scroll(ui: &mut Ui, add: impl FnOnce(&mut Ui)) {
    egui::ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
        Frame::new().inner_margin(Margin { left: 12, right: 12, top: 0, bottom: 16 }).show(ui, |ui| {
            ui.set_width(ui.available_width());
            add(ui);
        });
    });
}

fn shared_from(s: &Settings) -> Shared {
    Shared {
        text_transfer_enabled: s.text_transfer_enabled,
        security_enabled: s.security_enabled,
        theme_id: if s.is_dark_mode { "night" } else { "day" }.into(),
        accent_id: s.accent_id.clone(),
        is_dark: s.is_dark_mode,
        desktop_name: s.desktop_device_name.clone(),
        download_dir: PathBuf::from(&s.download_path),
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Save a copied image (screenshot, browser "Copy image") as a PNG to share.
fn clipboard_image_to_file() -> Option<PathBuf> {
    let img = arboard::Clipboard::new().ok()?.get_image().ok()?;
    let buf = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.bytes.into_owned())?;
    let path = peerhop::util::unique_path(&std::env::temp_dir(), &format!("pasted_{}.png", chrono::Local::now().format("%Y%m%d_%H%M%S")));
    buf.save(&path).ok()?;
    Some(path)
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.pump(&ctx);
        if self.settings.theme_id == "system" {
            self.sync_theme();
        }
        self.animate_theme();
        let (slide, slide_dir) = self.tab_slide();
        if slide < 1.0 {
            ctx.request_repaint();
        }
        let p = self.pal;
        let width = ctx.content_rect().width();
        self.wide = width >= SINGLE_PANEL_BELOW;
        let side_width = (width * 0.4).clamp(SIDE_MIN, SIDE_MAX);

        if self.wide {
            egui::Panel::right("side")
                .exact_size(side_width)
                .resizable(false)
                // No horizontal panel margin: the scrollbar sits on the window edge,
                // and the padding lives inside the scrolled content instead.
                .frame(Frame::new().fill(p.panel).inner_margin(Margin { left: 0, right: 0, top: 10, bottom: 0 }))
                .show(ui, |ui| {
                    let items = [self.t("connect").to_string(), self.t("settings").to_string()];
                    let refs: Vec<&str> = items.iter().map(String::as_str).collect();
                    let before = self.side_tab;
                    Frame::new().inner_margin(Margin::symmetric(12, 0)).show(ui, |ui| {
                        if widgets::segmented(ui, &p, &mut self.side_tab, &refs) {
                            self.tab_switch = Some((Instant::now(), if self.side_tab > before { 1.0 } else { -1.0 }));
                        }
                    });
                    ui.add_space(6.0);
                    widgets::slide_in(ui, slide, slide_dir, |ui| {
                        edge_scroll(ui, |ui| if self.side_tab == 0 { self.connect_panel(ui) } else { self.settings_panel(ui) })
                    });
                });
            egui::CentralPanel::default().frame(Frame::new().fill(p.bg)).show(ui, |ui| self.chat_panel(ui));
        } else {
            egui::Panel::top("tabs").frame(Frame::new().fill(p.panel).inner_margin(Margin::symmetric(10, 8))).show(ui, |ui| {
                let items = [self.t("chat").to_string(), self.t("connect").to_string(), self.t("settings").to_string()];
                let refs: Vec<&str> = items.iter().map(String::as_str).collect();
                let mut idx = self.tab as usize;
                if widgets::segmented(ui, &p, &mut idx, &refs) {
                    self.tab_switch = Some((Instant::now(), if idx > self.tab as usize { 1.0 } else { -1.0 }));
                    self.tab = [Tab::Chat, Tab::Connect, Tab::Settings][idx];
                }
            });
            match self.tab {
                Tab::Chat => {
                    egui::CentralPanel::default().frame(Frame::new().fill(p.bg)).show(ui, |ui| widgets::slide_in(ui, slide, slide_dir, |ui| self.chat_panel(ui)));
                }
                tab => {
                    egui::CentralPanel::default().frame(Frame::new().fill(p.bg).inner_margin(Margin { left: 0, right: 0, top: 6, bottom: 0 })).show(ui, |ui| {
                        widgets::slide_in(ui, slide, slide_dir, |ui| {
                            edge_scroll(ui, |ui| if tab == Tab::Connect { self.connect_panel(ui) } else { self.settings_panel(ui) })
                        });
                    });
                }
            }
        }

        self.drop_overlay(&ctx);
        self.modals(&ctx);
        self.toasts(&ctx);
        if self.restarting || self.zipping > 0 || self.txs.iter().any(|t| !t.status.is_finished()) {
            // Keep spinners and speed readouts moving even between hub events.
            ctx.request_repaint_after(Duration::from_millis(500));
        }
    }
}

impl Drop for App {
    fn drop(&mut self) {
        if let Some(mut s) = self.server.take() {
            s.stop();
        }
    }
}
