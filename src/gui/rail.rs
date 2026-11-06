//! Telegram-style sidebar: one round avatar per conversation.
//!
//! Conversations:
//! - Public QR: phones and browsers that opened the QR link (HTTP server, broadcast).
//! - PeerHop desktops found via web.peerhop.in, keyed by device name so a saved
//!   desktop keeps its place while offline (its peer id changes every session).
//! - Browsers on web.peerhop.in, by peer id.
//! - Temporary groups: several desktops/browsers that receive the same files.

use eframe::egui;
use egui::{Align2, Color32, CornerRadius, FontId, Id, Rect, Sense, Stroke, Ui, pos2, vec2};
use egui_phosphor::regular as icon;
use std::collections::HashSet;
use std::time::Instant;

use peerhop::p2p::{LinkStatus, peer_key};
use peerhop::store::Transaction;

use super::app::{App, Sheet, ToastKind};
use super::widgets;

pub const RAIL_W: f32 = 72.0;
/// Sidebar width when the window is wide enough to show names and previews.
pub const RAIL_WIDE_W: f32 = 218.0;
/// Window width from which the sidebar expands.
pub const WIDE_FROM: f32 = 688.0;
const AVATAR: f32 = 46.0;
const ROW_H: f32 = 58.0;

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub enum Conv {
    Public,
    /// A browser on web.peerhop.in (peer id).
    Peer(String),
    /// A PeerHop desktop, by device name.
    Desktop(String),
    Group(u32),
}

/// A multi-send: several devices that receive the same files (lives until the
/// app closes). Named after its devices, so it needs no name of its own.
pub struct Group {
    pub id: u32,
    /// Peer ids.
    pub members: Vec<String>,
}

pub fn group_key(id: u32) -> String {
    format!("group:{id}")
}

/// What we last knew about a web peer, kept after it goes away so its
/// conversation can still be labelled.
#[derive(Clone)]
pub struct Known {
    pub name: String,
    pub app: bool,
    pub kind: &'static str,
    pub label: String,
}

pub struct RailItem {
    pub conv: Conv,
    pub name: String,
    pub sub: String,
    /// Glyph inside the avatar instead of initials.
    pub glyph: Option<&'static str>,
    pub color: Color32,
    /// Platform marker in the badge corner.
    pub badge: &'static str,
    pub online: bool,
}

impl App {
    /// Remember names/devices of everyone currently in the room.
    pub(crate) fn remember_peers(&mut self) {
        for p in self.web.peers() {
            self.known.insert(p.id.clone(), Known { name: p.name.clone(), app: p.device.app, kind: p.device.icon_kind(), label: p.device.label.clone() });
        }
    }

    fn online_ids(&self) -> HashSet<String> {
        self.web.peers().into_iter().map(|p| p.id).collect()
    }

    /// Peer keys whose transfers belong to `conv`.
    pub(crate) fn conv_keys(&self, conv: &Conv) -> Vec<String> {
        match conv {
            Conv::Public => Vec::new(),
            Conv::Peer(id) => vec![peer_key(id)],
            Conv::Desktop(name) => self.known.iter().filter(|(_, k)| k.app && &k.name == name).map(|(id, _)| peer_key(id)).collect(),
            Conv::Group(g) => vec![group_key(*g)],
        }
    }

    pub(crate) fn in_conv(conv: &Conv, keys: &[String], t: &Transaction) -> bool {
        match conv {
            Conv::Public => !t.web,
            Conv::Group(_) => t.web && keys.iter().any(|k| *k == t.client_ip),
            _ => t.web && (keys.iter().any(|k| *k == t.client_ip) || t.client_progress.keys().any(|k| keys.contains(k))),
        }
    }

    /// Online peer ids a send in `conv` goes to.
    pub(crate) fn conv_targets(&self, conv: &Conv) -> Vec<String> {
        let online = self.online_ids();
        match conv {
            Conv::Public => Vec::new(),
            Conv::Peer(id) => online.contains(id).then(|| id.clone()).into_iter().collect(),
            Conv::Desktop(name) => {
                let mut ids: Vec<&String> = self.known.iter().filter(|(id, k)| k.app && &k.name == name && online.contains(*id)).map(|(id, _)| id).collect();
                ids.sort();
                ids.first().map(|id| vec![(*id).clone()]).unwrap_or_default()
            }
            Conv::Group(g) => self.groups.iter().find(|x| x.id == *g).map(|x| x.members.iter().filter(|m| online.contains(*m)).cloned().collect()).unwrap_or_default(),
        }
    }

    /// Conversation key stored on transfers sent from `conv`.
    pub(crate) fn conv_send_key(conv: &Conv, targets: &[String]) -> String {
        match conv {
            Conv::Group(g) => group_key(*g),
            _ => targets.first().map(|t| peer_key(t)).unwrap_or_default(),
        }
    }

    pub(crate) fn rail_items(&self) -> Vec<RailItem> {
        let p = self.pal;
        let online = self.online_ids();
        // Peer keys that have any history (so they stay listed after leaving).
        let mut hist: HashSet<&str> = HashSet::new();
        for t in self.txs.iter().filter(|t| t.web) {
            hist.insert(&t.client_ip);
            hist.extend(t.client_progress.keys().map(String::as_str));
        }
        let has_hist = |id: &str| hist.contains(peer_key(id).as_str());

        let n = self.clients.len();
        let mut items = vec![RailItem {
            conv: Conv::Public,
            name: self.t("public_title").to_string(),
            sub: if n > 0 { self.i18n.tf("devices_n", &[("n", &n.to_string())]) } else { self.t("public_hint").to_string() },
            glyph: Some(icon::QR_CODE),
            color: p.accent,
            badge: "",
            online: self.server_ready(),
        }];

        // Desktops: saved first (in saved order), then others seen this session.
        let mut desk: Vec<String> = self.settings.saved_desktops.clone();
        let mut others: Vec<String> = self.known.iter().filter(|(id, k)| k.app && (online.contains(*id) || has_hist(id))).map(|(_, k)| k.name.clone()).collect();
        others.sort_by_key(|n| n.to_lowercase());
        for name in others {
            if !desk.contains(&name) {
                desk.push(name);
            }
        }
        for name in desk {
            let live = self.known.iter().find(|(id, k)| k.app && k.name == name && online.contains(*id));
            let saved = self.settings.saved_desktops.contains(&name);
            let sub = match live {
                Some((_, k)) => format!("{} · {}", self.t("online"), k.label),
                None if saved => format!("{} · {}", self.t("offline"), self.t("saved")),
                None => self.t("offline").to_string(),
            };
            items.push(RailItem { conv: Conv::Desktop(name.clone()), color: widgets::name_color(&name), name, sub, glyph: None, badge: "peerhop", online: live.is_some() });
        }

        // Browsers.
        let mut web: Vec<(&String, &Known)> = self.known.iter().filter(|(id, k)| !k.app && (online.contains(*id) || has_hist(id))).collect();
        web.sort_by(|a, b| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()).then(a.0.cmp(b.0)));
        for (id, k) in web {
            let live = online.contains(id);
            let sub = if live { format!("{} · {}", self.t("online"), k.label) } else { self.t("offline").to_string() };
            items.push(RailItem { conv: Conv::Peer(id.clone()), name: k.name.clone(), sub, glyph: None, color: widgets::name_color(&k.name), badge: k.kind, online: live });
        }

        for g in &self.groups {
            let live = g.members.iter().filter(|m| online.contains(*m)).count();
            let sub = self.i18n.tf("members_n", &[("n", &g.members.len().to_string()), ("m", &live.to_string())]);
            let name = self.group_label(g);
            items.push(RailItem { conv: Conv::Group(g.id), color: widgets::name_color(&format!("multi{}", g.id)), name, sub, glyph: Some(icon::SHARE_NETWORK), badge: "group", online: live > 0 });
        }
        items
    }

    /// "AL, Pixel +2": a multi-send is named after the devices in it.
    pub(crate) fn group_label(&self, g: &Group) -> String {
        let names: Vec<String> = g.members.iter().map(|m| self.known.get(m).map(|k| k.name.clone()).unwrap_or_else(|| self.t("web_device").to_string())).collect();
        match names.len() {
            0 => self.t("new_group").to_string(),
            1 | 2 => names.join(", "),
            n => format!("{}, {} +{}", names[0], names[1], n - 2),
        }
    }

    /// Display name of a conversation (for headers).
    pub(crate) fn conv_item(&self, conv: &Conv) -> Option<RailItem> {
        self.rail_items().into_iter().find(|i| &i.conv == conv)
    }

    /// Incoming messages not yet looked at, plus offers waiting for an answer.
    pub(crate) fn unread(&self, conv: &Conv) -> usize {
        let keys = self.conv_keys(conv);
        let seen = self.seen.get(conv).copied().unwrap_or(0);
        let msgs = self.txs.iter().filter(|t| t.id > seen && !t.is_outgoing() && Self::in_conv(conv, &keys, t)).count();
        msgs + self.conv_prompts(conv, &keys).len()
    }

    pub(crate) fn conv_prompts(&self, conv: &Conv, keys: &[String]) -> Vec<peerhop::p2p::Prompt> {
        if matches!(conv, Conv::Public | Conv::Group(_)) {
            return Vec::new();
        }
        self.web.prompts().into_iter().filter(|pr| keys.contains(&peer_key(&pr.peer))).collect()
    }

    /// Last message of a conversation for the expanded sidebar: (glyph prefix, text, time).
    pub(crate) fn last_preview(&self, conv: &Conv) -> Option<(String, String, String)> {
        let keys = self.conv_keys(conv);
        let t = self.txs.iter().rev().find(|t| Self::in_conv(conv, &keys, t))?;
        let time = t.timestamp.with_timezone(&chrono::Local).format("%H:%M").to_string();
        let you = if t.is_outgoing() { format!("{}: ", self.t("you")) } else { String::new() };
        Some(match t.kind {
            peerhop::store::Kind::Text => (you, t.text_content.lines().next().unwrap_or("").to_string(), time),
            peerhop::store::Kind::File => (format!("{you}{} ", icon::FILE), t.filename.clone(), time),
        })
    }

    pub(crate) fn select(&mut self, conv: Conv) {
        if conv == self.conv {
            return;
        }
        let items = self.rail_items();
        let idx = |c: &Conv| items.iter().position(|i| &i.conv == c).unwrap_or(0) as f32;
        let dir = if idx(&conv) >= idx(&self.conv) { 1.0 } else { -1.0 };
        self.conv_switch = Some((Instant::now(), dir));
        self.conv = conv;
        self.draft.clear();
        self.text_open = false;
    }

    pub(crate) fn rail(&mut self, ui: &mut Ui) {
        let p = self.pal;
        // Bottom: new group + web.peerhop.in status.
        egui::Panel::bottom("rail_bottom").frame(egui::Frame::new().fill(p.panel).inner_margin(egui::Margin { left: 0, right: 0, top: 6, bottom: 10 })).show_separator_line(false).show(ui, |ui| {
            let x = self.rail_x;
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing.y = 6.0;
                if rail_button(ui, &p, x, icon::SHARE_NETWORK, self.t("new_group"), self.t("new_group_hint"), None).clicked() {
                    self.open_sheet(Sheet::NewGroup { picked: Vec::new() });
                }
                let (dot, tip) = match (self.web.status(), self.settings.web_visible) {
                    (LinkStatus::NoRoom, _) => (p.danger, self.t("web_offline")),
                    (LinkStatus::Starting | LinkStatus::Connecting, _) => (super::theme::hex(0xf59e0b), self.t("web_connecting")),
                    (LinkStatus::Online, true) => (p.success, self.t("web_visible_on")),
                    (LinkStatus::Online, false) => (p.sub_text, self.t("web_visible_off")),
                };
                let tip = tip.to_string();
                // A switch: the whole row toggles it; the globe's dot shows the link status.
                let resp = rail_button(ui, &p, x, icon::GLOBE_HEMISPHERE_WEST, self.t("web_visible"), &tip, Some(dot));
                let on = ui.ctx().animate_bool_responsive(resp.id.with("switch"), self.settings.web_visible);
                if x > 0.01 {
                    let r = resp.rect;
                    let sw = Rect::from_center_size(pos2(r.right() - 34.0, r.center().y), vec2(34.0, 20.0));
                    ui.scope(|ui| {
                        ui.multiply_opacity(x);
                        widgets::paint_switch(ui.painter(), sw, on, &p);
                    });
                }
                if resp.clicked() {
                    let v = !self.settings.web_visible;
                    self.settings.web_visible = v;
                    self.web.set_visible(v);
                    self.save_settings();
                }
            });
        });

        egui::CentralPanel::default().frame(egui::Frame::new().fill(p.panel).inner_margin(egui::Margin { left: 0, right: 0, top: 8, bottom: 0 })).show(ui, |ui| {
            ui.vertical(|ui| {
                // Icon only, at every width; the name shows as a tooltip.
                let gear = ui.allocate_ui_with_layout(vec2(RAIL_W, 44.0), egui::Layout::top_down(egui::Align::Min), |ui| rail_button(ui, &p, 0.0, icon::GEAR_SIX, self.t("settings"), "", None)).inner;
                if gear.clicked() {
                    self.open_sheet(Sheet::Settings);
                }
            });
            ui.add_space(4.0);
            let items = self.rail_items();
            egui::ScrollArea::vertical().auto_shrink(false).scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden).show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                let origin = ui.min_rect().top();
                let mut sel_y = None;
                for (i, item) in items.iter().enumerate() {
                    if i == 1 {
                        // Hairline between the public room and direct conversations.
                        let (r, _) = ui.allocate_exact_size(vec2(ui.available_width(), 9.0), Sense::hover());
                        let cx = r.left() + RAIL_W / 2.0;
                        ui.painter().hline(cx - 14.0..=egui::lerp(cx + 14.0..=r.right() - 14.0, self.rail_x), r.center().y, Stroke::new(1.0, p.border));
                    }
                    let rect = self.rail_entry(ui, item);
                    if item.conv == self.conv {
                        sel_y = Some(rect.center().y - origin);
                    }
                }
                // Selection pill on the left edge glides to the active conversation.
                if let Some(y) = sel_y {
                    let ay = ui.ctx().animate_value_with_time(Id::new("rail_pill_y"), y, 0.22);
                    let h = ui.ctx().animate_value_with_time(Id::new("rail_pill_h"), if (ay - y).abs() > 2.0 { 18.0 } else { 34.0 }, 0.14);
                    let r = Rect::from_center_size(pos2(ui.max_rect().left() + 1.5, origin + ay), vec2(5.0, h));
                    ui.painter().rect_filled(r, CornerRadius::same(3), p.accent);
                }
                ui.add_space(8.0);
            });
        });
    }

    fn rail_entry(&mut self, ui: &mut Ui, item: &RailItem) -> Rect {
        let p = self.pal;
        let x = self.rail_x;
        let (row, resp) = ui.allocate_exact_size(vec2(ui.available_width(), ROW_H), Sense::click());
        let id = Id::new(("rail", &item.conv));
        let selected = item.conv == self.conv;
        let hover = ui.ctx().animate_bool_with_time(id.with("h"), resp.hovered(), 0.12);
        let sel = ui.ctx().animate_bool_with_time(id.with("s"), selected, 0.2);
        let press = ui.ctx().animate_bool_with_time(id.with("p"), resp.is_pointer_button_down_on(), 0.08);
        // Pop in the first time this conversation shows up.
        let born = *self.rail_born.entry(item.conv.clone()).or_insert_with(Instant::now);
        let pop = egui::emath::easing::back_out((born.elapsed().as_secs_f32() / 0.35).min(1.0));
        if pop < 1.0 {
            ui.ctx().request_repaint();
        }
        let scale = (0.4 + 0.6 * pop) * (1.0 + 0.06 * hover * (1.0 - x) - 0.06 * press);
        let painter = ui.painter();
        // Expanded: the whole row highlights instead of the avatar growing.
        if x > 0.0 {
            let bg = Rect::from_min_max(pos2(row.left() + 8.0, row.top() + 2.0), pos2(row.right() - 8.0, row.bottom() - 2.0));
            let fill = widgets::lerp_color(p.icon_bg.gamma_multiply(0.8 * hover), p.accent_soft, sel);
            painter.rect_filled(bg, CornerRadius::same(12), fill.gamma_multiply(x));
        }
        let rect = Rect::from_center_size(pos2(row.left() + RAIL_W / 2.0, row.center().y), egui::Vec2::splat(AVATAR * scale));

        // Waiting offers make the avatar breathe until answered.
        let prompts = self.conv_prompts(&item.conv, &self.conv_keys(&item.conv)).len();
        if prompts > 0 {
            let t = (ui.input(|i| i.time) as f32 * 2.2).sin() * 0.5 + 0.5;
            painter.circle_stroke(rect.center(), AVATAR / 2.0 + 3.0 + 2.0 * t, Stroke::new(2.0, p.accent.gamma_multiply(0.35 + 0.5 * t)));
            ui.ctx().request_repaint();
        }

        let fill = if item.online || matches!(item.conv, Conv::Group(_)) { item.color } else { widgets::lerp_color(item.color, p.icon_bg, 0.6) };
        let label = item.glyph.map(str::to_string).unwrap_or_else(|| widgets::initials(&item.name));
        widgets::face(painter, rect, fill.gamma_multiply(pop.min(1.0).max(0.0)), &label, sel);

        // Corner: unread count wins, else the platform / device-count marker.
        let corner = rect.right_bottom() - vec2(5.0, 5.0) * scale;
        let unread = if selected { 0 } else { self.unread(&item.conv) };
        let ub = ui.ctx().animate_bool_with_time(id.with("u"), unread > 0, 0.18);
        // Collapsed: unread sits on the avatar corner; expanded: on the right of the row.
        let on_corner = ub * (1.0 - x);
        if unread > 0 || ub > 0.0 {
            let n = if unread > 0 { unread } else { 1 };
            widgets::count_badge(painter, corner, n, p.accent, p.panel, egui::emath::easing::back_out(on_corner) * scale.min(1.0));
        }
        if on_corner < 1.0 {
            let s = (1.0 - on_corner) * scale.min(1.0);
            match &item.conv {
                Conv::Public => {
                    let n = self.clients.len();
                    if n > 0 {
                        widgets::count_badge(painter, corner, n, p.success, p.panel, s);
                    }
                }
                Conv::Group(g) => {
                    let live = self.groups.iter().find(|x| x.id == *g).map_or(0, |x| self.conv_targets(&Conv::Group(x.id)).len());
                    if live > 0 {
                        widgets::count_badge(painter, corner, live, p.success, p.panel, s);
                    }
                }
                _ => {
                    let (bg, fg) = if item.online { (p.success, Color32::WHITE) } else { (p.icon_bg, p.icon_text) };
                    widgets::glyph_badge(painter, corner, widgets::platform_icon(item.badge), bg, fg, p.panel, s);
                }
            }
        }

        // Expanded details: name, last message (or status), time and unread count.
        if x > 0.01 {
            let painter = ui.painter().with_clip_rect(row.intersect(ui.clip_rect()));
            let tx = rect.right() + 12.0 + (1.0 - x) * 16.0;
            let right = row.right() - 18.0;
            let a = x * x;
            let preview = self.last_preview(&item.conv);
            let mut name_right = right;
            if let Some((_, _, time)) = &preview {
                let g = painter.layout_no_wrap(time.clone(), FontId::proportional(11.5), p.sub_text);
                name_right -= g.size().x + 8.0;
                painter.galley(pos2(right - g.size().x, row.center().y - 17.0), g, p.sub_text.gamma_multiply(a));
            }
            let name = widgets::fit_text(&painter, &item.name, FontId::new(14.0, super::theme::semibold()), p.text, name_right - tx);
            painter.galley(pos2(tx, row.center().y - 19.0), name, p.text.gamma_multiply(a));
            let mut line_right = right;
            if unread > 0 || ub > 0.0 {
                let n = if unread > 0 { unread } else { 1 };
                let at = pos2(right - 9.0, row.center().y + 10.0);
                widgets::count_badge(&painter, at, n, p.accent, p.panel, egui::emath::easing::back_out(ub) * x);
                line_right -= 30.0;
            }
            let (text, color) = match preview {
                Some((glyph, text, _)) if prompts == 0 => (format!("{glyph}{text}"), p.sub_text),
                _ if prompts > 0 => (self.t("wants_to_send").to_string(), p.accent),
                _ => (item.sub.clone(), if item.online { p.accent } else { p.sub_text }),
            };
            let font = FontId::proportional(12.5);
            let g = widgets::fit_text(&painter, &text, font, color, line_right - tx);
            painter.galley(pos2(tx, row.center().y + 2.0), g, color.gamma_multiply(a));
        }

        if hover > 0.0 && hover < 1.0 || sel > 0.0 && sel < 1.0 || press > 0.0 && press < 1.0 {
            ui.ctx().request_repaint();
        }
        // Collapsed rows explain themselves on hover; expanded ones already show it all.
        let mut resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
        if x < 0.5 {
            resp = resp.on_hover_ui(|ui| {
                ui.label(widgets::bold(&item.name, 13.5).color(p.text));
                ui.label(widgets::sub(&p, &item.sub));
            });
        }
        if resp.clicked() {
            self.select(item.conv.clone());
        }
        let conv = item.conv.clone();
        resp.context_menu(|ui| self.conv_menu(ui, &conv));
        row
    }

    /// Right-click menu shared by the sidebar and the chat header.
    pub(crate) fn conv_menu(&mut self, ui: &mut Ui, conv: &Conv) {
        if !matches!(conv, Conv::Public) && ui.button(format!("{}  {}", icon::INFO, self.t("info"))).clicked() {
            self.select(conv.clone());
            self.open_sheet(Sheet::Info(conv.clone()));
            ui.close();
        }
        match conv {
            Conv::Public => {
                if ui.button(format!("{}  {}", icon::QR_CODE, self.t("connect"))).clicked() {
                    self.select(conv.clone());
                    self.open_sheet(Sheet::Public);
                    ui.close();
                }
            }
            Conv::Desktop(name) => {
                let saved = self.settings.saved_desktops.contains(name);
                let label = if saved { format!("{}  {}", icon::BOOKMARK_SIMPLE, self.t("unsave")) } else { format!("{}  {}", icon::BOOKMARK_SIMPLE, self.t("save_contact")) };
                if ui.button(label).clicked() {
                    self.toggle_saved(name);
                    ui.close();
                }
            }
            Conv::Group(g) => {
                if ui.button(format!("{}  {}", icon::TRASH, self.t("delete_group"))).clicked() {
                    self.delete_group(*g);
                    ui.close();
                }
            }
            Conv::Peer(_) => {}
        }
    }

    pub(crate) fn toggle_saved(&mut self, name: &str) {
        if let Some(i) = self.settings.saved_desktops.iter().position(|n| n == name) {
            self.settings.saved_desktops.remove(i);
            self.toast(format!("{} · {name}", self.t("unsave")), ToastKind::Info);
        } else {
            self.settings.saved_desktops.push(name.to_string());
            self.toast(format!("{} · {name}", self.t("saved")), ToastKind::Success);
        }
        self.save_settings();
    }

    pub(crate) fn delete_group(&mut self, id: u32) {
        self.groups.retain(|g| g.id != id);
        if self.conv == Conv::Group(id) {
            self.select(Conv::Public);
        }
        self.close_sheet();
    }
}

/// Round icon button for the sidebar (menu, new group, visibility).
fn rail_button(ui: &mut Ui, p: &super::theme::Palette, x: f32, glyph: &str, title: &str, tip: &str, dot: Option<Color32>) -> egui::Response {
    let (row, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 44.0), Sense::click());
    let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.12);
    let press = ui.ctx().animate_bool_with_time(resp.id.with("p"), resp.is_pointer_button_down_on(), 0.08);
    let r = 19.0 * (1.0 + 0.05 * h - 0.08 * press);
    let c = pos2(row.left() + RAIL_W / 2.0, row.center().y);
    if h > 0.0 {
        // Collapsed: round hover; expanded: the hover becomes a full-width pill.
        let pill = Rect::from_min_max(pos2(c.x - r, c.y - r), pos2(egui::lerp(c.x + r..=row.right() - 8.0, x), c.y + r));
        ui.painter().rect_filled(pill, CornerRadius::same(r as u8), p.icon_bg.gamma_multiply(h));
    }
    if x > 0.01 {
        let font = FontId::proportional(13.5);
        let g = widgets::fit_text(ui.painter(), title, font, p.text, row.right() - c.x - 96.0);
        ui.painter().galley(pos2(c.x + 30.0 + (1.0 - x) * 12.0, c.y - g.size().y / 2.0), g, p.text.gamma_multiply(x * x));
    }
    ui.painter().text(c, Align2::CENTER_CENTER, glyph, FontId::proportional(21.0), widgets::lerp_color(p.sub_text, p.text, h));
    if let Some(d) = dot {
        let at = c + vec2(9.0, 8.0);
        ui.painter().circle_filled(at, 5.0, p.panel);
        ui.painter().circle_filled(at, 3.5, d);
    }
    if (h > 0.0 && h < 1.0) || (press > 0.0 && press < 1.0) {
        ui.ctx().request_repaint();
    }
    let title = title.to_string();
    let tip = tip.to_string();
    let pal = *p;
    if x >= 0.5 && tip.is_empty() {
        return resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    }
    resp.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_ui(move |ui| {
        ui.label(widgets::bold(&title, 13.5).color(pal.text));
        if !tip.is_empty() {
            ui.label(widgets::sub(&pal, &tip));
        }
    })
}
