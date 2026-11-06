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
    paint_switch(ui.painter(), rect, t, p);
    resp.on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// Draws a switch track + knob at `t` (0 off .. 1 on) inside `rect`.
pub fn paint_switch(painter: &egui::Painter, rect: Rect, t: f32, p: &Palette) {
    let r = rect.height() / 2.0;
    painter.rect_filled(rect, CornerRadius::same(r as u8), lerp_color(p.border, p.accent, t));
    let x = egui::lerp(rect.left() + r..=rect.right() - r, t);
    painter.circle_filled(pos2(x, rect.center().y), r - 2.5, Color32::WHITE);
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

/// Larger round icon button (headers).
pub fn icon_btn_big(ui: &mut Ui, p: &Palette, glyph: &str, tip: &str) -> Response {
    icon_btn_big_colored(ui, p, glyph, tip, p.sub_text)
}

pub fn icon_btn_big_colored(ui: &mut Ui, p: &Palette, glyph: &str, tip: &str, color: Color32) -> Response {
    let (rect, resp) = ui.allocate_exact_size(Vec2::splat(38.0), Sense::click());
    let t = ui.ctx().animate_bool_with_time(resp.id, resp.hovered(), 0.12);
    let press = ui.ctx().animate_bool_with_time(resp.id.with("p"), resp.is_pointer_button_down_on(), 0.08);
    if t > 0.0 {
        ui.painter().circle_filled(rect.center(), 17.0 * (0.7 + 0.3 * t) * (1.0 - 0.08 * press), p.icon_bg.gamma_multiply(t));
    }
    if (t > 0.0 && t < 1.0) || (press > 0.0 && press < 1.0) {
        ui.ctx().request_repaint();
    }
    ui.painter().text(rect.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(20.0), lerp_color(color, p.text, t * 0.6));
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    if tip.is_empty() { resp } else { resp.on_hover_text(tip) }
}

/// Large action button: icon + label (or just an icon when `label` is empty).
/// Lifts slightly on hover and dips on press; `drift` offsets it while animating out.
#[allow(clippy::too_many_arguments)]
pub fn big_btn(ui: &mut Ui, p: &Palette, glyph: &str, label: &str, w: f32, h: f32, fill: Color32, fg: Color32, enabled: bool, drift: Vec2) -> Response {
    let (rect, resp) = ui.allocate_exact_size(vec2(w, h), if enabled { Sense::click() } else { Sense::hover() });
    let hov = ui.ctx().animate_bool_with_time(resp.id, resp.hovered() && enabled, 0.12);
    let press = ui.ctx().animate_bool_with_time(resp.id.with("p"), resp.is_pointer_button_down_on(), 0.07);
    if (hov > 0.0 && hov < 1.0) || (press > 0.0 && press < 1.0) {
        ui.ctx().request_repaint();
    }
    let r = Rect::from_center_size(rect.center() + drift - vec2(0.0, 1.5 * hov), rect.size() * (1.0 - 0.03 * press));
    let (fill, fg) = if enabled { (fill, fg) } else { (p.icon_bg, p.sub_text.gamma_multiply(0.6)) };
    // Hover brightens toward white on dark fills, darkens slightly on light ones.
    let lit = if p.dark || fill != p.input { lerp_color(fill, Color32::WHITE, 0.08 * hov) } else { lerp_color(fill, p.border, 0.5 * hov) };
    let painter = ui.painter();
    if hov > 0.0 && enabled {
        painter.rect_filled(r.translate(vec2(0.0, 3.0)), CornerRadius::same(14), Color32::from_black_alpha((30.0 * hov) as u8));
    }
    painter.rect_filled(r, CornerRadius::same(14), lit);
    if label.is_empty() {
        painter.text(r.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(22.0), fg);
    } else {
        let font = FontId::new(14.5, super::theme::semibold());
        let g = painter.layout_no_wrap(label.to_string(), font, fg);
        let icon_w = 22.0 + 8.0;
        let total = (icon_w + g.size().x).min(r.width() - 16.0);
        let x0 = r.center().x - total / 2.0;
        painter.text(pos2(x0 + 11.0, r.center().y), Align2::CENTER_CENTER, glyph, FontId::proportional(21.0 + hov), fg);
        if g.size().x <= r.width() - icon_w - 16.0 {
            painter.galley(pos2(x0 + icon_w, r.center().y - g.size().y / 2.0), g, fg);
        }
    }
    if enabled { resp.on_hover_cursor(egui::CursorIcon::PointingHand) } else { resp }
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

pub fn platform_icon(platform: &str) -> &'static str {
    match platform.to_ascii_lowercase().as_str() {
        "android" => icon::ANDROID_LOGO,
        "ios" => icon::APPLE_LOGO,
        "windows" => icon::WINDOWS_LOGO,
        "linux" => icon::LINUX_LOGO,
        "peerhop" => icon::DESKTOP,
        "phone" => icon::DEVICE_MOBILE,
        "tablet" => icon::DEVICE_TABLET,
        "web" | "desktop" => icon::GLOBE,
        _ => icon::DEVICES,
    }
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

// ---- Telegram-style pieces ------------------------------------------------------

/// Stable avatar colour for a name (same name, same colour).
pub fn name_color(name: &str) -> Color32 {
    const COLORS: [u32; 7] = [0xe17076, 0xeda86c, 0xa695e7, 0x7bc862, 0x6ec9cb, 0x65aadd, 0xee7aae];
    let h = name.bytes().fold(0x811c9dc5u32, |h, b| (h ^ b as u32).wrapping_mul(0x01000193));
    super::theme::hex(COLORS[h as usize % COLORS.len()])
}

/// Up to two initials ("Mohammed Muneer" → "MM").
pub fn initials(name: &str) -> String {
    let mut words = name.split(|c: char| c.is_whitespace() || c == '-' || c == '_').filter(|w| !w.is_empty());
    let first = words.next().and_then(|w| w.chars().next());
    let second = words.next().and_then(|w| w.chars().next());
    match (first, second) {
        (Some(a), Some(b)) => format!("{a}{b}").to_uppercase(),
        (Some(a), None) => a.to_uppercase().to_string(),
        _ => "?".into(),
    }
}

/// Rounded avatar face: a filled shape with initials or a glyph. `squircle` (0..1)
/// morphs the circle toward a rounded square (used for the selected sidebar item).
pub fn face(painter: &egui::Painter, rect: Rect, fill: Color32, label: &str, squircle: f32) {
    let r = rect.width() / 2.0;
    let radius = (r * (1.0 - 0.42 * squircle)).round() as u8;
    painter.rect_filled(rect, CornerRadius::same(radius), fill);
    // A soft top highlight gives the flat colour a little depth.
    let top = Rect::from_min_max(rect.min, pos2(rect.max.x, rect.center().y));
    painter.with_clip_rect(top).rect_filled(rect, CornerRadius::same(radius), Color32::from_white_alpha(14));
    let size = if label.chars().count() > 2 || label.is_ascii() { r * 0.78 } else { r * 0.9 };
    painter.text(rect.center(), Align2::CENTER_CENTER, label, FontId::new(size, super::theme::semibold()), Color32::WHITE);
}

/// Arc from 12 o'clock, clockwise, covering `frac` of the circle (offset by `spin` turns).
pub fn ring(painter: &egui::Painter, center: egui::Pos2, radius: f32, frac: f32, spin: f32, stroke: Stroke) {
    let frac = frac.clamp(0.0, 1.0);
    if frac <= 0.0 {
        return;
    }
    let n = ((64.0 * frac).ceil() as usize).max(2);
    let start = -std::f32::consts::FRAC_PI_2 + spin * std::f32::consts::TAU;
    let pts: Vec<egui::Pos2> = (0..=n)
        .map(|i| {
            let a = start + std::f32::consts::TAU * frac * i as f32 / n as f32;
            center + vec2(a.cos(), a.sin()) * radius
        })
        .collect();
    painter.add(egui::Shape::line(pts, stroke));
}

/// Unread-count pill centred on `at`, scaled by `scale` (pops in from 0).
pub fn count_badge(painter: &egui::Painter, at: egui::Pos2, n: usize, fill: Color32, ring_color: Color32, scale: f32) {
    if scale <= 0.01 {
        return;
    }
    let text = if n > 999 { "999+".to_string() } else { n.to_string() };
    let font = FontId::new(11.0 * scale, super::theme::semibold());
    let galley = painter.layout_no_wrap(text, font, Color32::WHITE);
    let h = 18.0 * scale;
    let w = (galley.size().x + 10.0 * scale).max(h);
    let rect = Rect::from_center_size(at, vec2(w, h));
    painter.rect_filled(rect.expand(2.0 * scale), CornerRadius::same(((h / 2.0) + 2.0) as u8), ring_color);
    painter.rect_filled(rect, CornerRadius::same((h / 2.0) as u8), fill);
    painter.galley(rect.center() - galley.size() / 2.0, galley, Color32::WHITE);
}

/// Small round badge with a glyph (platform marker on avatars).
pub fn glyph_badge(painter: &egui::Painter, at: egui::Pos2, glyph: &str, fill: Color32, fg: Color32, ring_color: Color32, scale: f32) {
    if scale <= 0.01 {
        return;
    }
    painter.circle_filled(at, 9.5 * scale, ring_color);
    painter.circle_filled(at, 7.5 * scale, fill);
    painter.text(at, Align2::CENTER_CENTER, glyph, FontId::proportional(10.0 * scale), fg);
}

/// Delivery state of an outgoing message.
#[derive(Clone, Copy, PartialEq)]
pub enum Tick {
    Waiting,
    Sent,
    Delivered,
    Failed,
}

pub fn tick_glyph(t: Tick) -> &'static str {
    match t {
        Tick::Waiting => icon::CLOCK,
        Tick::Sent => icon::CHECK,
        Tick::Delivered => icon::CHECKS,
        Tick::Failed => icon::WARNING_CIRCLE,
    }
}

/// Single-line text cut with an ellipsis to fit `max_w`.
pub fn fit_text(painter: &egui::Painter, text: &str, font: FontId, color: Color32, max_w: f32) -> std::sync::Arc<egui::Galley> {
    let mut job = egui::text::LayoutJob::simple_singleline(text.to_string(), font, color);
    job.wrap = egui::text::TextWrapping { max_width: max_w.max(10.0), max_rows: 1, break_anywhere: true, overflow_character: Some('…') };
    painter.layout_job(job)
}
