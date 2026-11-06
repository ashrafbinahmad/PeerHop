//! Light/dark palettes (ids "day"/"night" match the web UI) and egui styling.

use eframe::egui;
use egui::{Color32, CornerRadius, FontFamily, FontId, Stroke, TextStyle, Visuals};

#[derive(Clone, Copy)]
pub struct Palette {
    pub dark: bool,
    pub bg: Color32,
    pub panel: Color32,
    pub card: Color32,
    pub input: Color32,
    pub bubble_other: Color32,
    /// Outgoing message bubble, and the time/ticks drawn on it.
    pub bubble_mine: Color32,
    pub mine_meta: Color32,
    pub border: Color32,
    pub icon_bg: Color32,
    pub icon_text: Color32,
    pub text: Color32,
    pub sub_text: Color32,
    pub accent: Color32,
    pub accent_soft: Color32,
    pub danger: Color32,
    pub success: Color32,
}

impl Palette {
    /// Blend toward `to` (used to cross-fade when the theme changes).
    pub fn lerp(&self, to: &Palette, t: f32) -> Palette {
        let l = |a, b| super::widgets::lerp_color(a, b, t);
        Palette {
            dark: to.dark,
            bg: l(self.bg, to.bg),
            panel: l(self.panel, to.panel),
            card: l(self.card, to.card),
            input: l(self.input, to.input),
            bubble_other: l(self.bubble_other, to.bubble_other),
            bubble_mine: l(self.bubble_mine, to.bubble_mine),
            mine_meta: l(self.mine_meta, to.mine_meta),
            border: l(self.border, to.border),
            icon_bg: l(self.icon_bg, to.icon_bg),
            icon_text: l(self.icon_text, to.icon_text),
            text: l(self.text, to.text),
            sub_text: l(self.sub_text, to.sub_text),
            accent: l(self.accent, to.accent),
            accent_soft: l(self.accent_soft, to.accent_soft),
            danger: l(self.danger, to.danger),
            success: l(self.success, to.success),
        }
    }
}

/// Theme modes stored in settings. Phones always get the resolved "day"/"night".
pub const MODES: [&str; 3] = ["day", "night", "system"];

// bg, panel, card, input, bubble_other, border, icon_bg, icon_text, text, sub_text
const DAY: [u32; 10] = [0xeceef2, 0xffffff, 0xffffff, 0xe9ecf1, 0xffffff, 0xd1d5db, 0xe5e7eb, 0x374151, 0x0b1220, 0x4b5563];
const NIGHT: [u32; 10] = [0x0f172a, 0x1e293b, 0x0f172a, 0x334155, 0x1e293b, 0x334155, 0x1e293b, 0x94a3b8, 0xf1f5f9, 0x94a3b8];
const ACCENT: u32 = 0x007AFF;

pub fn hex(c: u32) -> Color32 {
    Color32::from_rgb((c >> 16) as u8, (c >> 8) as u8, c as u8)
}

/// Whether `mode` renders dark; "system" follows the OS (light when unknown).
pub fn is_dark(mode: &str, system: Option<egui::Theme>) -> bool {
    match mode {
        "night" => true,
        "day" => false,
        _ => system == Some(egui::Theme::Dark),
    }
}

pub fn palette(dark: bool) -> Palette {
    let c = if dark { NIGHT } else { DAY }.map(hex);
    let accent = hex(ACCENT);
    Palette {
        dark,
        bg: c[0],
        panel: c[1],
        card: c[2],
        input: c[3],
        bubble_other: c[4],
        bubble_mine: if dark { hex(0x2b5278) } else { hex(0xdcebff) },
        mine_meta: if dark { hex(0x8fc1f0) } else { hex(0x3f77c0) },
        border: c[5],
        icon_bg: c[6],
        icon_text: c[7],
        text: c[8],
        sub_text: c[9],
        accent,
        accent_soft: accent.gamma_multiply(0.14),
        danger: if dark { hex(0xf87171) } else { hex(0xdc2626) },
        success: if dark { hex(0x4ade80) } else { hex(0x15803d) },
    }
}

/// Text that stays readable on top of `bg`.
pub fn on(bg: Color32) -> Color32 {
    let l = 0.299 * bg.r() as f32 + 0.587 * bg.g() as f32 + 0.114 * bg.b() as f32;
    if l > 170.0 { Color32::from_rgb(17, 24, 39) } else { Color32::WHITE }
}

pub fn apply(ctx: &egui::Context, p: &Palette) {
    let mut v = if p.dark { Visuals::dark() } else { Visuals::light() };
    let r = CornerRadius::same(8);
    v.panel_fill = p.bg;
    v.window_fill = p.card;
    v.window_stroke = Stroke::new(1.0, p.border);
    v.window_corner_radius = CornerRadius::same(14);
    v.extreme_bg_color = p.input;
    v.faint_bg_color = p.input;
    v.code_bg_color = p.input;
    v.override_text_color = Some(p.text);
    v.hyperlink_color = p.accent;
    v.selection.bg_fill = p.accent.gamma_multiply(0.35);
    v.selection.stroke = Stroke::new(1.0, p.accent);
    v.text_cursor.stroke = Stroke::new(2.0, p.accent);
    v.popup_shadow.color = Color32::from_black_alpha(if p.dark { 90 } else { 28 });
    v.window_shadow = egui::Shadow { offset: [0, 8], blur: 28, spread: 0, color: Color32::from_black_alpha(if p.dark { 110 } else { 36 }) };
    let w = &mut v.widgets;
    for (state, fill) in [(&mut w.inactive, p.input), (&mut w.hovered, p.icon_bg), (&mut w.active, p.border), (&mut w.open, p.icon_bg)] {
        state.bg_fill = fill;
        state.weak_bg_fill = fill;
        state.corner_radius = r;
        state.fg_stroke = Stroke::new(1.0, p.text);
        state.bg_stroke = Stroke::NONE;
    }
    w.hovered.bg_stroke = Stroke::new(1.0, p.border);
    w.noninteractive.bg_fill = p.card;
    w.noninteractive.weak_bg_fill = p.card;
    w.noninteractive.bg_stroke = Stroke::new(1.0, p.border);
    w.noninteractive.fg_stroke = Stroke::new(1.0, p.text);
    w.noninteractive.corner_radius = r;

    // Pin egui's theme so the OS light/dark setting can't swap our visuals out.
    ctx.set_theme(if p.dark { egui::Theme::Dark } else { egui::Theme::Light });
    ctx.set_visuals(v);
    ctx.all_styles_mut(|s| {
        s.animation_time = 0.16;
        s.interaction.tooltip_delay = 0.08;
        s.interaction.show_tooltips_only_when_still = false;
        s.spacing.item_spacing = egui::vec2(6.0, 6.0);
        s.spacing.button_padding = egui::vec2(10.0, 4.0);
        s.spacing.interact_size.y = 26.0;
        s.spacing.icon_width = 16.0;
        // Slim floating scrollbar hugging the outer edge; widens a little on hover.
        let sc = &mut s.spacing.scroll;
        sc.floating = true;
        sc.bar_width = 6.0;
        sc.floating_width = 3.0;
        sc.floating_allocated_width = 0.0;
        sc.bar_outer_margin = 1.0;
        sc.bar_inner_margin = 2.0;
        sc.handle_min_length = 24.0;
        s.text_styles = [
            (TextStyle::Small, FontId::new(11.5, FontFamily::Proportional)),
            (TextStyle::Body, FontId::new(13.5, FontFamily::Proportional)),
            (TextStyle::Button, FontId::new(13.5, FontFamily::Proportional)),
            (TextStyle::Heading, FontId::new(16.0, semibold())),
            (TextStyle::Monospace, FontId::new(12.5, FontFamily::Monospace)),
        ]
        .into();
    });
}

/// Font family for titles and emphasis (a real semibold, not just a brighter color).
pub fn semibold() -> FontFamily {
    FontFamily::Name("semibold".into())
}

fn read_first(paths: &[String]) -> Option<Vec<u8>> {
    paths.iter().find_map(|p| std::fs::read(p).ok())
}

/// Use the OS UI font (crisper and higher contrast than egui's light default),
/// falling back to egui's bundled fonts when none is found.
pub fn install_fonts(ctx: &egui::Context) {
    use egui::{FontData, FontDefinitions};
    use std::sync::Arc;

    let (regular, semi): (Vec<String>, Vec<String>) = if cfg!(windows) {
        let dir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
        (vec![format!(r"{dir}\Fonts\segoeui.ttf")], vec![format!(r"{dir}\Fonts\seguisb.ttf"), format!(r"{dir}\Fonts\segoeuib.ttf")])
    } else if cfg!(target_os = "macos") {
        (vec!["/System/Library/Fonts/Supplemental/Arial.ttf".into()], vec!["/System/Library/Fonts/Supplemental/Arial Bold.ttf".into()])
    } else {
        let roots = ["/usr/share/fonts/truetype", "/usr/share/fonts", "/usr/share/fonts/TTF"];
        let pick = |names: &[&str]| roots.iter().flat_map(|r| names.iter().map(move |n| format!("{r}/{n}"))).collect::<Vec<_>>();
        (
            pick(&["noto/NotoSans-Regular.ttf", "NotoSans-Regular.ttf", "cantarell/Cantarell-Regular.otf", "ubuntu/Ubuntu-R.ttf", "dejavu/DejaVuSans.ttf", "DejaVuSans.ttf"]),
            pick(&["noto/NotoSans-SemiBold.ttf", "NotoSans-SemiBold.ttf", "noto/NotoSans-Bold.ttf", "ubuntu/Ubuntu-M.ttf", "dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf"]),
        )
    };

    let mut fonts = FontDefinitions::default();
    egui_phosphor::add_to_fonts(&mut fonts, egui_phosphor::Variant::Regular);
    let base = fonts.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    let mut semi_family = base.clone();
    if let Some(bytes) = read_first(&regular) {
        fonts.font_data.insert("ui".into(), Arc::new(FontData::from_owned(bytes)));
        fonts.families.entry(FontFamily::Proportional).or_default().insert(0, "ui".into());
        semi_family.insert(0, "ui".into());
    }
    if let Some(bytes) = read_first(&semi) {
        fonts.font_data.insert("ui-semibold".into(), Arc::new(FontData::from_owned(bytes)));
        semi_family.insert(0, "ui-semibold".into());
    }
    fonts.families.insert(semibold(), semi_family);
    ctx.set_fonts(fonts);
}
