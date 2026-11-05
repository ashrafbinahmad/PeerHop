//! Conversation view: transfers and messages, newest at the bottom.

use eframe::egui;
use egui::{Align, Frame, Id, Key, Layout, Margin, Modifiers, RichText, Sense, Stroke, Ui, vec2};
use egui_phosphor::regular as icon;
use std::path::Path;

use peerhop::store::{Kind, Status, Transaction};
use peerhop::util::{format_bytes, format_speed};

use super::app::{App, Modal, ToastKind};
use super::theme;
use super::thumbs;
use super::widgets;

const COMPOSER_ID: &str = "composer";

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

enum Action {
    Open(std::path::PathBuf),
    OpenWith(std::path::PathBuf),
    Reveal(std::path::PathBuf),
    Copy(String),
    Delete { id: u64, has_file: bool, outgoing: bool, finished_badly: bool },
    CancelClient { id: u64, ip: String, file: String },
    CancelUpload { id: u64, file: String },
}

/// How long a deleted message takes to fade and collapse.
const LEAVE_SECS: f32 = 0.28;

impl App {
    pub(crate) fn chat_panel(&mut self, ui: &mut Ui) {
        let p = self.pal;
        self.chat_header(ui);

        egui::Panel::bottom("composer")
            .frame(Frame::new().fill(p.bg).inner_margin(Margin { left: 14, right: 14, top: 6, bottom: 10 }))
            .show_separator_line(false)
            .show(ui, |ui| self.composer(ui));

        egui::CentralPanel::default().frame(Frame::new().fill(p.bg)).show(ui, |ui| {
            // Deleted messages fade and collapse for a moment before leaving the list.
            self.leaving.retain(|(_, at)| at.elapsed().as_secs_f32() < LEAVE_SECS);
            if self.txs.is_empty() && self.leaving.is_empty() && self.zipping == 0 {
                self.empty_state(ui);
                return;
            }
            let mut actions = Vec::new();
            egui::ScrollArea::vertical().stick_to_bottom(true).auto_shrink(false).show(ui, |ui| {
                ui.add_space(8.0);
                let live = std::mem::take(&mut self.txs);
                let mut rows: Vec<(&Transaction, Option<f32>)> = live.iter().map(|t| (t, None)).collect();
                let leaving = std::mem::take(&mut self.leaving);
                rows.extend(leaving.iter().map(|(t, at)| (t, Some(1.0 - at.elapsed().as_secs_f32() / LEAVE_SECS))));
                rows.sort_by_key(|(t, _)| t.id);
                let txs: Vec<&Transaction> = rows.iter().map(|r| r.0).collect();
                let mut animating = !leaving.is_empty();
                for (i, (t, gone)) in rows.iter().enumerate() {
                    let t = *t;
                    // Consecutive messages from one sender form a group: one avatar and name.
                    let first = i == 0 || {
                        let prev = &txs[i - 1];
                        prev.sender_id != t.sender_id || (t.timestamp - prev.timestamp).num_minutes() >= 5
                    };
                    let top = if first && i > 0 { 8 } else { 1 };
                    // New messages fade in and rise into place.
                    let height_id = Id::new(("msg_h", t.id));
                    if let Some(g) = gone {
                        let g = egui::emath::easing::cubic_in_out(g.clamp(0.0, 1.0));
                        let mut ignored = Vec::new();
                        widgets::clip_height(ui, height_id, g, |ui| {
                            ui.multiply_opacity(g);
                            egui::Frame::new().inner_margin(Margin { left: 14, right: 14, top, bottom: 1 }).show(ui, |ui| self.bubble(ui, t, first, &mut ignored));
                        });
                        continue;
                    }
                    let e = self.appear(t.id);
                    animating |= e < 1.0;
                    let r = egui::Frame::new().inner_margin(Margin { left: 14, right: 14, top, bottom: 1 }).show(ui, |ui| {
                        ui.multiply_opacity(e);
                        ui.add_space((1.0 - e) * 10.0);
                        self.bubble(ui, t, first, &mut actions)
                    });
                    if e >= 1.0 {
                        ui.ctx().data_mut(|d| d.insert_temp(height_id, r.response.rect.height()));
                    }
                }
                if animating {
                    ui.ctx().request_repaint();
                }
                drop(rows);
                drop(txs);
                self.txs = live;
                self.leaving = leaving;
                if self.zipping > 0 {
                    egui::Frame::new().inner_margin(Margin::symmetric(14, 4)).show(ui, |ui| {
                        ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
                            ui.add_space(34.0);
                            ui.spinner();
                            ui.label(widgets::sub(&p, self.t("preparing_folder")));
                        });
                    });
                }
                ui.add_space(8.0);
            });
            self.run_actions(ui.ctx(), actions);
        });
    }

    fn chat_header(&mut self, ui: &mut Ui) {
        let p = self.pal;
        Frame::new().inner_margin(Margin { left: 14, right: 14, top: 8, bottom: 8 }).show(ui, |ui| {
            // The window title bar already shows the app name and icon; the header carries status only.
            ui.horizontal(|ui| {
                let n = self.clients.len();
                let (color, text) = if !self.server_ready() {
                    (p.sub_text, self.t("starting_server").to_string())
                } else if n == 0 {
                    (p.sub_text, self.t("no_devices").to_string())
                } else {
                    let names: Vec<&str> = self.clients.iter().map(|c| c.name.as_str()).collect();
                    (p.success, if n <= 2 { names.join(", ") } else { format!("{n} {}", self.t("connected_devices").to_lowercase()) })
                };
                let (r, _) = ui.allocate_exact_size(vec2(8.0, 8.0), Sense::hover());
                // Two soft ripples when a device connects.
                if let Some(age) = self.joined_at.map(|t| t.elapsed().as_secs_f32()).filter(|a| *a < 2.4) {
                    let f = (age % 1.2) / 1.2;
                    ui.painter().circle_filled(r.center(), 4.0 + 9.0 * f, color.gamma_multiply(0.45 * (1.0 - f)));
                    ui.ctx().request_repaint();
                }
                ui.painter().circle_filled(r.center(), 4.0, color);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if self.server_ready() && self.port != 0 {
                        self.address_pill(ui);
                    }
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                        ui.add(egui::Label::new(RichText::new(text).size(12.5).color(if n > 0 { p.text } else { p.sub_text })).truncate());
                    });
                });
            });
        });
        let r = ui.max_rect();
        let y = ui.cursor().top();
        ui.painter().hline(r.x_range(), y, Stroke::new(1.0, p.border));
    }

    /// Server address in the header; hover reveals copy, click copies the full URL.
    fn address_pill(&mut self, ui: &mut Ui) {
        let p = self.pal;
        let shown = format!("{}:{}", self.current_ip(), self.port);
        let font = egui::FontId::proportional(12.5);
        let galley = ui.painter().layout_no_wrap(shown, font, p.text);
        let size = vec2(galley.size().x + 40.0, 26.0);
        let (rect, resp) = ui.allocate_exact_size(size, Sense::click());
        let copied_id = resp.id.with("copied");
        if resp.clicked() {
            ui.ctx().copy_text(self.server_url());
            // Read the time first: nesting ui.input inside data_mut deadlocks the context.
            let now = ui.input(|i| i.time);
            ui.ctx().data_mut(|d| d.insert_temp(copied_id, now));
            self.toast(self.t("link_copied").to_string(), ToastKind::Success);
        }
        let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.15);
        let since = ui.ctx().data(|d| d.get_temp::<f64>(copied_id)).map(|t| ui.input(|i| i.time) - t);
        let copied = since.is_some_and(|s| s < 1.5);
        if copied {
            ui.ctx().request_repaint_after(std::time::Duration::from_millis(100));
        }
        let painter = ui.painter();
        painter.rect_filled(rect, 13, widgets::lerp_color(p.input, p.accent_soft, h));
        painter.rect_stroke(rect, 13, Stroke::new(1.0, widgets::lerp_color(p.border, p.accent.gamma_multiply(0.5), h)), egui::StrokeKind::Inside);
        let text_pos = egui::pos2(rect.left() + 10.0, rect.center().y - galley.size().y / 2.0);
        painter.galley(text_pos, galley, widgets::lerp_color(p.sub_text, p.text, h));
        // Link icon at rest, copy icon on hover, check right after copying.
        let ic = egui::pos2(rect.right() - 15.0, rect.center().y);
        let ifont = egui::FontId::proportional(14.0);
        if copied {
            painter.text(ic, egui::Align2::CENTER_CENTER, icon::CHECK, ifont, p.success);
        } else {
            painter.text(ic, egui::Align2::CENTER_CENTER, icon::LINK_SIMPLE, ifont.clone(), p.sub_text.gamma_multiply(1.0 - h));
            painter.text(ic, egui::Align2::CENTER_CENTER, icon::COPY, ifont, p.accent.gamma_multiply(h));
        }
        resp.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_text(self.t("copy"));
    }

    fn empty_state(&mut self, ui: &mut Ui) {
        let p = self.pal;
        ui.vertical_centered(|ui| {
            ui.add_space((ui.available_height() * 0.28).max(20.0));
            let (rect, resp) = ui.allocate_exact_size(vec2(240.0, 124.0), Sense::click());
            let hovered = resp.hovered();
            // On hover the card warms up and the icon lifts.
            let h = ui.ctx().animate_bool_with_time(resp.id, hovered, 0.18);
            let lift = egui::emath::easing::cubic_out(h);
            ui.painter().rect_filled(rect, 14, if hovered { p.accent_soft } else { p.card });
            ui.painter().rect_stroke(rect, 14, Stroke::new(1.5, if hovered { p.accent } else { p.border }), egui::StrokeKind::Inside);
            ui.painter().text(rect.center() - vec2(0.0, 18.0 + 5.0 * lift), egui::Align2::CENTER_CENTER, icon::UPLOAD_SIMPLE, egui::FontId::proportional(32.0 + 3.0 * lift), p.accent);
            ui.painter().text(rect.center() + vec2(0.0, 20.0), egui::Align2::CENTER_CENTER, self.t("share_file"), egui::FontId::new(15.0, theme::semibold()), p.text);
            ui.painter().text(rect.center() + vec2(0.0, 40.0), egui::Align2::CENTER_CENTER, self.t("click_to_browse"), egui::FontId::proportional(12.0), p.sub_text);
            if resp.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                self.pick_files();
            }
            ui.add_space(12.0);
            ui.label(widgets::sub(&p, self.t("paste_hint")));
        });
    }

    fn composer(&mut self, ui: &mut Ui) {
        let p = self.pal;
        let text_on = self.settings.text_transfer_enabled;
        if self.text_mode && text_on {
            let id = Id::new(COMPOSER_ID);
            // Enter sends, Shift+Enter inserts a newline.
            let had_focus = ui.memory(|m| m.has_focus(id));
            if had_focus && ui.input_mut(|i| i.consume_key(Modifiers::NONE, Key::Enter)) {
                self.send_text();
            }
            // Close · field · send, all vertically centred on one line.
            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                let btn = 32.0;
                let (rect, close) = ui.allocate_exact_size(vec2(btn, btn), Sense::click());
                let hover = ui.ctx().animate_bool_with_time(close.id, close.hovered(), 0.12);
                ui.painter().circle_filled(rect.center(), btn / 2.0, widgets::lerp_color(p.input, p.icon_bg, hover));
                ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, icon::X, egui::FontId::proportional(15.0), widgets::lerp_color(p.sub_text, p.text, hover));
                let close = close.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_text(self.t("close_text_input"));
                if close.clicked() || (had_focus && ui.input(|i| i.key_pressed(Key::Escape))) {
                    self.text_mode = false;
                }
                let send_w = btn;
                let field_w = ui.available_width() - send_w - ui.spacing().item_spacing.x;
                let edit = egui::TextEdit::multiline(&mut self.draft)
                    .id(id)
                    .desired_rows(1)
                    .hint_text(self.i18n.t("type_message"))
                    .desired_width(field_w)
                    .margin(Margin::symmetric(10, 7))
                    .background_color(p.input)
                    .return_key(Some(egui::KeyboardShortcut::new(Modifiers::SHIFT, Key::Enter)));
                let resp = egui::ScrollArea::vertical()
                    .max_height(120.0)
                    .max_width(field_w)
                    .auto_shrink([false, true])
                    .show(ui, |ui| ui.add(edit))
                    .inner;
                if !had_focus && !resp.has_focus() && self.draft.is_empty() {
                    resp.request_focus();
                }
                let (rect, btn) = ui.allocate_exact_size(vec2(send_w, send_w), Sense::click());
                let enabled = !self.draft.trim().is_empty();
                let fill = if enabled { p.accent } else { p.border };
                ui.painter().circle_filled(rect.center(), 16.0, fill);
                ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, icon::PAPER_PLANE_RIGHT, egui::FontId::proportional(15.0), theme::on(fill));
                if btn.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() && enabled {
                    self.send_text();
                    ui.memory_mut(|m| m.request_focus(id));
                }
            });
        } else {
            ui.horizontal(|ui| {
                if widgets::primary(ui, &p, &format!("{} {}", icon::PAPERCLIP, self.t("select_files"))).clicked() {
                    self.pick_files();
                }
                if text_on && widgets::secondary(ui, &p, &format!("{} {}", icon::CHAT_TEXT, self.t("send_text"))).clicked() {
                    self.text_mode = true;
                }
                // The empty state already explains drop/paste; don't repeat it.
                if self.wide && !self.txs.is_empty() {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.add(egui::Label::new(widgets::sub(&p, self.t("paste_hint"))).truncate());
                    });
                }
            });
        }
    }

    fn bubble(&mut self, ui: &mut Ui, t: &Transaction, first: bool, actions: &mut Vec<Action>) {
        let p = self.pal;
        let mine = t.is_outgoing();
        let layout = if mine { Layout::right_to_left(Align::Min) } else { Layout::left_to_right(Align::Min) };
        let max_w = (ui.available_width() - 40.0).clamp(160.0, 480.0);
        // Tools show while the pointer is anywhere on this message's row (bubble, time and
        // tools line, full chat width), so they stay reachable. Uses last frame's row rect.
        let key = Id::new(("msg_row", t.id));
        let hovered = ui.ctx().data(|d| d.get_temp::<egui::Rect>(key)).is_some_and(|r| ui.rect_contains_pointer(r));
        let row = ui.with_layout(layout, |ui| {
            ui.spacing_mut().item_spacing.x = 8.0;
            if first {
                let (glyph, bg, fg) = if mine {
                    (widgets::platform_icon(std::env::consts::OS), p.accent, theme::on(p.accent))
                } else {
                    (widgets::platform_icon(self.client_platform(&t.sender_id)), p.icon_bg, p.icon_text)
                };
                widgets::avatar(ui, bg, fg, glyph, 26.0);
            } else {
                ui.add_space(26.0);
            }
            ui.allocate_ui_with_layout(vec2(max_w, 0.0), Layout::top_down(if mine { Align::Max } else { Align::Min }), |ui| {
                ui.spacing_mut().item_spacing.y = 2.0;
                if first && !mine {
                    ui.label(widgets::bold(self.client_name(&t.sender_id), 12.5).color(p.text));
                }
                match t.kind {
                    Kind::Text => self.text_bubble(ui, t, mine, hovered, actions),
                    Kind::File => self.file_bubble(ui, t, mine, max_w, hovered, actions),
                }
            });
        });
        let rect = egui::Rect::from_x_y_ranges(ui.max_rect().x_range(), row.response.rect.y_range());
        ui.ctx().data_mut(|d| d.insert_temp(key, rect));
        if ui.rect_contains_pointer(rect) != hovered {
            ui.ctx().request_repaint();
        }
    }

    fn text_bubble(&mut self, ui: &mut Ui, t: &Transaction, mine: bool, hovered: bool, actions: &mut Vec<Action>) {
        let p = self.pal;
        let (fill, fg) = if mine { (p.accent, theme::on(p.accent)) } else { (p.bubble_other, p.text) };
        Frame::new()
            .fill(fill)
            .stroke(if mine { Stroke::NONE } else { Stroke::new(1.0, p.border) })
            .corner_radius(egui::CornerRadius { nw: if mine { 14 } else { 4 }, ne: if mine { 4 } else { 14 }, sw: 14, se: 14 })
            .inner_margin(Margin::symmetric(10, 6))
            .show(ui, |ui| {
                ui.add(egui::Label::new(RichText::new(&t.text_content).color(fg)).selectable(true).wrap());
            });
        ui.horizontal(|ui| {
            ui.label(widgets::sub(&p, time_of(t)));
            let a = ui.ctx().animate_bool_with_time(Id::new(("tools", t.id)), hovered, 0.15);
            if a > 0.0 {
                ui.multiply_opacity(a);
                if widgets::icon_btn(ui, &p, icon::COPY, self.t("copy")).clicked() {
                    actions.push(Action::Copy(t.text_content.clone()));
                }
                if widgets::icon_btn(ui, &p, icon::TRASH, self.t("delete")).clicked() {
                    actions.push(Action::Delete { id: t.id, has_file: false, outgoing: mine, finished_badly: true });
                }
            }
        });
    }

    fn file_bubble(&mut self, ui: &mut Ui, t: &Transaction, mine: bool, max_w: f32, hovered: bool, actions: &mut Vec<Action>) {
        let p = self.pal;
        let path = t.local_path();
        let exists = path.as_ref().is_some_and(|p| p.is_file());
        let bad = matches!(t.status, Status::Cancelled | Status::Failed);
        let receiving = !mine && t.status == Status::InProgress;
        let usable = exists && !bad && !receiving;

        Frame::new()
            .fill(p.card)
            .stroke(Stroke::new(1.0, if mine { p.accent.gamma_multiply(0.45) } else { p.border }))
            .corner_radius(14)
            .inner_margin(8)
            .show(ui, |ui| {
                ui.set_width(max_w.min(340.0));
                ui.horizontal(|ui| {
                    // Thumbnail or type icon; click opens the file.
                    let thumb = if usable && thumbs::is_image(&t.filename) { path.as_ref().and_then(|pp| self.thumbs.get(ui.ctx(), pp)) } else { None };
                    let (rect, r) = ui.allocate_exact_size(vec2(40.0, 40.0), Sense::click());
                    match &thumb {
                        Some(tex) => {
                            let img = egui::Image::new(tex).fit_to_exact_size(rect.size()).corner_radius(8);
                            // Cover-crop to a square.
                            let s = tex.size_vec2();
                            let m = s.x.min(s.y);
                            let uv = egui::Rect::from_center_size(egui::pos2(0.5, 0.5), vec2(m / s.x, m / s.y));
                            img.uv(uv).paint_at(ui, rect);
                        }
                        None => {
                            ui.painter().rect_filled(rect, 8, if mine { p.accent_soft } else { p.icon_bg });
                            let c = if bad { p.sub_text } else if mine { p.accent } else { p.icon_text };
                            ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, file_icon(&t.filename), egui::FontId::proportional(20.0), c);
                        }
                    }
                    if usable && r.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                        if let Some(pp) = &path {
                            actions.push(Action::Open(pp.clone()));
                        }
                    }
                    ui.vertical(|ui| {
                        ui.add(egui::Label::new(widgets::bold(&t.filename, 13.5).color(p.text)).truncate()).on_hover_text(&t.filename);
                        let status = match t.status {
                            Status::Cancelled => Some((self.t("cancelled").to_string(), p.danger)),
                            Status::Failed => Some((self.t("failed").to_string(), p.danger)),
                            Status::Completed if !mine => Some((self.t("received").to_string(), p.success)),
                            _ => None,
                        };
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 4.0;
                            ui.label(widgets::sub(&p, format_bytes(t.file_size.max(t.bytes_transferred))));
                            if let Some((s, c)) = status {
                                ui.label(widgets::sub(&p, "·"));
                                ui.label(RichText::new(s).size(12.0).color(c));
                            }
                            if !exists && !bad && !receiving {
                                ui.label(widgets::sub(&p, "·"));
                                ui.label(RichText::new(self.t("file_missing")).size(12.0).color(p.danger));
                            }
                        });
                    });
                });

                if receiving {
                    ui.add_space(4.0);
                    let frac = if t.file_size > 0 { t.bytes_transferred as f32 / t.file_size as f32 } else { 0.0 };
                    self.progress_row(ui, Id::new(("prog", t.id)), frac, t.bytes_transferred, t.file_size, self.speed(t.id, ""), || {
                        actions.push(Action::CancelUpload { id: t.id, file: t.filename.clone() })
                    });
                }
                if mine && !bad {
                    self.client_rows(ui, t, actions);
                }
            });

        // Actions and time under the bubble; tools show on hover to keep the stream calm.
        ui.horizontal(|ui| {
            ui.label(widgets::sub(&p, time_of(t)));
            let a = ui.ctx().animate_bool_with_time(Id::new(("tools", t.id)), hovered, 0.15);
            if a <= 0.0 {
                return;
            }
            ui.multiply_opacity(a);
            if let (true, Some(pp)) = (usable, &path) {
                if widgets::icon_btn(ui, &p, icon::ARROW_SQUARE_OUT, self.t("open")).clicked() {
                    actions.push(Action::Open(pp.clone()));
                }
                if widgets::icon_btn(ui, &p, icon::APP_WINDOW, self.t("open_with")).clicked() {
                    actions.push(Action::OpenWith(pp.clone()));
                }
                if widgets::icon_btn(ui, &p, icon::FOLDER_OPEN, self.t("show_in_folder")).clicked() {
                    actions.push(Action::Reveal(pp.clone()));
                }
            }
            if !receiving && widgets::icon_btn(ui, &p, icon::TRASH, self.t("delete")).clicked() {
                actions.push(Action::Delete { id: t.id, has_file: exists, outgoing: mine, finished_badly: bad });
            }
        });
    }

    /// Download progress of a shared file, per device.
    fn client_rows(&mut self, ui: &mut Ui, t: &Transaction, actions: &mut Vec<Action>) {
        let p = self.pal;
        if t.client_progress.is_empty() {
            ui.add_space(2.0);
            ui.label(widgets::sub(&p, self.t("waiting_for_device")));
            return;
        }
        for (ip, pct) in &t.client_progress {
            ui.add_space(4.0);
            let status = t.client_status.get(ip).copied().unwrap_or(Status::InProgress);
            let device = self.client_name(ip);
            ui.horizontal(|ui| {
                ui.label(RichText::new(widgets::platform_icon(self.client_platform(ip))).color(p.sub_text));
                ui.label(RichText::new(&device).size(12.5));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| match status {
                    Status::Completed => {
                        ui.label(RichText::new(format!("{} {}", icon::CHECK, self.t("sent"))).size(12.0).color(p.success));
                    }
                    Status::Cancelled | Status::Failed => {
                        ui.label(RichText::new(self.t("cancelled")).size(12.0).color(p.danger));
                    }
                    _ => {}
                });
            });
            if !status.is_finished() {
                let bytes = t.client_bytes.get(ip).copied().unwrap_or(0);
                let speed = self.speed(t.id, ip);
                self.progress_row(ui, Id::new(("prog", t.id, ip.as_str())), (*pct / 100.0) as f32, bytes, t.file_size, speed, || {
                    actions.push(Action::CancelClient { id: t.id, ip: ip.clone(), file: t.filename.clone() })
                });
            }
        }
    }

    fn progress_row(&self, ui: &mut Ui, id: Id, frac: f32, bytes: u64, total: u64, bps: f64, on_cancel: impl FnOnce()) {
        let p = self.pal;
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.set_width(ui.available_width() - 34.0);
                widgets::progress(ui, &p, id, frac, p.accent);
                let mut parts = vec![format!("{} / {}", format_bytes(bytes), format_bytes(total))];
                if bps > 0.0 {
                    parts.push(format_speed(bps));
                }
                parts.push(format!("{:.0}%", (frac * 100.0).clamp(0.0, 100.0)));
                ui.label(widgets::sub(&p, parts.join("  ·  ")));
            });
            if widgets::icon_btn_colored(ui, &p, icon::X_CIRCLE, self.t("cancel"), p.danger).clicked() {
                on_cancel();
            }
        });
    }

    fn run_actions(&mut self, ctx: &egui::Context, actions: Vec<Action>) {
        for a in actions {
            match a {
                Action::Open(pp) => peerhop::platform::open_file(&pp),
                Action::OpenWith(pp) => peerhop::platform::open_with(&pp),
                Action::Reveal(pp) => peerhop::platform::show_in_folder(&pp),
                Action::Copy(text) => {
                    ctx.copy_text(text);
                    self.toast(self.t("copied").to_string(), super::app::ToastKind::Success);
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
            }
        }
    }
}
