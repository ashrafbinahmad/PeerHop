//! Public room: QR code, networks, link, and the devices that joined.

use eframe::egui;
use egui::{Align, Align2, FontId, Layout, Rect, RichText, Sense, Stroke, Ui, pos2, vec2};
use egui_phosphor::regular as icon;

use peerhop::net::{NetKind, NetworkProfile};

use super::app::{App, Modal, RestartReason, ToastKind};
use super::theme;
use super::widgets;

const MAX_NAME: usize = 20;
const CARD_MIN_W: f32 = 158.0;
const CARD_H: f32 = 112.0;
const WEB_HOST: &str = "web.peerhop.in";

impl App {
    /// QR + network choice + link: everything a phone needs to join.
    pub(crate) fn connect_card(&mut self, ui: &mut Ui) {
        let p = self.pal;
        ui.vertical_centered(|ui| {
            ui.spacing_mut().item_spacing.y = 4.0;
            ui.label(widgets::bold(self.t("public_connect_title"), 15.0).color(p.text));
            ui.add(egui::Label::new(widgets::sub(&p, self.t("public_connect_hint"))).wrap());
            ui.add_space(6.0);
            if self.server_ready() {
                let url = self.server_url();
                let logo = self.logo.clone();
                // The code fades/scales in when the address changes (network switch, restart).
                let id = egui::Id::new("qr_url");
                let changed = ui.ctx().data(|d| d.get_temp::<String>(id)).as_deref() != Some(url.as_str());
                if changed {
                    let now = ui.input(|i| i.time);
                    ui.ctx().data_mut(|d| {
                        d.insert_temp(id, url.clone());
                        d.insert_temp(id.with("t"), now);
                    });
                }
                let since = ui.input(|i| i.time) - ui.ctx().data(|d| d.get_temp::<f64>(id.with("t"))).unwrap_or(0.0);
                let e = egui::emath::easing::back_out((since as f32 / 0.4).min(1.0));
                if e < 1.0 {
                    ui.ctx().request_repaint();
                }
                let size = 168.0_f32.min(ui.available_width());
                ui.scope(|ui| {
                    ui.multiply_opacity(e.min(1.0));
                    widgets::qr(ui, &mut self.qr, &url, size * (0.85 + 0.15 * e), Some(&logo));
                });
                ui.add_space(2.0);
                let shown = url.split("/?").next().unwrap_or(&url).trim_start_matches("http://").to_string();
                let r = ui.add(egui::Button::new(RichText::new(format!("{}  {shown}", icon::COPY)).size(12.0).color(p.accent)).fill(p.accent_soft).corner_radius(12).min_size(vec2(0.0, 24.0)));
                if r.on_hover_cursor(egui::CursorIcon::PointingHand).on_hover_text(self.t("copy")).clicked() {
                    ui.ctx().copy_text(url);
                    self.toast(self.t("link_copied").to_string(), ToastKind::Success);
                }
            } else {
                ui.add_space(50.0);
                ui.spinner();
                ui.label(widgets::sub(&p, self.t("starting_server")));
                ui.add_space(50.0);
            }
        });
        ui.add_space(8.0);
        self.networks_list(ui);
    }

    /// Body of the public room's side sheet.
    pub(crate) fn public_sheet(&mut self, ui: &mut Ui) {
        let p = self.pal;
        widgets::card(ui, &p, |ui| self.connect_card(ui));
        ui.add_space(6.0);
        self.devices(ui);
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if self.restarting {
                ui.spinner();
                ui.label(widgets::sub(&p, self.t("restarting")));
            } else if widgets::secondary(ui, &p, &format!("{}  {}", icon::ARROWS_CLOCKWISE, self.t("restart_server"))).clicked() {
                self.request_restart(RestartReason::Manual);
            }
        });
    }

    fn devices(&mut self, ui: &mut Ui) {
        let p = self.pal;
        widgets::section_title(ui, &p, &format!("{} · {}", self.t("connected_devices"), self.clients.len()));
        if self.clients.is_empty() {
            widgets::card(ui, &p, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(icon::WIFI_SLASH).size(18.0).color(p.sub_text));
                    ui.label(widgets::sub(&p, self.t("no_devices")));
                });
            });
            return;
        }
        let clients = self.clients.clone();
        for c in &clients {
            widgets::card(ui, &p, |ui| {
                ui.horizontal(|ui| {
                    let (r, _) = ui.allocate_exact_size(vec2(34.0, 34.0), Sense::hover());
                    widgets::face(ui.painter(), r, widgets::name_color(&c.name), &widgets::initials(&c.name), 0.0);
                    widgets::glyph_badge(ui.painter(), r.right_bottom() - vec2(3.0, 3.0), widgets::platform_icon(&c.platform), p.icon_bg, p.icon_text, p.card, 1.0);
                    ui.vertical(|ui| {
                        let buf = self.client_names.entry(c.ip.clone()).or_insert_with(|| c.name.clone());
                        let resp = ui.add(
                            egui::TextEdit::singleline(buf)
                                .char_limit(MAX_NAME)
                                .frame(egui::Frame::new())
                                .font(egui::TextStyle::Body)
                                .desired_width(ui.available_width() - 20.0),
                        );
                        if resp.lost_focus() {
                            let name = buf.trim().to_string();
                            if !name.is_empty() && name != c.name {
                                self.hub.rename_client(&c.ip, &name);
                            } else {
                                *buf = c.name.clone();
                            }
                        } else if !resp.has_focus() {
                            *buf = c.name.clone();
                        }
                        resp.on_hover_text(self.i18n.t("host_name"));
                        ui.horizontal(|ui| {
                            let (dot, state) = if c.blocked {
                                (p.danger, self.t("blocked"))
                            } else if c.sending_blocked {
                                (theme_warn(), self.t("sending_disabled"))
                            } else {
                                (p.success, self.t("active"))
                            };
                            let (r, _) = ui.allocate_exact_size(vec2(7.0, 7.0), Sense::hover());
                            ui.painter().circle_filled(r.center(), 3.5, dot);
                            ui.label(widgets::sub(&p, format!("{state} · {}", c.ip)));
                        });
                    });
                });
                ui.horizontal(|ui| {
                    let (label, next) = if c.sending_blocked {
                        (format!("{}  {}", icon::UPLOAD_SIMPLE, self.t("allow_sending")), false)
                    } else {
                        (format!("{}  {}", icon::PROHIBIT, self.t("restrict_sending")), true)
                    };
                    if !c.blocked && small_btn(ui, &p, &label).clicked() {
                        self.hub.set_client_sending_blocked(&c.ip, next);
                        let key = if next { "block_sending" } else { "unblock_sending" };
                        self.toast(format!("{} {}", self.t(key), c.name), ToastKind::Info);
                    }
                    let (label, next) = if c.blocked {
                        (format!("{}  {}", icon::LOCK_OPEN, self.t("unblock")), false)
                    } else {
                        (format!("{}  {}", icon::LOCK, self.t("block")), true)
                    };
                    if small_btn(ui, &p, &label).clicked() {
                        self.hub.set_client_blocked(&c.ip, next);
                        let key = if next { "blocked" } else { "unblocked" };
                        self.toast(format!("{} · {}", self.t(key), c.name), ToastKind::Info);
                    }
                });
            });
            ui.add_space(2.0);
        }
    }

    /// Every way to connect, at once: one card per network, plus web.peerhop.in.
    fn networks_list(&mut self, ui: &mut Ui) {
        let p = self.pal;
        ui.label(widgets::sub(&p, self.t("network_title")));
        ui.add_space(2.0);
        if self.networks.is_empty() && !self.networks_loaded {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label(widgets::sub(&p, self.t("checking_network")));
            });
        }
        let current = self.current_ip();
        // Kept in the order the OS reported them, so picking one doesn't move cards.
        let nets = self.networks.clone();
        let count = nets.len() + 1;
        let gap = 8.0;
        let avail = ui.available_width();
        let cols = ((avail + gap) / (CARD_MIN_W + gap)).floor().clamp(1.0, count as f32) as usize;
        let w = (avail - gap * (cols - 1) as f32) / cols as f32;
        let mut i = 0;
        while i < count {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = gap;
                for _ in 0..cols {
                    if i >= count {
                        break;
                    }
                    match nets.get(i) {
                        Some(n) => self.network_card(ui, n, n.ip == current, w),
                        None => self.web_card(ui, w),
                    }
                    i += 1;
                }
            });
            ui.add_space(gap - ui.spacing().item_spacing.y);
        }
        if self.networks.is_empty() && self.networks_loaded {
            ui.horizontal(|ui| {
                ui.label(RichText::new(icon::WARNING).color(p.danger));
                ui.label(widgets::sub(&p, self.t("unable_to_detect")));
            });
        }
    }

    /// Network card: icon, name, kind · IP, and a status chip. Click to use it.
    fn network_card(&mut self, ui: &mut Ui, n: &NetworkProfile, selected: bool, w: f32) {
        let p = self.pal;
        let (glyph, kind) = match n.kind {
            NetKind::Hotspot => (icon::BROADCAST, self.t("hotspot_name")),
            NetKind::Wifi => (icon::WIFI_HIGH, self.t("wifi_network")),
            NetKind::Ethernet => (icon::PLUGS, self.t("ethernet_network")),
        };
        let title = if n.ssid.is_empty() { n.name.clone() } else { n.ssid.clone() };
        let shown_pw = self.revealed.contains(&n.ssid);
        let line = if shown_pw && !n.password.is_empty() { format!("{} {}", icon::KEY, n.password) } else { format!("{kind} · {}", n.ip) };
        let chip = if selected {
            Some((format!("{} {}", icon::CHECK, self.t("in_use")), p.accent))
        } else if n.kind == NetKind::Hotspot {
            Some((format!("{} {}", icon::LIGHTNING, self.t("faster_badge")), p.success))
        } else {
            None
        };
        let hover_chip = (!selected).then(|| self.t("use_this").to_string());
        let resp = self.card_frame(ui, w, selected, glyph, &title, &line, chip, hover_chip);

        // Actions in the top-right corner (added after the card so they sit on top).
        let mut actions = ui.new_child(egui::UiBuilder::new().max_rect(Rect::from_min_max(pos2(resp.rect.left(), resp.rect.top() + 6.0), pos2(resp.rect.right() - 6.0, resp.rect.top() + 32.0))).layout(Layout::right_to_left(Align::Center)));
        actions.spacing_mut().item_spacing.x = 0.0;
        if !n.ssid.is_empty() && n.kind != NetKind::Ethernet && widgets::icon_btn(&mut actions, &p, icon::QR_CODE, self.t("show_network_qr")).clicked() {
            self.modal = Some(Modal::WifiQr { ssid: n.ssid.clone(), password: n.password.clone() });
        }
        if !n.password.is_empty() {
            let (g, tip) = if shown_pw { (icon::EYE_SLASH, self.t("hide_password")) } else { (icon::EYE, self.t("show_password")) };
            if widgets::icon_btn(&mut actions, &p, g, tip).clicked() {
                if shown_pw {
                    self.revealed.remove(&n.ssid);
                } else {
                    self.revealed.insert(n.ssid.clone());
                }
            }
        }
        if !selected && resp.on_hover_text(self.t("i_connected_to_this")).clicked() {
            self.selected_ip = Some(n.ip);
        }
    }

    /// web.peerhop.in: works from any network with internet, no QR needed.
    fn web_card(&mut self, ui: &mut Ui, w: f32) {
        let p = self.pal;
        let visible = self.settings.web_visible;
        let chip = if visible { (format!("{} {}", icon::EYE, self.t("web_card_visible")), p.success) } else { (format!("{} {}", icon::EYE_SLASH, self.t("web_card_hidden")), p.sub_text) };
        let hover = Some(self.t("show_qr").to_string());
        let resp = self.card_frame(ui, w, false, icon::GLOBE_HEMISPHERE_WEST, WEB_HOST, self.t("web_card_hint"), Some(chip), hover);
        let mut actions = ui.new_child(egui::UiBuilder::new().max_rect(Rect::from_min_max(pos2(resp.rect.left(), resp.rect.top() + 6.0), pos2(resp.rect.right() - 6.0, resp.rect.top() + 32.0))).layout(Layout::right_to_left(Align::Center)));
        actions.spacing_mut().item_spacing.x = 0.0;
        if widgets::icon_btn(&mut actions, &p, icon::COPY, self.t("copy")).clicked() {
            ui.ctx().copy_text(format!("https://{WEB_HOST}"));
            self.toast(self.t("link_copied").to_string(), ToastKind::Success);
        }
        let (g, tip) = if visible { (icon::EYE, self.t("web_card_hide")) } else { (icon::EYE_SLASH, self.t("web_card_show")) };
        if widgets::icon_btn_colored(&mut actions, &p, g, tip, if visible { p.success } else { p.sub_text }).clicked() {
            self.settings.web_visible = !visible;
            self.web.set_visible(!visible);
            self.save_settings();
        }
        if resp.clicked() {
            self.modal = Some(Modal::LinkQr { title: WEB_HOST.to_string(), url: format!("https://{WEB_HOST}") });
        }
    }

    /// Shared card body. `chip` is the bottom status; `hover_chip` replaces an
    /// empty status (or overlays it) while hovered, hinting what a click does.
    #[allow(clippy::too_many_arguments)]
    fn card_frame(&self, ui: &mut Ui, w: f32, selected: bool, glyph: &str, title: &str, line: &str, chip: Option<(String, egui::Color32)>, hover_chip: Option<String>) -> egui::Response {
        let p = self.pal;
        let (rect, resp) = ui.allocate_exact_size(vec2(w, CARD_H), Sense::click());
        let h = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.14);
        let s = ui.ctx().animate_bool_with_time(resp.id.with("sel"), selected, 0.2);
        if (h > 0.0 && h < 1.0) || (s > 0.0 && s < 1.0) {
            ui.ctx().request_repaint();
        }
        // Hover only tints the colors; the card never moves or casts a shadow.
        let r = rect;
        let painter = ui.painter();
        let fill = widgets::lerp_color(widgets::lerp_color(p.panel, p.icon_bg, 0.5 * h), p.accent_soft, s);
        painter.rect_filled(r, 14, fill);
        let border = widgets::lerp_color(widgets::lerp_color(p.border, p.accent, 0.45 * h), p.accent, s);
        painter.rect_stroke(r, 14, Stroke::new(1.0 + 0.5 * s, border), egui::StrokeKind::Inside);

        let ic = pos2(r.left() + 26.0, r.top() + 26.0);
        painter.circle_filled(ic, 16.0, widgets::lerp_color(p.icon_bg, p.accent, s));
        painter.text(ic, Align2::CENTER_CENTER, glyph, FontId::proportional(17.0), widgets::lerp_color(p.icon_text, egui::Color32::WHITE, s));

        let tx = r.left() + 12.0;
        let max_w = r.width() - 24.0;
        let name = widgets::fit_text(painter, title, FontId::new(13.5, theme::semibold()), p.text, max_w);
        painter.galley(pos2(tx, r.top() + 50.0), name, p.text);
        let sub = widgets::fit_text(painter, line, FontId::proportional(12.0), p.sub_text, max_w);
        painter.galley(pos2(tx, r.top() + 69.0), sub, p.sub_text);

        let chip_y = r.bottom() - 14.0;
        let base = chip.as_ref().map(|(t, c)| (t.clone(), *c));
        let shown = match (&base, &hover_chip) {
            (_, Some(hc)) if h > 0.5 => Some((hc.clone(), p.accent)),
            (Some(b), _) => Some(b.clone()),
            _ => None,
        };
        if let Some((text, color)) = shown {
            let g = widgets::fit_text(painter, &text, FontId::new(11.5, theme::semibold()), color, max_w - 12.0);
            let pill = Rect::from_min_size(pos2(tx - 2.0, chip_y - 10.0), g.size() + vec2(14.0, 6.0));
            painter.rect_filled(pill, 9, color.gamma_multiply(0.16));
            painter.galley(pill.min + vec2(7.0, 3.0), g, color);
        }
        resp.on_hover_cursor(egui::CursorIcon::PointingHand)
    }
}

fn theme_warn() -> egui::Color32 {
    super::theme::hex(0xf59e0b)
}

fn small_btn(ui: &mut Ui, p: &super::theme::Palette, text: &str) -> egui::Response {
    ui.add(egui::Button::new(RichText::new(text).size(12.5).color(p.text)).fill(p.card).stroke(Stroke::new(1.0, p.border)).corner_radius(8))
        .on_hover_cursor(egui::CursorIcon::PointingHand)
}
