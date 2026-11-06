//! Conversation view (Telegram-style): header, message stream, composer.

use eframe::egui;
use egui::{Align, Align2, Color32, CornerRadius, FontId, Frame, Id, Key, Layout, Margin, Modifiers, Rect, RichText, Sense, Stroke, Ui, pos2, vec2};
use egui_phosphor::regular as icon;
use std::path::{Path, PathBuf};

use peerhop::store::{Kind, Status, Transaction};
use peerhop::util::{format_bytes, format_speed};

use super::app::{App, Modal, Sheet, ToastKind};
use super::rail::Conv;
use super::theme;
use super::thumbs;
use super::widgets::{self, Tick};

const COMPOSER_ID: &str = "composer";
/// How long a deleted message takes to fade and collapse.
const LEAVE_SECS: f32 = 0.28;

fn file_icon(name: &str) -> &'static str {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "heic" => icon::FILE_IMAGE,
        "mp4" | "mkv" | "mov" | "avi" | "webm" => icon::FILE_VIDEO,
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" => icon::FILE_AUDIO,
        "zip" | "rar" | "7z" | "tar" | "gz" => icon::FILE_ZIP,
        "pdf" => icon::FILE_PDF,
        "txt" | "md" | "csv" | "log" | "json" => icon::FILE_TEXT,
        "doc" | "docx" => icon::FILE_DOC,
        "apk" | "exe" | "msi" => icon::PACKAGE,
        _ => icon::FILE,
    }
}

fn time_of(t: &Transaction) -> String {
    t.timestamp.with_timezone(&chrono::Local).format("%H:%M").to_string()
}

fn eta(bytes: u64, total: u64, bps: f64) -> Option<String> {
    if bps <= 1.0 || total <= bytes {
        return None;
    }
    let s = ((total - bytes) as f64 / bps).ceil() as u64;
    Some(if s >= 3600 { format!("{}h {}m", s / 3600, s % 3600 / 60) } else if s >= 60 { format!("{}m {}s", s / 60, s % 60) } else { format!("{s}s") })
}

enum Action {
    Open(PathBuf),
    OpenWith(PathBuf),
    Reveal(PathBuf),
    Copy(String),
    Delete { id: u64, has_file: bool, outgoing: bool, finished_badly: bool },
    CancelClient { id: u64, ip: String, file: String },
    CancelUpload { id: u64, file: String },
    Respond { peer: String, job: u32, accept: bool },
}

/// Aggregate of transfers running in a conversation (header status + top bar).
#[derive(Default)]
struct Activity {
    done: u64,
    total: u64,
    bps: f64,
    sending: bool,
    receiving: bool,
}

impl App {
    /// Per-device keys shown under an outgoing file in this conversation.
    fn shown_keys(&self, t: &Transaction, keys: &[String]) -> Vec<String> {
        match self.conv {
            Conv::Peer(_) | Conv::Desktop(_) => t.client_progress.keys().filter(|k| keys.contains(k)).cloned().collect(),
            _ => t.client_progress.keys().cloned().collect(),
        }
    }

    fn activity(&self, keys: &[String]) -> Activity {
        let mut a = Activity::default();
        for t in self.txs.iter().filter(|t| t.kind == Kind::File && Self::in_conv(&self.conv, keys, t)) {
            if t.is_outgoing() {
                for k in self.shown_keys(t, keys) {
                    let st = t.client_status.get(&k).copied().unwrap_or(Status::InProgress);
                    if st == Status::InProgress {
                        a.sending = true;
                        a.done += t.client_bytes.get(&k).copied().unwrap_or(0);
                        a.total += t.file_size;
                        a.bps += self.speed(t.id, &k);
                    }
                }
            } else if t.status == Status::InProgress {
                a.receiving = true;
                a.done += t.bytes_transferred;
                a.total += t.file_size;
                a.bps += self.speed(t.id, "");
            }
        }
        a
    }

    pub(crate) fn chat_view(&mut self, ui: &mut Ui) {
        let p = self.pal;
        let conv = self.conv.clone();
        let keys = self.conv_keys(&conv);
        let act = self.activity(&keys);
        self.chat_header(ui, &conv, &act);

        egui::Panel::bottom("composer")
            .frame(Frame::new().fill(p.panel).inner_margin(Margin::same(10)))
            .show_separator_line(false)
            .show(ui, |ui| self.composer(ui, &conv));

        egui::CentralPanel::default().frame(Frame::new().fill(p.bg)).show(ui, |ui| {
            // Hairline above the composer.
            let r = ui.max_rect();
            ui.painter().hline(r.x_range(), r.bottom(), Stroke::new(1.0, p.border));

            self.leaving.retain(|(_, at)| at.elapsed().as_secs_f32() < LEAVE_SECS);
            let prompts = self.conv_prompts(&conv, &keys);
            let zipping = self.zipping.iter().filter(|c| **c == conv).count();
            let live: Vec<Transaction> = self.txs.iter().filter(|t| Self::in_conv(&conv, &keys, t)).cloned().collect();
            let leaving: Vec<(Transaction, std::time::Instant)> = self.leaving.iter().filter(|(t, _)| Self::in_conv(&conv, &keys, t)).cloned().collect();
            if live.is_empty() && leaving.is_empty() && prompts.is_empty() && zipping == 0 {
                self.empty_state(ui, &conv);
                return;
            }

            let mut actions = Vec::new();
            let view_h = ui.available_height();
            let content_id = Id::new(("chat_content_h", &conv));
            let prev_h: f32 = ui.ctx().data(|d| d.get_temp(content_id)).unwrap_or(view_h);
            egui::ScrollArea::vertical().stick_to_bottom(true).auto_shrink(false).show(ui, |ui| {
                ui.add_space((view_h - prev_h).max(0.0) + 6.0);
                let top = ui.cursor().top();
                // The QR stays above the public room's messages so more phones can join.
                if matches!(conv, Conv::Public) {
                    self.inline_connect_card(ui);
                }
                let mut rows: Vec<(&Transaction, Option<f32>)> = live.iter().map(|t| (t, None)).collect();
                rows.extend(leaving.iter().map(|(t, at)| (t, Some(1.0 - at.elapsed().as_secs_f32() / LEAVE_SECS))));
                rows.sort_by_key(|(t, _)| t.id);
                let mut animating = !leaving.is_empty();
                let mut last_day = None;
                for i in 0..rows.len() {
                    let (t, gone) = rows[i];
                    let day = t.timestamp.with_timezone(&chrono::Local).date_naive();
                    if last_day != Some(day) {
                        last_day = Some(day);
                        self.date_pill(ui, day);
                    }
                    // Consecutive messages from one sender form a group: one name, one tail.
                    let first = i == 0 || {
                        let prev = rows[i - 1].0;
                        prev.sender_id != t.sender_id || (t.timestamp - prev.timestamp).num_minutes() >= 5
                    };
                    let top = if first && i > 0 { 6 } else { 1 };
                    let height_id = Id::new(("msg_h", t.id));
                    if let Some(g) = gone {
                        let g = egui::emath::easing::cubic_in_out(g.clamp(0.0, 1.0));
                        let mut ignored = Vec::new();
                        widgets::clip_height(ui, height_id, g, |ui| {
                            ui.multiply_opacity(g);
                            Frame::new().inner_margin(Margin { left: 10, right: 10, top, bottom: 1 }).show(ui, |ui| self.bubble(ui, t, first, &keys, &mut ignored));
                        });
                        continue;
                    }
                    // New messages fade in, rise and grow slightly into place.
                    let e = self.appear(t.id);
                    animating |= e < 1.0;
                    let mine = t.is_outgoing();
                    let r = Frame::new().inner_margin(Margin { left: 10, right: 10, top, bottom: 1 }).show(ui, |ui| {
                        ui.multiply_opacity(e);
                        if e < 1.0 {
                            let s = 0.94 + 0.06 * e;
                            let anchor = if mine { ui.max_rect().right_top() } else { ui.max_rect().left_top() };
                            let tf = egui::emath::TSTransform::from_translation(anchor.to_vec2() + vec2(0.0, (1.0 - e) * 14.0)) * egui::emath::TSTransform::from_scaling(s) * egui::emath::TSTransform::from_translation(-anchor.to_vec2());
                            ui.with_visual_transform(tf, |ui| self.bubble(ui, t, first, &keys, &mut actions));
                        } else {
                            self.bubble(ui, t, first, &keys, &mut actions);
                        }
                    });
                    if e >= 1.0 {
                        ui.ctx().data_mut(|d| d.insert_temp(height_id, r.response.rect.height()));
                    }
                }
                for pr in &prompts {
                    Frame::new().inner_margin(Margin { left: 10, right: 10, top: 6, bottom: 1 }).show(ui, |ui| self.offer_card(ui, pr, &mut actions));
                }
                if zipping > 0 {
                    Frame::new().inner_margin(Margin::symmetric(14, 6)).show(ui, |ui| {
                        ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
                            ui.spinner();
                            ui.label(widgets::sub(&p, self.t("preparing_folder")));
                        });
                    });
                }
                if animating {
                    ui.ctx().request_repaint();
                }
                ui.add_space(8.0);
                let h = ui.cursor().top() - top + 6.0;
                if (h - prev_h).abs() > 0.5 {
                    ui.ctx().data_mut(|d| d.insert_temp(content_id, h));
                    ui.ctx().request_repaint();
                }
            });
            self.run_actions(ui.ctx(), actions);
        });

        // Everything visible counts as read while the window has focus.
        if ui.ctx().input(|i| i.focused) && self.sheet.is_none() {
            if let Some(max) = self.txs.iter().filter(|t| Self::in_conv(&conv, &keys, t)).map(|t| t.id).max() {
                self.seen.insert(conv, max);
            }
        }
    }

    /// Header built for transfers: avatar, name and one row of status chips on
    /// the left; live speed (or session totals) and actions on the right. The
    /// left block is painted into whatever room the right side leaves, and
    /// chips that don't fit are dropped rather than overlapping.
    fn chat_header(&mut self, ui: &mut Ui, conv: &Conv, act: &Activity) {
        let p = self.pal;
        let item = self.conv_item(conv);
        let keys = self.conv_keys(conv);
        let (mut up, mut down) = (0u64, 0u64);
        for t in self.txs.iter().filter(|t| t.kind == Kind::File && Self::in_conv(conv, &keys, t)) {
            if t.is_outgoing() {
                up += t.client_bytes.iter().filter(|(k, _)| keys.is_empty() || keys.contains(k) || matches!(conv, Conv::Group(_))).map(|(_, b)| *b).sum::<u64>();
            } else {
                down += t.bytes_transferred;
            }
        }
        let chips = self.header_chips(conv);

        egui::Panel::top("chat_header").exact_size(62.0).frame(Frame::new().fill(p.panel).inner_margin(Margin { left: 16, right: 12, top: 0, bottom: 0 })).show_separator_line(false).show(ui, |ui| {
            let full = ui.max_rect();
            let cy = full.center().y;

            // Right side first, so the left block knows how much room it has.
            let right_edge = ui
                .scope_builder(egui::UiBuilder::new().max_rect(full).layout(Layout::right_to_left(Align::Center)), |ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    match conv {
                        Conv::Public => {}
                        Conv::Desktop(name) => {
                            if header_btn(ui, &p, icon::INFO, self.t("info")).clicked() {
                                self.open_sheet(Sheet::Info(conv.clone()));
                            }
                            let saved = self.settings.saved_desktops.contains(name);
                            let tip = if saved { self.t("unsave") } else { self.t("save_contact") }.to_string();
                            if widgets::icon_btn_big_colored(ui, &p, icon::BOOKMARK_SIMPLE, &tip, if saved { p.accent } else { p.sub_text }).clicked() {
                                let name = name.clone();
                                self.toggle_saved(&name);
                            }
                        }
                        _ => {
                            if header_btn(ui, &p, icon::INFO, self.t("info")).clicked() {
                                self.open_sheet(Sheet::Info(conv.clone()));
                            }
                        }
                    }
                    if act.sending || act.receiving {
                        self.live_meter(ui, act);
                    } else if up + down > 0 {
                        self.totals(ui, up, down);
                    }
                    ui.min_rect().left()
                })
                .inner;
            let right = if right_edge < full.right() - 1.0 { right_edge - 16.0 } else { full.right() };

            // Avatar + name; clicking either opens the details.
            let av = Rect::from_center_size(pos2(full.left() + 20.0, cy), vec2(40.0, 40.0));
            let tx = av.right() + 12.0;
            let name = item.as_ref().map(|i| i.name.clone()).unwrap_or_default();
            let ng = widgets::fit_text(ui.painter(), &name, FontId::new(15.5, theme::semibold()), p.text, (right - tx).max(20.0));
            let name_pos = pos2(tx, cy - 2.0 - ng.size().y);
            let title = av.union(Rect::from_min_size(name_pos, ng.size()));
            let click = ui.interact(title, Id::new("header_title"), Sense::click()).on_hover_cursor(egui::CursorIcon::PointingHand);
            if click.clicked() {
                self.open_sheet(if *conv == Conv::Public { Sheet::Public } else { Sheet::Info(conv.clone()) });
            }
            let hov = ui.ctx().animate_bool_with_time(click.id, click.hovered(), 0.12);
            if let Some(it) = &item {
                let fill = if it.online || matches!(conv, Conv::Group(_) | Conv::Public) { it.color } else { widgets::lerp_color(it.color, p.icon_bg, 0.6) };
                let label = it.glyph.map(str::to_string).unwrap_or_else(|| widgets::initials(&it.name));
                widgets::face(ui.painter(), av.expand(1.5 * hov), fill, &label, 0.0);
            }
            ui.painter().galley(name_pos, ng, widgets::lerp_color(p.text, p.accent, hov));

            // Chips: same shape for all, only the glyph carries colour.
            let mut x = tx;
            let y = cy + 3.0;
            for (i, c) in chips.into_iter().enumerate() {
                let g = ui.painter().layout_no_wrap(c.text.clone(), FontId::proportional(12.0), p.sub_text);
                let w = g.size().x + 30.0;
                if x + w > right {
                    break;
                }
                let r = Rect::from_min_size(pos2(x, y), vec2(w, 21.0));
                let sense = if c.copy.is_some() { Sense::click() } else { Sense::hover() };
                let resp = ui.interact(r, Id::new(("head_chip", i)), sense);
                let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered() && c.copy.is_some(), 0.12);
                ui.painter().rect_filled(r, CornerRadius::same(11), widgets::lerp_color(p.input, p.icon_bg, h));
                ui.painter().text(pos2(r.left() + 13.0, r.center().y), Align2::CENTER_CENTER, c.glyph, FontId::proportional(12.5), c.color);
                ui.painter().galley(pos2(r.left() + 22.0, r.center().y - g.size().y / 2.0), g, widgets::lerp_color(p.sub_text, p.text, h));
                let resp = match &c.tip {
                    Some(tip) => resp.on_hover_text(tip),
                    None => resp,
                };
                if let Some(text) = c.copy {
                    if resp.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                        ui.ctx().copy_text(text);
                        self.toast(self.t("link_copied").to_string(), ToastKind::Success);
                    }
                }
                x += w + 6.0;
            }

            // Bottom border, with an overall progress line over it while transfers run.
            let full = Rect::from_x_y_ranges(ui.clip_rect().x_range(), full.y_range());
            let y = full.bottom() - 0.5;
            ui.painter().hline(full.x_range(), y, Stroke::new(1.0, p.border));
            let frac = if act.total > 0 { act.done as f32 / act.total as f32 } else { 0.0 };
            let vis = ui.ctx().animate_bool_with_time(Id::new("head_prog_vis"), act.sending || act.receiving, 0.25);
            if vis > 0.0 {
                let shown = ui.ctx().animate_value_with_time(Id::new("head_prog"), frac, 0.3);
                let w = full.width() * shown;
                let bar = Rect::from_min_size(pos2(full.left(), y - 1.5), vec2(w, 2.5));
                ui.painter().rect_filled(bar, CornerRadius::same(1), p.accent.gamma_multiply(vis));
                let t = (ui.input(|i| i.time) as f32 * 0.8).fract();
                let gx = full.left() + w * t;
                ui.painter().rect_filled(Rect::from_center_size(pos2(gx, y - 0.25), vec2(40.0_f32.min(w), 2.5)), CornerRadius::same(1), Color32::from_white_alpha((90.0 * vis) as u8));
                ui.ctx().request_repaint();
            }
        });
    }

    /// Status chips under the title, most important first (later ones are
    /// dropped when the header is narrow).
    fn header_chips(&self, conv: &Conv) -> Vec<Chip> {
        let p = self.pal;
        let mut out = Vec::new();
        match conv {
            Conv::Public => {
                if !self.server_ready() {
                    out.push(Chip::new(icon::HOURGLASS_MEDIUM, p.sub_text, self.t("starting_server")));
                    return out;
                }
                let n = self.clients.len();
                if n > 0 {
                    let names: Vec<&str> = self.clients.iter().map(|c| c.name.as_str()).collect();
                    let mut c = Chip::new(icon::CIRCLE, p.success, &self.i18n.tf("devices_n", &[("n", &n.to_string())]));
                    c.tip = Some(names.join(", "));
                    out.push(c);
                } else {
                    out.push(Chip::new(icon::CIRCLE, p.sub_text, self.t("waiting_devices")));
                }
                let ip = self.current_ip();
                if let Some(net) = self.networks.iter().find(|n| n.ip == ip) {
                    let glyph = match net.kind {
                        peerhop::net::NetKind::Hotspot => icon::BROADCAST,
                        peerhop::net::NetKind::Wifi => icon::WIFI_HIGH,
                        peerhop::net::NetKind::Ethernet => icon::PLUGS,
                    };
                    let name = if net.ssid.is_empty() { net.name.as_str() } else { net.ssid.as_str() };
                    out.push(Chip::new(glyph, p.accent, name));
                }
                let mut c = Chip::new(icon::LINK_SIMPLE, p.sub_text, &format!("{}:{}", ip, self.port));
                c.tip = Some(self.t("copy").to_string());
                c.copy = Some(self.server_url());
                out.push(c);
            }
            Conv::Group(_) => {
                let all = self.groups.iter().find(|g| Conv::Group(g.id) == *conv).map_or(0, |g| g.members.len());
                let live = self.conv_targets(conv).len();
                out.push(Chip::new(icon::CIRCLE, if live > 0 { p.success } else { p.sub_text }, &format!("{live}/{all} {}", self.t("online"))));
                out.push(Chip::new(icon::LOCK_SIMPLE, p.sub_text, self.t("direct_encrypted")));
            }
            _ => {
                let online = !self.conv_targets(conv).is_empty();
                let (text, c) = if online { (self.t("online"), p.success) } else { (self.t("offline"), p.sub_text) };
                out.push(Chip::new(icon::CIRCLE, c, text));
                let keys = self.conv_keys(conv);
                let known = keys.iter().filter_map(|k| peerhop::p2p::peer_of(k)).find_map(|id| self.known.get(id));
                if let Some(k) = known.filter(|k| !k.label.is_empty()) {
                    out.push(Chip::new(widgets::platform_icon(k.kind), p.sub_text, &k.label));
                }
                let mut c = Chip::new(icon::LOCK_SIMPLE, p.sub_text, self.t("direct_encrypted"));
                c.tip = Some(self.t("direct_encrypted_hint").to_string());
                out.push(c);
            }
        }
        out
    }

    /// What moved in this conversation so far (shown when idle).
    fn totals(&self, ui: &mut Ui, up: u64, down: u64) {
        let p = self.pal;
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 2.0;
            for (glyph, n, tip, c) in [(icon::ARROW_UP, up, "sent", p.accent), (icon::ARROW_DOWN, down, "received", p.success)] {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 4.0;
                    ui.label(RichText::new(glyph).size(12.0).color(c));
                    ui.label(RichText::new(format_bytes(n)).size(12.0).color(p.sub_text));
                })
                .response
                .on_hover_text(self.t(tip));
            }
        });
    }

    /// Live speed + percent with a small progress ring (replaces the totals while busy).
    fn live_meter(&self, ui: &mut Ui, act: &Activity) {
        let p = self.pal;
        let frac = if act.total > 0 { act.done as f32 / act.total as f32 } else { 0.0 };
        Frame::new().fill(p.accent_soft).corner_radius(18).inner_margin(Margin { left: 6, right: 12, top: 4, bottom: 4 }).show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 8.0;
                let (r, _) = ui.allocate_exact_size(vec2(28.0, 28.0), Sense::hover());
                let shown = ui.ctx().animate_value_with_time(Id::new("head_ring"), frac, 0.3);
                let spin = (ui.input(|i| i.time) as f32 * 0.35).fract();
                ui.painter().circle_stroke(r.center(), 11.0, Stroke::new(2.5, p.accent.gamma_multiply(0.25)));
                widgets::ring(ui.painter(), r.center(), 11.0, shown.max(0.04), spin, Stroke::new(2.5, p.accent));
                let glyph = if act.sending && !act.receiving { icon::ARROW_UP } else if act.receiving && !act.sending { icon::ARROW_DOWN } else { icon::ARROWS_DOWN_UP };
                ui.painter().text(r.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(12.0), p.accent);
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    let speed = if act.bps > 0.0 { format_speed(act.bps) } else { "…".into() };
                    ui.label(widgets::bold(speed, 13.0).color(p.accent));
                    let mut parts = vec![format!("{:.0}%", frac * 100.0)];
                    if let Some(left) = eta(act.done, act.total, act.bps) {
                        parts.push(self.i18n.tf("left", &[("t", &left)]));
                    }
                    ui.label(RichText::new(parts.join(" · ")).size(11.0).color(p.sub_text));
                });
            });
        });
        ui.ctx().request_repaint();
    }

    fn date_pill(&self, ui: &mut Ui, day: chrono::NaiveDate) {
        let p = self.pal;
        let today = chrono::Local::now().date_naive();
        let text = if day == today {
            self.t("today").to_string()
        } else if Some(day) == today.pred_opt() {
            self.t("yesterday").to_string()
        } else {
            day.format("%e %B %Y").to_string()
        };
        let galley = ui.painter().layout_no_wrap(text, FontId::new(12.0, theme::semibold()), p.sub_text);
        let (row, _) = ui.allocate_exact_size(vec2(ui.available_width(), 30.0), Sense::hover());
        let pill = Rect::from_center_size(row.center(), galley.size() + vec2(20.0, 8.0));
        ui.painter().rect_filled(pill, CornerRadius::same((pill.height() / 2.0) as u8), p.panel.gamma_multiply(0.9));
        ui.painter().galley(pill.center() - galley.size() / 2.0, galley, p.sub_text);
    }

    /// QR and network selectors, sitting straight on the chat background, centred, no card around it.
    fn inline_connect_card(&mut self, ui: &mut Ui) {
        ui.vertical_centered(|ui| {
            ui.allocate_ui_with_layout(vec2(540.0_f32.min(ui.available_width() - 32.0), 0.0), Layout::top_down(Align::Center), |ui| self.connect_card(ui));
        });
        ui.add_space(10.0);
    }

    fn empty_state(&mut self, ui: &mut Ui, conv: &Conv) {
        let p = self.pal;
        egui::ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
            ui.vertical_centered(|ui| {
                let e = ui.ctx().animate_bool_with_time(Id::new(("empty", conv)), true, 0.3);
                ui.multiply_opacity(e);
                match conv {
                    Conv::Public if self.clients.is_empty() => {
                        ui.add_space((ui.available_height() * 0.08).clamp(10.0, 40.0));
                        self.inline_connect_card(ui);
                    }
                    _ => {
                        ui.add_space((ui.available_height() * 0.22).max(24.0));
                        let targets = self.conv_targets(conv);
                        let offline = !matches!(conv, Conv::Public) && targets.is_empty();
                        let (rect, resp) = ui.allocate_exact_size(vec2(250.0, 150.0), if offline { Sense::hover() } else { Sense::click() });
                        let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.18);
                        let lift = egui::emath::easing::cubic_out(h);
                        let painter = ui.painter();
                        painter.rect_filled(rect, 18, widgets::lerp_color(p.panel, p.accent_soft, h));
                        painter.rect_stroke(rect, 18, Stroke::new(1.5, widgets::lerp_color(p.border, p.accent, h)), egui::StrokeKind::Inside);
                        let (glyph, title, hint) = if offline {
                            (icon::MOON_STARS, self.t("offline").to_string(), self.t("peer_offline").to_string())
                        } else {
                            (icon::PAPER_PLANE_TILT, self.t("say_hello").to_string(), self.t("paste_hint").to_string())
                        };
                        let c = rect.center();
                        painter.circle_filled(c - vec2(0.0, 30.0 + 4.0 * lift), 26.0, p.accent_soft);
                        painter.text(c - vec2(0.0, 30.0 + 4.0 * lift), Align2::CENTER_CENTER, glyph, FontId::proportional(26.0 + 2.0 * lift), p.accent);
                        painter.text(c + vec2(0.0, 14.0), Align2::CENTER_CENTER, title, FontId::new(15.0, theme::semibold()), p.text);
                        let hint_g = painter.layout(hint, FontId::proportional(12.0), p.sub_text, rect.width() - 30.0);
                        painter.galley(pos2(c.x - hint_g.size().x / 2.0, c.y + 28.0), hint_g, p.sub_text);
                        if !offline && resp.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                            self.pick_files();
                        }
                    }
                }
            });
        });
    }

    /// Bottom bar. Sharing comes first: two big buttons for files and folders; a
    /// message field only slides in when asked for.
    fn composer(&mut self, ui: &mut Ui, conv: &Conv) {
        let p = self.pal;
        let ready = match conv {
            Conv::Public => self.server_ready(),
            c => !self.conv_targets(c).is_empty(),
        };
        let text_on = !matches!(conv, Conv::Public) || self.settings.text_transfer_enabled;
        if !text_on || !ready {
            self.text_open = false;
        }
        let id = Id::new(COMPOSER_ID);
        let had_focus = ui.memory(|m| m.has_focus(id));
        if had_focus && ui.input_mut(|i| i.consume_key(Modifiers::NONE, Key::Enter)) {
            self.send_text();
        }
        if self.text_open && had_focus && ui.input(|i| i.key_pressed(Key::Escape)) {
            self.text_open = false;
        }

        // 0 = share buttons, 1 = message field; the two cross-fade and slide.
        let t = ui.ctx().animate_bool_with_time(Id::new("composer_mode"), self.text_open, 0.22);
        if t > 0.0 && t < 1.0 {
            ui.ctx().request_repaint();
        }
        let e = egui::emath::easing::cubic_in_out(t);
        let row_h = 46.0;
        let (rect, _) = ui.allocate_exact_size(vec2(ui.available_width(), if t > 0.5 { 0.0 } else { row_h }), Sense::hover());
        let mut child = ui.new_child(egui::UiBuilder::new().max_rect(Rect::from_min_size(rect.min, vec2(rect.width(), row_h))).layout(Layout::left_to_right(Align::Center)));

        if t < 0.5 {
            let a = 1.0 - e * 2.0;
            child.multiply_opacity(a.clamp(0.0, 1.0));
            let ui = &mut child;
            ui.spacing_mut().item_spacing.x = 8.0;
            let msg_w = if text_on { row_h + 8.0 } else { 0.0 };
            let w = ((ui.available_width() - msg_w - 8.0) / 2.0).max(60.0);
            let drift = vec2(-14.0 * e, 0.0);
            if widgets::big_btn(ui, &p, icon::FILES, self.t("send_files"), w, row_h, p.accent, Color32::WHITE, ready, drift)
                .on_hover_text(self.t("paste_hint"))
                .clicked()
            {
                self.pick_files();
            }
            if widgets::big_btn(ui, &p, icon::FOLDER_SIMPLE_PLUS, self.t("send_folder"), w, row_h, p.input, p.text, ready, drift).clicked() {
                if let Some(dir) = rfd::FileDialog::new().pick_folder() {
                    self.share_paths(vec![dir]);
                }
            }
            if text_on && widgets::big_btn(ui, &p, icon::CHAT_CIRCLE_TEXT, "", row_h, row_h, p.input, p.text, ready, drift).on_hover_text(self.t("send_text")).clicked() {
                self.text_open = true;
                ui.memory_mut(|m| m.request_focus(id));
            }
        } else {
            drop(child);
            let a = (e * 2.0 - 1.0).clamp(0.0, 1.0);
            ui.scope(|ui| {
                ui.multiply_opacity(a);
                let focused = ui.memory(|m| m.has_focus(id));
                let f = ui.ctx().animate_bool_with_time(id.with("focus"), focused, 0.15);
                Frame::new()
                    .fill(p.input)
                    .corner_radius(23)
                    .stroke(Stroke::new(1.0, widgets::lerp_color(p.border, p.accent, f)))
                    .inner_margin(Margin::same(3))
                    .show(ui, |ui| {
                        ui.set_min_height(40.0);
                        ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                            ui.spacing_mut().item_spacing.x = 2.0;
                            if round_btn(ui, &p, icon::X, self.t("close_text_input"), true).clicked() {
                                self.text_open = false;
                            }
                            let field_w = (ui.available_width() - 44.0).max(40.0);
                            let edit = egui::TextEdit::multiline(&mut self.draft)
                                .id(id)
                                .frame(Frame::NONE)
                                .desired_rows(1)
                                .hint_text(self.i18n.t("message"))
                                .desired_width(field_w)
                                .margin(Margin::symmetric(4, 0))
                                .font(FontId::proportional(14.5))
                                .return_key(Some(egui::KeyboardShortcut::new(Modifiers::SHIFT, Key::Enter)));
                            egui::ScrollArea::vertical().max_height(120.0).max_width(field_w).auto_shrink([false, true]).show(ui, |ui| ui.add(edit));
                            let has_text = !self.draft.trim().is_empty();
                            let (r, resp) = ui.allocate_exact_size(vec2(40.0, 40.0), Sense::click());
                            let s = ui.ctx().animate_bool_with_time(Id::new("send_ready"), has_text, 0.15);
                            let fill = widgets::lerp_color(p.input, p.accent, s);
                            ui.painter().circle_filled(r.center(), 18.0 * (0.9 + 0.1 * egui::emath::easing::back_out(s)), fill);
                            ui.painter().text(r.center() + vec2(1.0, 0.0), Align2::CENTER_CENTER, icon::PAPER_PLANE_RIGHT, FontId::proportional(18.0), widgets::lerp_color(p.sub_text, Color32::WHITE, s));
                            if (s > 0.0 && s < 1.0) || (f > 0.0 && f < 1.0) {
                                ui.ctx().request_repaint();
                            }
                            if resp.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_text(self.t("send")).clicked() && has_text {
                                self.send_text();
                                ui.memory_mut(|m| m.request_focus(id));
                            }
                        });
                    });
            });
        }
        if !ready {
            let msg = if matches!(conv, Conv::Public) { self.t("starting_server") } else { self.t("peer_offline") };
            ui.add(egui::Label::new(widgets::sub(&p, msg)).truncate());
        }
    }

    fn bubble(&mut self, ui: &mut Ui, t: &Transaction, first: bool, keys: &[String], actions: &mut Vec<Action>) {
        let p = self.pal;
        let mine = t.is_outgoing();
        let layout = if mine { Layout::right_to_left(Align::Min) } else { Layout::left_to_right(Align::Min) };
        let max_w = (ui.available_width() * 0.8).clamp(180.0, 440.0);
        // Who said it matters only where several devices talk (the public room).
        let multi = self.conv == Conv::Public && !mine;
        ui.with_layout(layout, |ui| {
            ui.spacing_mut().item_spacing.x = 6.0;
            if multi {
                if first {
                    let name = self.client_name(&t.sender_id);
                    let (rect, _) = ui.allocate_exact_size(vec2(30.0, 30.0), Sense::hover());
                    widgets::face(ui.painter(), rect, widgets::name_color(&name), &widgets::initials(&name), 0.0);
                } else {
                    ui.add_space(30.0);
                }
            }
            ui.allocate_ui_with_layout(vec2(max_w, 0.0), Layout::top_down(if mine { Align::Max } else { Align::Min }), |ui| {
                // The whole bubble answers right-click; registered before its contents so
                // buttons inside stay on top. Uses last frame's rect.
                let key = Id::new(("bubble", t.id));
                if let Some(prev) = ui.ctx().data(|d| d.get_temp::<Rect>(key)) {
                    let bg = ui.interact(prev, key.with("menu"), Sense::click());
                    bg.context_menu(|ui| self.bubble_menu(ui, t, actions));
                }
                let fill = if mine { p.bubble_mine } else { p.bubble_other };
                let tail = 4;
                let radius = CornerRadius { nw: if !mine && first { tail } else { 14 }, ne: if mine && first { tail } else { 14 }, sw: 14, se: 14 };
                let r = Frame::new()
                    .fill(fill)
                    .corner_radius(radius)
                    .shadow(egui::Shadow { offset: [0, 1], blur: 2, spread: 0, color: Color32::from_black_alpha(if p.dark { 40 } else { 18 }) })
                    .inner_margin(Margin { left: 10, right: 10, top: 6, bottom: 5 })
                    .show(ui, |ui| {
                        if multi && first {
                            let name = self.client_name(&t.sender_id);
                            ui.label(widgets::bold(&name, 13.0).color(widgets::name_color(&name)));
                        }
                        match t.kind {
                            Kind::Text => self.text_body(ui, t, mine),
                            Kind::File => self.file_body(ui, t, mine, max_w, keys, actions),
                        }
                    });
                ui.ctx().data_mut(|d| d.insert_temp(key, r.response.rect));
            });
        });
    }

    fn meta_line(&self, ui: &mut Ui, t: &Transaction, mine: bool, tick: Option<Tick>) {
        let p = self.pal;
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.spacing_mut().item_spacing.x = 3.0;
            let color = if mine { p.mine_meta } else { p.sub_text };
            if let Some(tk) = tick {
                let c = if tk == Tick::Failed { p.danger } else { color };
                let size = 14.0 * (0.6 + 0.4 * self.tick_pop(ui, t.id, tk));
                ui.add_sized([16.0, 14.0], egui::Label::new(RichText::new(widgets::tick_glyph(tk)).size(size).color(c)).selectable(false));
            }
            ui.label(RichText::new(time_of(t)).size(11.0).color(color));
        });
    }

    /// 0..1 (overshooting) scale of a tick that just changed state.
    fn tick_pop(&self, ui: &Ui, id: u64, tk: Tick) -> f32 {
        let id = Id::new(("tick", id));
        let now = ui.input(|i| i.time);
        let (state, since) = ui.ctx().data(|d| d.get_temp::<(u8, f64)>(id)).unwrap_or((u8::MAX, now));
        let since = if state != tk as u8 {
            ui.ctx().data_mut(|d| d.insert_temp(id, (tk as u8, now)));
            now
        } else {
            since
        };
        let pop = ((now - since) as f32 / 0.3).min(1.0);
        if pop < 1.0 {
            ui.ctx().request_repaint();
        }
        egui::emath::easing::back_out(pop)
    }

    fn text_body(&mut self, ui: &mut Ui, t: &Transaction, mine: bool) {
        let p = self.pal;
        let wrap = ui.available_width().max(60.0);
        let galley = ui.painter().layout(t.text_content.clone(), FontId::proportional(14.5), p.text, wrap);
        let meta_c = if mine { p.mine_meta } else { p.sub_text };
        let time = ui.painter().layout_no_wrap(time_of(t), FontId::proportional(11.0), meta_c);
        let tick_w = if mine { 17.0 } else { 0.0 };
        let meta_w = time.size().x + tick_w;
        let gap = 8.0;
        let last_w = galley.rows.last().map(|r| r.rect().max.x).unwrap_or(0.0);
        let inline = last_w + gap + meta_w <= wrap;
        let w = if inline { galley.size().x.max(last_w + gap + meta_w) } else { galley.size().x.max(meta_w) };
        let h = galley.size().y + if inline { 0.0 } else { 15.0 };
        let (rect, _) = ui.allocate_exact_size(vec2(w, h), Sense::hover());
        ui.painter().galley(rect.min, galley, p.text);
        // Meta hugs the bottom-right corner, on the last text line's baseline.
        let base = rect.right_bottom() + vec2(0.0, 1.0);
        if mine {
            let pop = self.tick_pop(ui, t.id, Tick::Sent);
            let size = 14.0 * (0.6 + 0.4 * pop);
            ui.painter().text(base - vec2(tick_w / 2.0 - 1.0, 8.0), Align2::CENTER_CENTER, widgets::tick_glyph(Tick::Sent), FontId::proportional(size), meta_c);
        }
        ui.painter().galley(base - vec2(meta_w, time.size().y + 1.0), time, meta_c);
    }

    fn file_body(&mut self, ui: &mut Ui, t: &Transaction, mine: bool, max_w: f32, keys: &[String], actions: &mut Vec<Action>) {
        let p = self.pal;
        let path = t.local_path();
        let exists = path.as_ref().is_some_and(|p| p.is_file());
        let bad = matches!(t.status, Status::Cancelled | Status::Failed);
        let receiving = !mine && t.status == Status::InProgress;
        let usable = exists && !bad && !receiving;
        let shown = if mine { self.shown_keys(t, keys) } else { Vec::new() };
        let active: Vec<&String> = shown.iter().filter(|k| t.client_status.get(*k).copied().unwrap_or(Status::InProgress) == Status::InProgress).collect();
        // One device: its progress lives in the bubble itself; several get a row each.
        let single = shown.len() == 1 && self.conv != Conv::Public;

        let (frac, bytes, bps) = if receiving {
            (if t.file_size > 0 { t.bytes_transferred as f32 / t.file_size as f32 } else { 0.0 }, t.bytes_transferred, self.speed(t.id, ""))
        } else if let (true, Some(k)) = (single, active.first()) {
            let b = t.client_bytes.get(*k).copied().unwrap_or(0);
            (if t.file_size > 0 { b as f32 / t.file_size as f32 } else { 0.0 }, b, self.speed(t.id, k))
        } else {
            (0.0, 0, 0.0)
        };
        let running = receiving || (single && !active.is_empty());

        ui.set_min_width(max_w.min(300.0));
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing.x = 10.0;
            let thumb = if usable && thumbs::is_image(&t.filename) { path.as_ref().and_then(|pp| self.thumbs.get(ui.ctx(), pp)) } else { None };
            let (rect, r) = ui.allocate_exact_size(vec2(46.0, 46.0), Sense::click());
            let h = ui.ctx().animate_bool_with_time(r.id, r.hovered(), 0.12);
            let c = rect.center();
            match (&thumb, running) {
                (Some(tex), false) => {
                    let s = tex.size_vec2();
                    let m = s.x.min(s.y);
                    let uv = Rect::from_center_size(pos2(0.5, 0.5), vec2(m / s.x, m / s.y));
                    egui::Image::new(tex).fit_to_exact_size(rect.size()).corner_radius(10).uv(uv).paint_at(ui, rect.shrink(-1.5 * h));
                }
                _ => {
                    let base = if bad { p.sub_text } else { p.accent };
                    ui.painter().circle_filled(c, 23.0 + 1.5 * h, base);
                    if running {
                        // Telegram-style: progress ring with a cancel cross inside.
                        let shown_frac = ui.ctx().animate_value_with_time(Id::new(("ring", t.id)), frac, 0.3);
                        let spin = (ui.input(|i| i.time) as f32 * 0.35).fract();
                        ui.painter().circle_stroke(c, 19.0, Stroke::new(2.4, Color32::from_white_alpha(50)));
                        widgets::ring(ui.painter(), c, 19.0, shown_frac.max(0.04), spin, Stroke::new(2.4, Color32::WHITE));
                        ui.painter().text(c, Align2::CENTER_CENTER, icon::X, FontId::proportional(17.0), Color32::WHITE);
                        ui.ctx().request_repaint();
                    } else {
                        let glyph = if h > 0.5 && usable { icon::ARROW_SQUARE_OUT } else if bad { icon::WARNING } else { file_icon(&t.filename) };
                        ui.painter().text(c, Align2::CENTER_CENTER, glyph, FontId::proportional(22.0), Color32::WHITE);
                    }
                }
            }
            if h > 0.0 && h < 1.0 {
                ui.ctx().request_repaint();
            }
            let r = r.on_hover_cursor(egui::CursorIcon::PointingHand);
            if r.clicked() {
                if receiving {
                    actions.push(Action::CancelUpload { id: t.id, file: t.filename.clone() });
                } else if running {
                    if let Some(k) = active.first() {
                        actions.push(Action::CancelClient { id: t.id, ip: (*k).clone(), file: t.filename.clone() });
                    }
                } else if usable {
                    if let Some(pp) = &path {
                        actions.push(Action::Open(pp.clone()));
                    }
                }
            }
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing.y = 2.0;
                ui.add(egui::Label::new(widgets::bold(&t.filename, 13.5).color(p.text)).truncate().selectable(false));
                let meta_c = if mine { p.mine_meta } else { p.sub_text };
                if running {
                    let mut parts = vec![format!("{} / {}", format_bytes(bytes), format_bytes(t.file_size))];
                    if bps > 0.0 {
                        parts.push(format_speed(bps));
                    }
                    if let Some(left) = eta(bytes, t.file_size, bps) {
                        parts.push(self.i18n.tf("left", &[("t", &left)]));
                    }
                    ui.add(egui::Label::new(RichText::new(parts.join(" · ")).size(12.0).color(meta_c)).truncate());
                } else {
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 4.0;
                        ui.label(RichText::new(format_bytes(t.file_size.max(t.bytes_transferred))).size(12.0).color(meta_c));
                        let status = match t.status {
                            Status::Cancelled => Some((self.t("cancelled"), p.danger)),
                            Status::Failed => Some((self.t("failed"), p.danger)),
                            _ if !exists && !receiving => Some((self.t("file_missing"), p.danger)),
                            _ if single && shown.iter().all(|k| t.client_status.get(k) == Some(&Status::Pending)) => Some((self.t("waiting_accept"), meta_c)),
                            _ => None,
                        };
                        if let Some((s, c)) = status {
                            ui.label(RichText::new("·").size(12.0).color(meta_c));
                            ui.label(RichText::new(s).size(12.0).color(c));
                        }
                    });
                }
            });
        });

        if mine && !bad && !single {
            self.device_rows(ui, t, &shown, actions);
        }
        let tick = if !mine {
            None
        } else if bad {
            Some(Tick::Failed)
        } else {
            let st: Vec<Status> = shown.iter().map(|k| t.client_status.get(k).copied().unwrap_or(Status::InProgress)).collect();
            Some(if st.is_empty() {
                Tick::Waiting
            } else if st.iter().all(|s| *s == Status::Completed) {
                Tick::Delivered
            } else if st.iter().all(|s| matches!(s, Status::Failed | Status::Cancelled)) {
                Tick::Failed
            } else if st.iter().any(|s| *s == Status::Completed) {
                Tick::Sent
            } else {
                Tick::Waiting
            })
        };
        self.meta_line(ui, t, mine, tick);
    }

    /// Per-device delivery of a shared file (public room and groups).
    fn device_rows(&mut self, ui: &mut Ui, t: &Transaction, shown: &[String], actions: &mut Vec<Action>) {
        let p = self.pal;
        if shown.is_empty() {
            ui.add_space(2.0);
            ui.horizontal(|ui| {
                ui.label(RichText::new(icon::HOURGLASS_MEDIUM).size(13.0).color(p.mine_meta));
                ui.label(RichText::new(self.t("waiting_for_device")).size(12.0).color(p.mine_meta));
            });
            return;
        }
        ui.add_space(2.0);
        for k in shown {
            let status = t.client_status.get(k).copied().unwrap_or(Status::InProgress);
            let device = self.client_name(k);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                let (r, _) = ui.allocate_exact_size(vec2(18.0, 18.0), Sense::hover());
                widgets::face(ui.painter(), r, widgets::name_color(&device), &widgets::initials(&device), 0.0);
                ui.add(egui::Label::new(RichText::new(&device).size(12.5).color(p.text)).truncate());
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| match status {
                    Status::Completed => {
                        ui.label(RichText::new(format!("{} {}", icon::CHECKS, self.t("sent"))).size(12.0).color(p.success));
                    }
                    Status::Cancelled | Status::Failed => {
                        ui.label(RichText::new(self.t("cancelled")).size(12.0).color(p.danger));
                    }
                    Status::Pending => {
                        ui.label(RichText::new(self.t("waiting_accept")).size(12.0).color(p.mine_meta));
                    }
                    Status::InProgress => {
                        if widgets::icon_btn_colored(ui, &p, icon::X, self.t("cancel"), p.danger).clicked() {
                            actions.push(Action::CancelClient { id: t.id, ip: k.clone(), file: t.filename.clone() });
                        }
                        let pct = t.client_progress.get(k).copied().unwrap_or(0.0);
                        ui.label(RichText::new(format!("{pct:.0}%")).size(12.0).color(p.mine_meta));
                    }
                });
            });
            if status == Status::InProgress {
                let bytes = t.client_bytes.get(k).copied().unwrap_or(0);
                let frac = if t.file_size > 0 { bytes as f32 / t.file_size as f32 } else { 0.0 };
                widgets::progress(ui, &p, Id::new(("prog", t.id, k.as_str())), frac, p.accent);
                let speed = self.speed(t.id, k);
                if speed > 0.0 {
                    let mut s = format_speed(speed);
                    if let Some(left) = eta(bytes, t.file_size, speed) {
                        s = format!("{s} · {}", self.i18n.tf("left", &[("t", &left)]));
                    }
                    ui.label(RichText::new(s).size(11.0).color(p.mine_meta));
                }
            }
        }
    }

    /// A web peer asks to send files: answered right in the conversation.
    fn offer_card(&mut self, ui: &mut Ui, pr: &peerhop::p2p::Prompt, actions: &mut Vec<Action>) {
        let p = self.pal;
        let total: u64 = pr.files.iter().map(|f| f.size).sum();
        let pulse = (ui.input(|i| i.time) as f32 * 2.4).sin() * 0.5 + 0.5;
        ui.ctx().request_repaint();
        ui.with_layout(Layout::left_to_right(Align::Min), |ui| {
            Frame::new()
                .fill(p.bubble_other)
                .stroke(Stroke::new(1.5, p.accent.gamma_multiply(0.4 + 0.5 * pulse)))
                .corner_radius(CornerRadius { nw: 4, ne: 14, sw: 14, se: 14 })
                .inner_margin(10)
                .show(ui, |ui| {
                    ui.set_max_width(320.0_f32.min(ui.available_width()));
                    ui.horizontal(|ui| {
                        let (rect, _) = ui.allocate_exact_size(vec2(40.0, 40.0), Sense::hover());
                        ui.painter().circle_filled(rect.center(), 20.0, p.accent);
                        ui.painter().text(rect.center() + vec2(0.0, 2.0 * pulse - 1.0), Align2::CENTER_CENTER, icon::DOWNLOAD_SIMPLE, FontId::proportional(20.0), Color32::WHITE);
                        ui.vertical(|ui| {
                            ui.add(egui::Label::new(widgets::bold(self.web_offer_text(pr), 13.5).color(p.text)).wrap());
                            ui.label(widgets::sub(&p, format_bytes(total)));
                        });
                    });
                    for f in pr.files.iter().take(4) {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(file_icon(&f.name)).color(p.sub_text));
                            ui.add(egui::Label::new(RichText::new(&f.name).size(12.5)).truncate());
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| ui.label(widgets::sub(&p, format_bytes(f.size))));
                        });
                    }
                    if pr.files.len() > 4 {
                        ui.label(widgets::sub(&p, format!("+{}", pr.files.len() - 4)));
                    }
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        let w = (ui.available_width() - 6.0) / 2.0;
                        if ui.add_sized([w, 32.0], egui::Button::new(RichText::new(self.t("decline")).color(p.danger)).fill(p.input).corner_radius(10)).on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                            actions.push(Action::Respond { peer: pr.peer.clone(), job: pr.job, accept: false });
                        }
                        if ui.add_sized([w, 32.0], egui::Button::new(widgets::bold(self.t("accept"), 13.5).color(Color32::WHITE)).fill(p.accent).corner_radius(10)).on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                            actions.push(Action::Respond { peer: pr.peer.clone(), job: pr.job, accept: true });
                        }
                    });
                });
        });
    }

    fn bubble_menu(&self, ui: &mut Ui, t: &Transaction, actions: &mut Vec<Action>) {
        let mine = t.is_outgoing();
        let path = t.local_path();
        let exists = path.as_ref().is_some_and(|p| p.is_file());
        let bad = matches!(t.status, Status::Cancelled | Status::Failed);
        let receiving = !mine && t.status == Status::InProgress;
        let mut item = |ui: &mut Ui, glyph: &str, text: &str, a: Action| {
            if ui.button(format!("{glyph}  {text}")).clicked() {
                actions.push(a);
                ui.close();
            }
        };
        match t.kind {
            Kind::Text => item(ui, icon::COPY, self.t("copy"), Action::Copy(t.text_content.clone())),
            Kind::File => {
                if let (true, false, false, Some(pp)) = (exists, bad, receiving, &path) {
                    item(ui, icon::ARROW_SQUARE_OUT, self.t("open"), Action::Open(pp.clone()));
                    item(ui, icon::APP_WINDOW, self.t("open_with"), Action::OpenWith(pp.clone()));
                    item(ui, icon::FOLDER_OPEN, self.t("show_in_folder"), Action::Reveal(pp.clone()));
                    item(ui, icon::COPY, self.t("copy_path"), Action::Copy(pp.to_string_lossy().into_owned()));
                }
                if receiving {
                    item(ui, icon::X_CIRCLE, self.t("cancel"), Action::CancelUpload { id: t.id, file: t.filename.clone() });
                }
            }
        }
        if !receiving {
            ui.separator();
            let has_file = t.kind == Kind::File && exists;
            item(ui, icon::TRASH, self.t("delete"), Action::Delete { id: t.id, has_file, outgoing: mine, finished_badly: bad || t.kind == Kind::Text });
        }
    }

    fn run_actions(&mut self, ctx: &egui::Context, actions: Vec<Action>) {
        for a in actions {
            match a {
                Action::Open(pp) => peerhop::platform::open_file(&pp),
                Action::OpenWith(pp) => peerhop::platform::open_with(&pp),
                Action::Reveal(pp) => peerhop::platform::show_in_folder(&pp),
                Action::Copy(text) => {
                    ctx.copy_text(text);
                    self.toast(self.t("copied").to_string(), ToastKind::Success);
                }
                Action::Delete { id, has_file, outgoing, finished_badly } => {
                    if finished_badly && !has_file {
                        // Nothing on disk to protect: remove right away.
                        self.delete_txn(id, false);
                    } else {
                        // Sent files are the user's originals: default to keeping them.
                        self.modal = Some(Modal::DeleteTxn { id, history_only: outgoing, has_file });
                    }
                }
                Action::CancelClient { id, ip, file } => {
                    let device = self.client_name(&ip);
                    self.modal = Some(Modal::CancelClient { id, ip, device, file });
                }
                Action::CancelUpload { id, file } => self.modal = Some(Modal::CancelUpload { id, file }),
                Action::Respond { peer, job, accept } => self.web.respond(&peer, job, accept),
            }
        }
    }
}

/// Round icon button used in the composer.
fn round_btn(ui: &mut Ui, p: &theme::Palette, glyph: &str, tip: &str, enabled: bool) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(vec2(40.0, 40.0), Sense::click());
    let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered() && enabled, 0.12);
    let c = rect.center();
    if h > 0.0 {
        ui.painter().circle_filled(c, 18.0, p.icon_bg.gamma_multiply(h));
        if h < 1.0 {
            ui.ctx().request_repaint();
        }
    }
    let color = if enabled { widgets::lerp_color(p.sub_text, p.accent, h) } else { p.sub_text.gamma_multiply(0.4) };
    ui.painter().text(c, Align2::CENTER_CENTER, glyph, FontId::proportional(21.0 + 1.0 * h), color);
    resp.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_text(tip)
}

/// One status pill in the header.
struct Chip {
    glyph: &'static str,
    color: Color32,
    text: String,
    tip: Option<String>,
    /// Clicking copies this.
    copy: Option<String>,
}

impl Chip {
    fn new(glyph: &'static str, color: Color32, text: &str) -> Self {
        Self { glyph, color, text: text.to_string(), tip: None, copy: None }
    }
}

/// Labelled header action (icon + text pill).
fn header_btn(ui: &mut Ui, p: &theme::Palette, glyph: &str, text: &str) -> egui::Response {
    let font = FontId::new(13.0, theme::semibold());
    let g = ui.painter().layout_no_wrap(format!("{glyph}  {text}"), font, p.text);
    let (rect, resp) = ui.allocate_exact_size(vec2(g.size().x + 26.0, 34.0), Sense::click());
    let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.12);
    let press = ui.ctx().animate_bool_with_time(resp.id.with("p"), resp.is_pointer_button_down_on(), 0.07);
    if (h > 0.0 && h < 1.0) || (press > 0.0 && press < 1.0) {
        ui.ctx().request_repaint();
    }
    let r = Rect::from_center_size(rect.center(), rect.size() * (1.0 - 0.04 * press));
    ui.painter().rect_filled(r, CornerRadius::same(17), widgets::lerp_color(p.icon_bg, p.accent_soft, h));
    ui.painter().rect_stroke(r, CornerRadius::same(17), Stroke::new(1.0, widgets::lerp_color(p.border, p.accent, h)), egui::StrokeKind::Inside);
    ui.painter().galley(r.center() - g.size() / 2.0, g, widgets::lerp_color(p.text, p.accent, h));
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}
