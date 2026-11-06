//! Side sheets that slide in over the chat: settings, the public room's QR and
//! devices, conversation info, and creating a group.

use eframe::egui;
use egui::{Align, Align2, Color32, FontId, Frame, Id, Key, Layout, RichText, Sense, Stroke, Ui, pos2, vec2};
use egui_phosphor::regular as icon;

use super::app::{App, Sheet, edge_scroll};
use super::rail::Conv;
use super::theme;
use super::widgets;

const SHEET_MAX_W: f32 = 380.0;

impl App {
    pub(crate) fn sheets(&mut self, ctx: &egui::Context) {
        let Some(mut sheet) = self.sheet.take() else { return };
        let p = self.pal;
        let t = ctx.animate_bool_with_time(Id::new("sheet_anim"), self.sheet_open, 0.24);
        if !self.sheet_open && t <= 0.0 {
            return; // fully closed: drop it
        }
        if t < 1.0 {
            ctx.request_repaint();
        }
        let e = egui::emath::easing::cubic_out(t);
        if self.modal.is_none() && ctx.input(|i| i.key_pressed(Key::Escape)) {
            self.sheet_open = false;
        }

        let mut screen = ctx.content_rect();
        screen.min.y += super::titlebar::TITLE_H;
        egui::Area::new(Id::new("sheet_backdrop")).order(egui::Order::Middle).fixed_pos(screen.min).constrain(false).show(ctx, |ui| {
            let (r, resp) = ui.allocate_exact_size(screen.size(), Sense::click());
            ui.painter().rect_filled(r, 0, Color32::from_black_alpha((110.0 * e) as u8));
            if resp.clicked() {
                self.sheet_open = false;
            }
        });

        let w = (screen.width() - 40.0).min(SHEET_MAX_W).max(screen.width().min(260.0));
        let x = screen.right() - w * e;
        let title = match &sheet {
            Sheet::Settings => self.t("settings").to_string(),
            Sheet::Public => self.t("public_title").to_string(),
            Sheet::Info(_) => self.t("info").to_string(),
            Sheet::NewGroup { .. } => self.t("new_group").to_string(),
        };
        egui::Area::new(Id::new("sheet")).order(egui::Order::Foreground).fixed_pos(pos2(x, screen.top())).constrain(false).show(ctx, |ui| {
            Frame::new()
                .fill(p.bg)
                .shadow(egui::Shadow { offset: [-6, 0], blur: 28, spread: 0, color: Color32::from_black_alpha((if p.dark { 120.0 } else { 50.0 } * e) as u8) })
                .show(ui, |ui| {
                    ui.set_width(w);
                    ui.set_height(screen.height());
                    ui.spacing_mut().item_spacing.y = 6.0;
                    // Header: close + title.
                    let (head, _) = ui.allocate_exact_size(vec2(w, 54.0), Sense::hover());
                    ui.painter().rect_filled(head, 0, p.panel);
                    ui.painter().hline(head.x_range(), head.bottom() - 0.5, Stroke::new(1.0, p.border));
                    let mut head_ui = ui.new_child(egui::UiBuilder::new().max_rect(head.shrink2(vec2(8.0, 0.0))).layout(Layout::left_to_right(Align::Center)));
                    if widgets::icon_btn_big(&mut head_ui, &p, icon::X, self.t("close")).clicked() {
                        self.sheet_open = false;
                    }
                    head_ui.label(widgets::bold(title, 16.0).color(p.text));
                    ui.add_space(4.0);
                    // Content rises in a beat after the panel.
                    let c = egui::emath::easing::cubic_out(((t - 0.25) / 0.75).clamp(0.0, 1.0));
                    ui.multiply_opacity(c);
                    edge_scroll(ui, |ui| match &mut sheet {
                        Sheet::Settings => self.settings_panel(ui),
                        Sheet::Public => self.public_sheet(ui),
                        Sheet::Info(conv) => {
                            let conv = conv.clone();
                            self.info_sheet(ui, &conv);
                        }
                        Sheet::NewGroup { picked } => self.new_group_sheet(ui, picked),
                    });
                });
        });
        // Content may have opened another sheet meanwhile; that one wins.
        if self.sheet.is_none() {
            self.sheet = Some(sheet);
        }
    }

    fn big_face(&self, ui: &mut Ui, conv: &Conv) {
        let p = self.pal;
        let Some(item) = self.conv_item(conv) else { return };
        ui.vertical_centered(|ui| {
            ui.add_space(6.0);
            let (r, _) = ui.allocate_exact_size(vec2(84.0, 84.0), Sense::hover());
            let fill = if item.online || matches!(conv, Conv::Group(_)) { item.color } else { widgets::lerp_color(item.color, p.icon_bg, 0.6) };
            let label = item.glyph.map(str::to_string).unwrap_or_else(|| widgets::initials(&item.name));
            widgets::face(ui.painter(), r, fill, &label, 0.0);
            if item.online && !matches!(conv, Conv::Group(_)) {
                widgets::glyph_badge(ui.painter(), r.right_bottom() - vec2(10.0, 10.0), widgets::platform_icon(item.badge), p.success, Color32::WHITE, p.bg, 1.4);
            }
            ui.add_space(4.0);
            ui.label(widgets::bold(&item.name, 18.0).color(p.text));
            ui.label(RichText::new(&item.sub).size(12.5).color(if item.online { p.accent } else { p.sub_text }));
        });
        ui.add_space(8.0);
    }

    fn info_sheet(&mut self, ui: &mut Ui, conv: &Conv) {
        let p = self.pal;
        self.big_face(ui, conv);
        let targets = self.conv_targets(conv);

        // Quick actions, Telegram profile style.
        ui.horizontal(|ui| {
            let n = 2.0;
            let w = (ui.available_width() - 6.0 * (n - 1.0)) / n;
            let ready = !targets.is_empty();
            if action_tile(ui, &p, icon::PAPERCLIP, self.t("send_files"), w, ready).clicked() {
                self.close_sheet();
                self.pick_files();
            }
            if action_tile(ui, &p, icon::FOLDER_SIMPLE_PLUS, self.t("send_folder"), w, ready).clicked() {
                if let Some(dir) = rfd::FileDialog::new().pick_folder() {
                    self.close_sheet();
                    self.share_paths(vec![dir]);
                }
            }
        });
        ui.add_space(4.0);

        match conv {
            Conv::Desktop(name) => {
                widgets::card(ui, &p, |ui| {
                    let mut saved = self.settings.saved_desktops.contains(name);
                    if widgets::switch_row(ui, &p, self.t("save_contact"), self.t("save_hint"), &mut saved) {
                        let name = name.clone();
                        self.toggle_saved(&name);
                    }
                });
            }
            Conv::Group(g) => self.group_editor(ui, *g),
            _ => {}
        }

        // What happened in this conversation.
        let keys = self.conv_keys(conv);
        let (mut sent, mut got, mut bytes) = (0, 0, 0u64);
        for t in self.txs.iter().filter(|t| Self::in_conv(conv, &keys, t)) {
            if t.is_outgoing() {
                sent += 1;
            } else {
                got += 1;
            }
            bytes += t.file_size;
        }
        widgets::section_title(ui, &p, self.t("this_session"));
        widgets::card(ui, &p, |ui| {
            stat_row(ui, &p, icon::ARROW_UP_RIGHT, self.t("sent"), &sent.to_string());
            stat_row(ui, &p, icon::ARROW_DOWN_LEFT, self.t("received"), &got.to_string());
            stat_row(ui, &p, icon::DATABASE, self.t("total_size"), &peerhop::util::format_bytes(bytes));
        });
    }

    fn group_editor(&mut self, ui: &mut Ui, gid: u32) {
        let p = self.pal;
        let Some(gi) = self.groups.iter().position(|g| g.id == gid) else { return };
        let online: Vec<peerhop::p2p::WebPeer> = self.web.peers();
        widgets::section_title(ui, &p, &format!("{} · {}", self.t("members"), self.groups[gi].members.len()));
        let members = self.groups[gi].members.clone();
        let mut remove = None;
        widgets::card(ui, &p, |ui| {
            if members.is_empty() {
                ui.label(widgets::sub(&p, self.t("no_members")));
            }
            for m in &members {
                let (name, kind) = self.known.get(m).map(|k| (k.name.clone(), k.kind)).unwrap_or_else(|| (self.t("web_device").to_string(), "web"));
                let live = online.iter().any(|o| &o.id == m);
                let sub = if live { self.t("online") } else { self.t("offline") }.to_string();
                if person_row(ui, &p, m, &name, &sub, kind, live, Some(icon::X)).clicked() {
                    remove = Some(m.clone());
                }
            }
        });
        if let Some(m) = remove {
            self.groups[gi].members.retain(|x| *x != m);
        }
        let addable: Vec<&peerhop::p2p::WebPeer> = online.iter().filter(|o| !members.contains(&o.id)).collect();
        if !addable.is_empty() {
            widgets::section_title(ui, &p, self.t("add_members"));
            let mut add = None;
            widgets::card(ui, &p, |ui| {
                for o in addable {
                    if person_row(ui, &p, &o.id, &o.name, &o.device.label, o.device.icon_kind(), true, Some(icon::PLUS)).clicked() {
                        add = Some(o.id.clone());
                    }
                }
            });
            if let Some(a) = add {
                self.groups[gi].members.push(a);
            }
        }
        ui.add_space(8.0);
        if widgets::filled(ui, p.danger, &format!("{}  {}", icon::TRASH, self.t("delete_group"))).clicked() {
            self.delete_group(gid);
        }
    }

    fn new_group_sheet(&mut self, ui: &mut Ui, picked: &mut Vec<String>) {
        let p = self.pal;
        ui.add(egui::Label::new(widgets::sub(&p, self.t("new_group_hint"))).wrap());
        let peers = self.web.peers();
        widgets::section_title(ui, &p, &format!("{} · {}/{}", self.t("pick_members"), picked.len(), peers.len()));
        widgets::card(ui, &p, |ui| {
            if peers.is_empty() {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(icon::GLOBE_HEMISPHERE_WEST).size(18.0).color(p.sub_text));
                    ui.add(egui::Label::new(widgets::sub(&p, self.t("web_empty"))).wrap());
                });
                return;
            }
            for peer in &peers {
                let on = picked.contains(&peer.id);
                if check_row(ui, &p, &peer.id, &peer.name, &peer.device.label, peer.device.icon_kind(), on).clicked() {
                    if on {
                        picked.retain(|x| *x != peer.id);
                    } else {
                        picked.push(peer.id.clone());
                    }
                }
            }
        });
        ui.add_space(8.0);
        let ok = !picked.is_empty();
        ui.add_enabled_ui(ok, |ui| {
            if widgets::primary(ui, &p, &format!("{}  {}", icon::SHARE_NETWORK, self.t("create"))).clicked() {
                let members = std::mem::take(picked);
                self.create_group(members);
                self.close_sheet();
            }
        });
    }
}

fn action_tile(ui: &mut Ui, p: &theme::Palette, glyph: &str, text: &str, w: f32, enabled: bool) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(vec2(w, 58.0), if enabled { Sense::click() } else { Sense::hover() });
    let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered() && enabled, 0.12);
    ui.painter().rect_filled(rect, 12, widgets::lerp_color(p.card, p.accent_soft, h));
    let c = if enabled { p.accent } else { p.sub_text.gamma_multiply(0.5) };
    ui.painter().text(rect.center() - vec2(0.0, 9.0 + 2.0 * h), Align2::CENTER_CENTER, glyph, FontId::proportional(20.0), c);
    ui.painter().text(rect.center() + vec2(0.0, 13.0), Align2::CENTER_CENTER, text, FontId::proportional(12.0), if enabled { p.text } else { p.sub_text });
    if h > 0.0 && h < 1.0 {
        ui.ctx().request_repaint();
    }
    if enabled { resp.on_hover_cursor(egui::CursorIcon::PointingHand) } else { resp }
}

fn stat_row(ui: &mut Ui, p: &theme::Palette, glyph: &str, label: &str, value: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(glyph).size(16.0).color(p.accent));
        ui.label(label);
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| ui.label(widgets::bold(value, 13.5).color(p.text)));
    });
}

/// Person row: avatar, name, subtitle, optional trailing glyph button (whole row clicks).
fn person_row(ui: &mut Ui, p: &theme::Palette, id: &str, name: &str, sub: &str, kind: &str, online: bool, trailing: Option<&str>) -> egui::Response {
    let (row, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 44.0), Sense::click());
    let h = ui.ctx().animate_bool_with_time(Id::new(("person", id, trailing)), resp.hovered(), 0.12);
    if h > 0.0 {
        ui.painter().rect_filled(row.expand2(vec2(4.0, 0.0)), 8, p.icon_bg.gamma_multiply(h * 0.7));
    }
    let face = egui::Rect::from_min_size(pos2(row.left(), row.center().y - 17.0), vec2(34.0, 34.0));
    let col = widgets::name_color(name);
    widgets::face(ui.painter(), face, if online { col } else { widgets::lerp_color(col, p.icon_bg, 0.6) }, &widgets::initials(name), 0.0);
    let (bg, fg) = if online { (p.success, Color32::WHITE) } else { (p.icon_bg, p.icon_text) };
    widgets::glyph_badge(ui.painter(), face.right_bottom() - vec2(3.0, 3.0), widgets::platform_icon(kind), bg, fg, p.card, 0.9);
    let tx = face.right() + 10.0;
    let max_w = row.right() - tx - 30.0;
    let ng = ui.painter().layout(name.to_string(), FontId::new(13.5, theme::semibold()), p.text, max_w);
    ui.painter().galley(pos2(tx, row.center().y - 16.0), ng, p.text);
    let sg = ui.painter().layout(sub.to_string(), FontId::proportional(12.0), p.sub_text, max_w);
    ui.painter().galley(pos2(tx, row.center().y + 1.0), sg, p.sub_text);
    if let Some(g) = trailing {
        ui.painter().text(pos2(row.right() - 12.0, row.center().y), Align2::CENTER_CENTER, g, FontId::proportional(16.0), widgets::lerp_color(p.sub_text, p.accent, h));
    }
    if h > 0.0 && h < 1.0 {
        ui.ctx().request_repaint();
    }
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Selectable person row with an animated round check (Telegram's member picker).
fn check_row(ui: &mut Ui, p: &theme::Palette, id: &str, name: &str, sub: &str, kind: &str, on: bool) -> egui::Response {
    let resp = person_row(ui, p, id, name, sub, kind, true, None);
    let t = ui.ctx().animate_bool_with_time(Id::new(("check", id)), on, 0.18);
    let c = pos2(resp.rect.right() - 14.0, resp.rect.center().y);
    ui.painter().circle_stroke(c, 10.0, Stroke::new(1.5, widgets::lerp_color(p.border, p.accent, t)));
    if t > 0.0 {
        ui.painter().circle_filled(c, 10.0 * egui::emath::easing::back_out(t), p.accent);
        ui.painter().text(c, Align2::CENTER_CENTER, icon::CHECK, FontId::proportional(13.0 * t), Color32::WHITE);
    }
    if t > 0.0 && t < 1.0 {
        ui.ctx().request_repaint();
    }
    resp
}
