//! Settings view.

use eframe::egui;
use egui::{Align, Layout, Margin, RichText, Sense, Stroke, Ui};
use egui_phosphor::regular as icon;
use std::path::PathBuf;

use super::app::{App, RestartReason, ToastKind};
use super::i18n::LANGS;
use super::theme::{self, MODES};
use super::widgets;

const MAX_NAME: usize = 20;

impl App {
    pub(crate) fn settings_panel(&mut self, ui: &mut Ui) {
        let p = self.pal;

        widgets::section_title(ui, &p, self.t("general"));
        widgets::card(ui, &p, |ui| {
            ui.label(widgets::sub(&p, self.t("host_name")));
            let resp = ui.add(
                egui::TextEdit::singleline(&mut self.name_edit)
                    .char_limit(MAX_NAME)
                    .desired_width(f32::INFINITY)
                    .margin(Margin::symmetric(8, 5))
                    .background_color(p.input),
            );
            if resp.lost_focus() {
                let name = self.name_edit.trim().to_string();
                if name.is_empty() {
                    self.name_edit = self.settings.desktop_device_name.clone();
                } else if name != self.settings.desktop_device_name {
                    self.settings.desktop_device_name = name.clone();
                    self.hub.set_desktop_name(&name);
                    self.save_settings();
                }
            }
            ui.add_space(4.0);
            ui.label(widgets::sub(&p, self.t("download_location")));
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if widgets::icon_btn(ui, &p, icon::FOLDER_OPEN, self.t("show_in_folder")).clicked() {
                        let dir = PathBuf::from(&self.settings.download_path);
                        let _ = std::fs::create_dir_all(&dir);
                        peerhop::platform::show_in_folder(&dir);
                    }
                    if widgets::icon_btn(ui, &p, icon::PENCIL_SIMPLE, self.t("change")).clicked() {
                        if let Some(dir) = rfd::FileDialog::new().set_directory(&self.settings.download_path).pick_folder() {
                            self.settings.download_path = dir.to_string_lossy().into_owned();
                            self.hub.set_download_dir(&dir);
                            self.save_settings();
                        }
                    }
                    ui.add(egui::Label::new(RichText::new(&self.settings.download_path).color(p.text)).truncate())
                        .on_hover_text(&self.settings.download_path);
                });
            });
            divider(ui, &p);
            ui.label(widgets::sub(&p, self.t("theme")));
            let labels = [self.t("theme_light").to_string(), self.t("theme_dark").to_string(), self.t("theme_system").to_string()];
            let refs: Vec<&str> = labels.iter().map(String::as_str).collect();
            let mut idx = MODES.iter().position(|m| *m == self.settings.theme_id).unwrap_or(2);
            if widgets::segmented(ui, &p, &mut idx, &refs) {
                self.set_theme(MODES[idx]);
            }
            divider(ui, &p);
            ui.horizontal(|ui| {
                ui.label(self.t("language"));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let current = LANGS.iter().find(|l| l.0 == self.i18n.code).map(|l| l.1).unwrap_or("English");
                    let mut chosen = None;
                    egui::ComboBox::from_id_salt("lang").selected_text(current).width(150.0).show_ui(ui, |ui| {
                        for (code, name, _) in LANGS {
                            if ui.selectable_label(self.i18n.code == *code, *name).clicked() {
                                chosen = Some(*code);
                            }
                        }
                    });
                    if let Some(code) = chosen {
                        self.set_language(code);
                    }
                });
            });
        });

        widgets::section_title(ui, &p, self.t("features"));
        widgets::card(ui, &p, |ui| {
            let mut v = self.settings.text_transfer_enabled;
            if widgets::switch_row(ui, &p, self.t("text_transfer"), self.t("enable_sending_receiving"), &mut v) {
                self.settings.text_transfer_enabled = v;
                self.hub.set_text_transfer(v);
                if !v {
                    self.text_mode = false;
                }
                self.save_settings();
            }
            divider(ui, &p);
            let mut v = self.settings.security_enabled;
            if widgets::switch_row(ui, &p, self.t("enable_security"), self.t("require_token"), &mut v) {
                self.settings.security_enabled = v;
                self.hub.set_security(v);
                self.save_settings();
            }
            divider(ui, &p);
            let mut v = self.settings.static_port_enabled;
            if widgets::switch_row(ui, &p, self.t("static_port"), self.t("static_port_hint"), &mut v) {
                self.settings.static_port_enabled = v;
                self.save_settings();
                self.request_restart(RestartReason::PortChange);
            }
            if self.settings.static_port_enabled {
                ui.horizontal(|ui| {
                    ui.label(widgets::sub(&p, self.t("port")));
                    let resp = ui.add(
                        egui::TextEdit::singleline(&mut self.port_edit)
                            .char_limit(5)
                            .desired_width(56.0)
                            .margin(Margin::symmetric(6, 3))
                            .background_color(p.input),
                    );
                    self.port_edit.retain(|c| c.is_ascii_digit());
                    let dirty = self.port_edit != self.settings.static_port.to_string();
                    if dirty && resp.lost_focus() {
                        match self.port_edit.parse::<u16>() {
                            Ok(port) if port > 0 => {
                                self.settings.static_port = port;
                                self.save_settings();
                                self.request_restart(RestartReason::PortChange);
                            }
                            _ => {
                                self.port_edit = self.settings.static_port.to_string();
                                self.toast(self.t("invalid_port").to_string(), ToastKind::Error);
                            }
                        }
                    }
                    if self.port != 0 && self.port != self.settings.static_port {
                        ui.label(RichText::new(format!("{} {}", icon::WARNING, self.port)).size(12.0).color(theme::hex(0xb45309)))
                            .on_hover_text(self.i18n.tf("port_in_use", &[("port", &self.settings.static_port.to_string()), ("fallback", &self.port.to_string())]));
                    }
                });
            }
        });

        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing.x = 14.0;
            if cfg!(windows) && link(ui, &p, icon::STAR, self.t("rate_app")) {
                self.modal = Some(super::app::Modal::Review { stars: 0 });
            }
            if link(ui, &p, icon::LIGHTBULB, self.t("request_feature")) {
                peerhop::platform::open_url(super::FEEDBACK_URL);
            }
            if link(ui, &p, icon::COFFEE, self.t("buy_developer_a_coffee")) {
                peerhop::platform::open_url(super::COFFEE_URL);
            }
        });
        ui.add_space(4.0);
        ui.label(widgets::sub(&p, format!("{} {}{}", self.t("app_name"), self.t("v"), peerhop::APP_VERSION)));
    }
}

fn divider(ui: &mut Ui, p: &theme::Palette) {
    ui.add_space(2.0);
    let r = ui.available_rect_before_wrap();
    ui.painter().hline(r.x_range(), r.top(), Stroke::new(1.0, p.border));
    ui.add_space(4.0);
}

/// Text link with an icon; returns true when clicked.
fn link(ui: &mut Ui, p: &theme::Palette, glyph: &str, text: &str) -> bool {
    let r = ui.add(egui::Label::new(RichText::new(format!("{glyph} {text}")).size(12.5).color(p.accent)).sense(Sense::click()));
    r.on_hover_cursor(egui::CursorIcon::PointingHand).clicked()
}
