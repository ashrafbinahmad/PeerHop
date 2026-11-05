//! Connect view: connected devices, networks, QR code and link.

use eframe::egui;
use egui::{Align, Frame, Layout, Margin, RichText, Sense, Stroke, Ui, vec2};
use egui_phosphor::regular as icon;

use peerhop::net::{NetKind, NetworkProfile};

use super::app::{App, Modal, RestartReason, ToastKind};
use super::widgets;

const MAX_NAME: usize = 20;

impl App {
    pub(crate) fn connect_panel(&mut self, ui: &mut Ui) {
        let p = self.pal;
        self.devices(ui);
        ui.add_space(6.0);

        let mut open = self.mobile_open;
        let (title, hint) = (self.t("connect_mobile").to_string(), self.t("connect_mobile_hint").to_string());
        collapsible(ui, &p, &mut open, icon::DEVICE_MOBILE, &title, &hint, |ui| {
            self.networks_list(ui);
            ui.add_space(8.0);
            ui.label(widgets::bold(self.t("step_2_scan_qr"), 13.0));
            ui.vertical_centered(|ui| {
                if self.server_ready() {
                    let url = self.server_url();
                    let logo = self.logo.clone();
                    widgets::qr(ui, &mut self.qr, &url, 196.0, Some(&logo));
                    ui.add(egui::Label::new(widgets::sub(&p, url.split("/?").next().unwrap_or(&url))).truncate());
                } else {
                    ui.add_space(40.0);
                    ui.spinner();
                    ui.label(widgets::sub(&p, self.t("starting_server")));
                    ui.add_space(40.0);
                }
            });
        });
        // Accordion: opening one card closes the other (it animates shut next frame).
        if open && !self.mobile_open {
            self.desktop_open = false;
        }
        self.mobile_open = open;
        ui.add_space(6.0);

        let mut open = self.desktop_open;
        let (title, hint) = (self.t("connect_desktop").to_string(), self.t("connect_desktop_hint").to_string());
        collapsible(ui, &p, &mut open, icon::DESKTOP, &title, &hint, |ui| {
            self.networks_list(ui);
            ui.add_space(8.0);
            ui.label(widgets::bold(self.t("step_2_open_browser"), 13.0));
            let url = self.server_url();
            Frame::new().fill(p.input).corner_radius(8).inner_margin(Margin::symmetric(8, 4)).show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if widgets::icon_btn(ui, &p, icon::COPY, self.t("copy")).clicked() {
                            ui.ctx().copy_text(url.clone());
                            self.toast(self.t("link_copied").to_string(), ToastKind::Success);
                        }
                        ui.add(egui::Label::new(RichText::new(&url).monospace().size(12.5)).truncate().selectable(true));
                    });
                });
            });
        });
        if open && !self.desktop_open {
            self.mobile_open = false;
        }
        self.desktop_open = open;

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
                    widgets::avatar(ui, p.icon_bg, p.icon_text, widgets::platform_icon(&c.platform), 30.0);
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

    fn networks_list(&mut self, ui: &mut Ui) {
        let p = self.pal;
        ui.label(widgets::bold(self.t("step_1_network"), 13.0));
        if self.networks.is_empty() {
            ui.horizontal(|ui| {
                if self.networks_loaded {
                    ui.label(RichText::new(icon::WARNING).color(p.danger));
                    ui.label(widgets::sub(&p, self.t("unable_to_detect")));
                } else {
                    ui.spinner();
                    ui.label(widgets::sub(&p, self.t("checking_network")));
                }
            });
            return;
        }
        let current = self.current_ip();
        let nets = self.networks.clone();
        // The active network first; the rest behind "Show more".
        let (active, others): (Vec<_>, Vec<_>) = nets.iter().partition(|n| n.ip == current);
        for n in active.iter().chain(others.iter().take(if self.show_more_networks { usize::MAX } else { 0 })) {
            self.network_row(ui, n, n.ip == current);
        }
        if !others.is_empty() {
            let label = if self.show_more_networks { self.t("show_less").to_string() } else { format!("{} ({})", self.t("show_more"), others.len()) };
            if ui.add(egui::Label::new(RichText::new(label).size(12.5).color(p.accent)).sense(Sense::click())).on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                self.show_more_networks = !self.show_more_networks;
            }
        }
    }

    fn network_row(&mut self, ui: &mut Ui, n: &NetworkProfile, selected: bool) {
        let p = self.pal;
        let (glyph, kind_label) = match n.kind {
            NetKind::Hotspot => (icon::BROADCAST, self.t("hotspot_name")),
            NetKind::Wifi => (icon::WIFI_HIGH, self.t("wifi_network")),
            NetKind::Ethernet => (icon::PLUGS, self.t("ethernet_network")),
        };
        let kind_label = kind_label.to_string();
        Frame::new()
            .fill(if selected { p.accent_soft } else { p.input })
            .stroke(Stroke::new(1.0, if selected { p.accent.gamma_multiply(0.6) } else { p.border }))
            .corner_radius(10)
            .inner_margin(8)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.label(RichText::new(glyph).size(20.0).color(if selected { p.accent } else { p.sub_text }));
                    // Buttons claim their space first; the text truncates into what is left.
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if !n.ssid.is_empty() && n.kind != NetKind::Ethernet && widgets::icon_btn(ui, &p, icon::QR_CODE, self.t("show_network_qr")).clicked() {
                            self.modal = Some(Modal::WifiQr { ssid: n.ssid.clone(), password: n.password.clone() });
                        }
                        ui.with_layout(Layout::top_down(Align::Min), |ui| {
                            let title = if n.ssid.is_empty() { n.name.clone() } else { n.ssid.clone() };
                            ui.add(egui::Label::new(widgets::bold(title, 13.5).color(p.text)).truncate());
                            ui.add(egui::Label::new(widgets::sub(&p, format!("{kind_label} · {}", n.ip))).truncate());
                            if n.kind == NetKind::Hotspot {
                                widgets::badge(ui, self.t("faster_badge"), p.success);
                            }
                        });
                    });
                });
                if !n.password.is_empty() {
                    let shown = self.revealed.contains(&n.ssid);
                    ui.horizontal(|ui| {
                        ui.label(widgets::sub(&p, self.t("hotspot_password")));
                        let text = if shown { n.password.clone() } else { "•".repeat(n.password.chars().count().min(12)) };
                        ui.add(egui::Label::new(RichText::new(text).monospace()).selectable(shown));
                        let (g, tip) = if shown { (icon::EYE_SLASH, self.t("hide_password")) } else { (icon::EYE, self.t("show_password")) };
                        if widgets::icon_btn(ui, &p, g, tip).clicked() {
                            if shown {
                                self.revealed.remove(&n.ssid);
                            } else {
                                self.revealed.insert(n.ssid.clone());
                            }
                        }
                    });
                }
                if !selected && small_btn(ui, &p, &format!("{}  {}", icon::CHECK, self.t("i_connected_to_this"))).clicked() {
                    self.selected_ip = Some(n.ip);
                }
            });
        ui.add_space(2.0);
    }
}

fn theme_warn() -> egui::Color32 {
    super::theme::hex(0xf59e0b)
}

fn small_btn(ui: &mut Ui, p: &super::theme::Palette, text: &str) -> egui::Response {
    ui.add(egui::Button::new(RichText::new(text).size(12.5).color(p.text)).fill(p.card).stroke(Stroke::new(1.0, p.border)).corner_radius(8))
        .on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Card with a clickable header that expands its body.
fn collapsible(ui: &mut Ui, p: &super::theme::Palette, open: &mut bool, glyph: &str, title: &str, hint: &str, body: impl FnOnce(&mut Ui)) {
    widgets::card(ui, p, |ui| {
        let mut state = egui::collapsing_header::CollapsingState::load_with_default_open(ui.ctx(), ui.id().with(("collapse", title)), *open);
        let openness = state.openness(ui.ctx());
        let header = ui.horizontal(|ui| {
            widgets::avatar(ui, p.accent_soft, p.accent, glyph, 30.0);
            ui.vertical(|ui| {
                ui.label(widgets::bold(title, 13.5).color(p.text));
                ui.label(widgets::sub(p, hint));
            });
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                widgets::chevron(ui, p.sub_text, openness);
            });
        });
        let click = ui.interact(header.response.rect, ui.id().with(title), Sense::click()).on_hover_cursor(egui::CursorIcon::PointingHand);
        if click.clicked() {
            *open = !*open;
        }
        // Height and contents ease open/closed.
        state.set_open(*open);
        state.show_body_unindented(ui, |ui| {
            ui.add_space(6.0);
            body(ui);
        });
    });
}
