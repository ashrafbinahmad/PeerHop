//! Small custom widgets drawn with egui's painter.

use eframe::egui;
use egui::{Align2, Color32, CornerRadius, FontId, Rect, Response, Sense, Stroke, StrokeKind, Ui, Vec2, pos2, vec2};
use egui_phosphor::regular as icon;

use super::theme::{Palette, on};

pub fn card<R>(ui: &mut Ui, p: &Palette, add: impl FnOnce(&mut Ui) -> R) -> R {
    egui::Frame::new()
        .fill(p.card)
        .stroke(Stroke::new(1.0, p.border))
        .corner_radius(10)
        .inner_margin(10)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            add(ui)
        })
        .inner
}

pub fn section_title(ui: &mut Ui, p: &Palette, text: &str) {
    ui.add_space(6.0);
    ui.label(bold(text, 12.0).color(p.sub_text));
}

/// Semibold text (titles, names, emphasis).
pub fn bold(text: impl Into<String>, size: f32) -> egui::RichText {
    egui::RichText::new(text).family(super::theme::semibold()).size(size)
}

pub fn sub(p: &Palette, text: impl Into<String>) -> egui::RichText {
    egui::RichText::new(text).size(12.0).color(p.sub_text)
}

/// iOS-style switch.
pub fn toggle(ui: &mut Ui, p: &Palette, on_: &mut bool) -> Response {
    let size = vec2(34.0, 20.0);
    let (rect, mut resp) = ui.allocate_exact_size(size, Sense::click());
    if resp.clicked() {
        *on_ = !*on_;
        resp.mark_changed();
    }
    let t = ui.ctx().animate_bool_responsive(resp.id, *on_);
    let fill = lerp_color(p.border, p.accent, t);
    let painter = ui.painter();
    painter.rect_filled(rect, CornerRadius::same(10), fill);
    let x = egui::lerp(rect.left() + 10.0..=rect.right() - 10.0, t);
    painter.circle_filled(pos2(x, rect.center().y), 7.5, Color32::WHITE);
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}

pub fn lerp_color(a: Color32, b: Color32, t: f32) -> Color32 {
    let l = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t) as u8;
    Color32::from_rgba_unmultiplied(l(a.r(), b.r()), l(a.g(), b.g()), l(a.b(), b.b()), l(a.a(), b.a()))
}

/// A settings row: title + hint on the left, a switch on the right.
pub fn switch_row(ui: &mut Ui, p: &Palette, title: &str, hint: &str, value: &mut bool) -> bool {
    let mut changed = false;
    ui.horizontal(|ui| {
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 1.0;
            ui.set_width((ui.available_width() - 46.0).max(60.0));
            ui.label(title);
            if !hint.is_empty() {
                ui.label(sub(p, hint));
            }
        });
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            changed = toggle(ui, p, value).changed();
        });
    });
    changed
}

/// Segmented control; returns true when the selection changed.
pub fn segmented(ui: &mut Ui, p: &Palette, selected: &mut usize, items: &[&str]) -> bool {
    // Separate pill buttons, no surrounding track; the accent pill glides to the selection.
    let (h, gap) = (28.0, 6.0);
    let n = items.len() as f32;
    let (rect, _) = ui.allocate_exact_size(vec2(ui.available_width(), h), Sense::hover());
    let w = (rect.width() - gap * (n - 1.0)) / n;
    let cell = |i: f32| Rect::from_min_size(pos2(rect.left() + (w + gap) * i, rect.top()), vec2(w, h));
    let radius = CornerRadius::same((h / 2.0) as u8);
    let mut changed = false;
    let resps: Vec<Response> = (0..items.len())
        .map(|i| ui.interact(cell(i as f32), ui.id().with(("seg", i)), Sense::click()).on_hover_cursor(egui::CursorIcon::PointingHand))
        .collect();
    for (i, resp) in resps.iter().enumerate() {
        if resp.clicked() && *selected != i {
            *selected = i;
            changed = true;
        }
    }
    for (i, resp) in resps.iter().enumerate() {
        let r = cell(i as f32);
        let hover = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.12);
        ui.painter().rect_filled(r, radius, lerp_color(p.input, p.icon_bg, hover));
    }
    let x = ui.ctx().animate_value_with_time(ui.id().with("seg_pill"), *selected as f32, 0.18);
    ui.painter().rect_filled(cell(x), radius, p.accent);
    let on_accent = on(p.accent);
    for (i, label) in items.iter().enumerate() {
        let r = cell(i as f32);
        // Text colour follows how much of the pill covers this button.
        let cover = (1.0 - (x - i as f32).abs()).clamp(0.0, 1.0);
        let base = if resps[i].hovered() { p.text } else { p.sub_text };
        let font = if *selected == i { FontId::new(13.0, super::theme::semibold()) } else { FontId::proportional(13.0) };
        ui.painter().text(r.center(), Align2::CENTER_CENTER, *label, font, lerp_color(base, on_accent, cover));
    }
    changed
}

/// Frameless icon button with a hover background.
pub fn icon_btn(ui: &mut Ui, p: &Palette, glyph: &str, tip: &str) -> Response {
    icon_btn_colored(ui, p, glyph, tip, p.sub_text)
}

pub fn icon_btn_colored(ui: &mut Ui, p: &Palette, glyph: &str, tip: &str, color: Color32) -> Response {
    let (rect, resp) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::click());
    let t = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.12);
    if t > 0.0 {
        ui.painter().rect_filled(rect.shrink((1.0 - t) * 4.0), CornerRadius::same(6), p.icon_bg.gamma_multiply(t));
    }
    let c = lerp_color(color, p.text, t);
    ui.painter().text(rect.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(15.0), c);
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    if tip.is_empty() { resp } else { resp.on_hover_text(tip) }
}

/// Filled accent button.
pub fn primary(ui: &mut Ui, p: &Palette, text: &str) -> Response {
    filled(ui, p.accent, text)
}

pub fn filled(ui: &mut Ui, color: Color32, text: &str) -> Response {
    let b = egui::Button::new(bold(text, 13.5).color(on(color))).fill(color).corner_radius(8).min_size(vec2(0.0, 30.0));
    ui.add(b).on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Neutral outline button.
pub fn secondary(ui: &mut Ui, p: &Palette, text: &str) -> Response {
    let b = egui::Button::new(egui::RichText::new(text).color(p.text)).fill(p.card).stroke(Stroke::new(1.0, p.border)).corner_radius(8).min_size(vec2(0.0, 30.0));
    ui.add(b).on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Small pill badge.
pub fn badge(ui: &mut Ui, text: &str, color: Color32) {
    egui::Frame::new().fill(color.gamma_multiply(0.15)).corner_radius(10).inner_margin(egui::Margin::symmetric(8, 2)).show(ui, |ui| {
        ui.label(bold(text, 11.0).color(color));
    });
}

pub fn platform_icon(platform: &str) -> &'static str {
    match platform.to_ascii_lowercase().as_str() {
        "android" => icon::ANDROID_LOGO,
        "ios" => icon::APPLE_LOGO,
        "windows" => icon::WINDOWS_LOGO,
        "linux" => icon::LINUX_LOGO,
        _ => icon::DEVICES,
    }
}

/// Round avatar with a glyph.
pub fn avatar(ui: &mut Ui, bg: Color32, fg: Color32, glyph: &str, size: f32) -> Response {
    let (rect, resp) = ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
    ui.painter().circle_filled(rect.center(), size / 2.0, bg);
    ui.painter().text(rect.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(size * 0.5), fg);
    resp
}

/// Thin rounded progress bar that eases toward `frac` (updates arrive every ~200ms).
pub fn progress(ui: &mut Ui, p: &Palette, id: egui::Id, frac: f32, color: Color32) {
    let (rect, _) = ui.allocate_exact_size(vec2(ui.available_width(), 6.0), Sense::hover());
    ui.painter().rect_filled(rect, CornerRadius::same(3), p.border);
    let shown = ui.ctx().animate_value_with_time(id, frac.clamp(0.0, 1.0), 0.25);
    let mut fill = rect;
    fill.set_width(rect.width() * shown);
    if fill.width() > 0.5 {
        ui.painter().rect_filled(fill, CornerRadius::same(3), color);
    }
}

// ---- QR ---------------------------------------------------------------------

/// Encoded QR modules, cached so we don't re-encode every frame.
#[derive(Default)]
pub struct QrCache {
    entries: Vec<(String, usize, Vec<bool>)>,
}

impl QrCache {
    fn get(&mut self, data: &str) -> Option<(usize, &[bool])> {
        if let Some(i) = self.entries.iter().position(|e| e.0 == data) {
            let e = &self.entries[i];
            return Some((e.1, &e.2));
        }
        let code = qrcode::QrCode::with_error_correction_level(data.as_bytes(), qrcode::EcLevel::H).ok()?;
        let w = code.width();
        let bits = code.to_colors().into_iter().map(|c| c == qrcode::Color::Dark).collect();
        if self.entries.len() > 8 {
            self.entries.remove(0);
        }
        self.entries.push((data.to_string(), w, bits));
        let e = self.entries.last().unwrap();
        Some((e.1, &e.2))
    }
}

/// Dot-style QR with rounded finder patterns and an optional center logo.
pub fn qr(ui: &mut Ui, cache: &mut QrCache, data: &str, size: f32, logo: Option<&egui::TextureHandle>) -> Response {
    let (rect, resp) = ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, CornerRadius::same(14), Color32::WHITE);
    let Some((w, bits)) = cache.get(data) else { return resp };
    let quiet = 2.0;
    let cell = size / (w as f32 + quiet * 2.0);
    let origin = rect.min + Vec2::splat(cell * quiet);
    let dark = Color32::from_rgb(17, 24, 39);

    // Keep the center clear for the logo (error correction H tolerates ~30%).
    let hole = if logo.is_some() { (w as f32 * 0.22).round() as usize | 1 } else { 0 };
    let h0 = (w - hole) / 2;
    let in_hole = |x: usize, y: usize| hole > 0 && (h0..h0 + hole).contains(&x) && (h0..h0 + hole).contains(&y);
    let in_finder = |x: usize, y: usize| (x < 7 || x >= w - 7) && y < 7 || x < 7 && y >= w - 7;

    for y in 0..w {
        for x in 0..w {
            if bits[y * w + x] && !in_finder(x, y) && !in_hole(x, y) {
                let c = origin + vec2((x as f32 + 0.5) * cell, (y as f32 + 0.5) * cell);
                painter.circle_filled(c, cell * 0.46, dark);
            }
        }
    }
    for (fx, fy) in [(0usize, 0usize), (w - 7, 0), (0, w - 7)] {
        let outer = Rect::from_min_size(origin + vec2(fx as f32 * cell, fy as f32 * cell), Vec2::splat(7.0 * cell));
        painter.rect_stroke(outer.shrink(cell * 0.5), CornerRadius::same((cell * 2.2) as u8), Stroke::new(cell, dark), StrokeKind::Middle);
        painter.rect_filled(outer.shrink(cell * 2.0), CornerRadius::same((cell * 1.2) as u8), dark);
    }
    if let Some(tex) = logo {
        let side = hole as f32 * cell;
        let r = Rect::from_center_size(rect.center(), Vec2::splat(side));
        painter.rect_filled(r, CornerRadius::same((side * 0.22) as u8), Color32::WHITE);
        painter.image(tex.id(), r.shrink(side * 0.1), Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), Color32::WHITE);
    }
    resp
}

/// Shows `add` clipped to `t` (0..1) of its last full height: used to collapse rows away.
pub fn clip_height(ui: &mut Ui, height_id: egui::Id, t: f32, add: impl FnOnce(&mut Ui)) {
    let full: f32 = ui.ctx().data(|d| d.get_temp(height_id)).unwrap_or(0.0);
    let h = (full * t).round();
    let top = ui.cursor().min;
    let mut child = ui.new_child(egui::UiBuilder::new().max_rect(Rect::from_min_size(top, vec2(ui.available_width(), f32::INFINITY))));
    child.set_clip_rect(ui.clip_rect().intersect(Rect::from_min_size(top, vec2(ui.available_width(), h))));
    add(&mut child);
    ui.allocate_space(vec2(ui.available_width(), h));
}

/// Slide + fade content in from the side it was switched toward.
pub fn slide_in<R>(ui: &mut Ui, e: f32, dir: f32, add: impl FnOnce(&mut Ui) -> R) -> R {
    if e >= 1.0 {
        return add(ui);
    }
    let shift = egui::emath::TSTransform::from_translation(vec2(dir * 28.0 * (1.0 - e), 0.0));
    ui.with_visual_transform(shift, |ui| {
        ui.multiply_opacity(e);
        add(ui)
    })
    .inner
}

/// Down-pointing chevron rotated by `openness` (0 = down, 1 = up).
pub fn chevron(ui: &mut Ui, color: Color32, openness: f32) {
    let (rect, _) = ui.allocate_exact_size(vec2(16.0, 16.0), Sense::hover());
    let c = rect.center();
    let rot = egui::emath::Rot2::from_angle(std::f32::consts::PI * openness);
    let pts = [vec2(-4.5, -2.0), vec2(0.0, 2.5), vec2(4.5, -2.0)].map(|v| c + rot * v);
    ui.painter().line(pts.to_vec(), Stroke::new(1.6, color));
}
