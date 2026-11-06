//! Our own title bar (the window is undecorated): drag to move, double-click to
//! maximize, minimize / maximize-restore / close, and resizing from the edges.

use eframe::egui;
use egui::{Align2, Color32, CursorIcon, FontId, Id, Rect, ResizeDirection, Sense, Stroke, Ui, ViewportCommand, pos2, vec2};
use egui_phosphor::regular as icon;

use super::app::App;
use super::theme;
use super::widgets;

pub const TITLE_H: f32 = 34.0;
const BTN_W: f32 = 46.0;
/// Grab width of the invisible resize border.
const EDGE: f32 = 5.0;

impl App {
    pub(crate) fn title_bar(&mut self, ui: &mut Ui) {
        let p = self.pal;
        let ctx = ui.ctx().clone();
        let maximized = ctx.input(|i| i.viewport().maximized.unwrap_or(false));
        let focused = ctx.input(|i| i.focused);
        let bar = ui.max_rect();
        ui.painter().rect_filled(bar, 0, p.panel);
        ui.painter().hline(bar.x_range(), bar.bottom() - 0.5, Stroke::new(1.0, p.border));

        // Buttons first (right to left) so the drag area doesn't swallow their clicks.
        let mut x = bar.right();
        let mut btn = |glyph: &str, tip: &str, danger: bool| {
            x -= BTN_W;
            let r = Rect::from_min_max(pos2(x, bar.top()), pos2(x + BTN_W, bar.bottom() - 1.0));
            let resp = ui.interact(r, Id::new(("title_btn", glyph)), Sense::click());
            let h = ctx.animate_bool_with_time(resp.id, resp.hovered(), 0.1);
            let press = ctx.animate_bool_with_time(resp.id.with("p"), resp.is_pointer_button_down_on(), 0.06);
            let hover_fill = if danger { theme::hex(0xe81123) } else { p.icon_bg };
            if h > 0.0 {
                ui.painter().rect_filled(r, 0, hover_fill.gamma_multiply(h * (1.0 - 0.25 * press)));
            }
            let fg = if danger { widgets::lerp_color(p.sub_text, Color32::WHITE, h) } else { widgets::lerp_color(p.sub_text, p.text, h) };
            ui.painter().text(r.center(), Align2::CENTER_CENTER, glyph, FontId::proportional(15.0), if focused { fg } else { fg.gamma_multiply(0.6) });
            if (h > 0.0 && h < 1.0) || (press > 0.0 && press < 1.0) {
                ctx.request_repaint();
            }
            resp.on_hover_text(tip).clicked()
        };
        if btn(icon::X, self.t("close"), true) {
            ctx.send_viewport_cmd(ViewportCommand::Close);
        }
        let (glyph, tip) = if maximized { (icon::CORNERS_IN, self.t("restore")) } else { (icon::SQUARE, self.t("maximize")) };
        if btn(glyph, tip, false) {
            ctx.send_viewport_cmd(ViewportCommand::Maximized(!maximized));
        }
        if btn(icon::MINUS, self.t("minimize"), false) {
            ctx.send_viewport_cmd(ViewportCommand::Minimized(true));
        }

        // Everything left of the buttons moves the window.
        let drag_rect = Rect::from_min_max(bar.min, pos2(x, bar.bottom()));
        let drag = ui.interact(drag_rect, Id::new("title_drag"), Sense::click_and_drag());
        if drag.double_clicked() {
            ctx.send_viewport_cmd(ViewportCommand::Maximized(!maximized));
        } else if drag.drag_started_by(egui::PointerButton::Primary) {
            ctx.send_viewport_cmd(ViewportCommand::StartDrag);
        }

        // Logo + name.
        let logo = Rect::from_center_size(pos2(bar.left() + 20.0, bar.center().y), vec2(18.0, 18.0));
        ui.painter().image(self.logo.id(), logo, Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), if focused { Color32::WHITE } else { Color32::from_white_alpha(170) });
        let name_c = if focused { p.text } else { p.sub_text };
        ui.painter().text(pos2(logo.right() + 9.0, bar.center().y), Align2::LEFT_CENTER, self.t("app_name"), FontId::new(13.0, theme::semibold()), name_c);
    }

    /// Edges and corners of the undecorated window resize it; also draws a hairline frame.
    pub(crate) fn window_frame(&self, ctx: &egui::Context) {
        let maximized = ctx.input(|i| i.viewport().maximized.unwrap_or(false));
        let screen = ctx.content_rect();
        if !maximized {
            let painter = ctx.layer_painter(egui::LayerId::new(egui::Order::Foreground, Id::new("window_frame")));
            painter.rect_stroke(screen, 0, Stroke::new(1.0, self.pal.border), egui::StrokeKind::Inside);
        }
        if maximized {
            return;
        }
        let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) else { return };
        let (l, r) = (pos.x - screen.left() < EDGE, screen.right() - pos.x < EDGE);
        let (t, b) = (pos.y - screen.top() < EDGE, screen.bottom() - pos.y < EDGE);
        let corner = EDGE * 3.0;
        let (lc, rc) = (pos.x - screen.left() < corner, screen.right() - pos.x < corner);
        let (tc, bc) = (pos.y - screen.top() < corner, screen.bottom() - pos.y < corner);
        let dir = if (t && lc) || (l && tc) {
            Some((ResizeDirection::NorthWest, CursorIcon::ResizeNorthWest))
        } else if (t && rc) || (r && tc) {
            Some((ResizeDirection::NorthEast, CursorIcon::ResizeNorthEast))
        } else if (b && lc) || (l && bc) {
            Some((ResizeDirection::SouthWest, CursorIcon::ResizeSouthWest))
        } else if (b && rc) || (r && bc) {
            Some((ResizeDirection::SouthEast, CursorIcon::ResizeSouthEast))
        } else if l {
            Some((ResizeDirection::West, CursorIcon::ResizeWest))
        } else if r {
            Some((ResizeDirection::East, CursorIcon::ResizeEast))
        } else if t {
            Some((ResizeDirection::North, CursorIcon::ResizeNorth))
        } else if b {
            Some((ResizeDirection::South, CursorIcon::ResizeSouth))
        } else {
            None
        };
        if let Some((dir, cursor)) = dir {
            ctx.set_cursor_icon(cursor);
            if ctx.input(|i| i.pointer.primary_pressed()) {
                ctx.send_viewport_cmd(ViewportCommand::BeginResize(dir));
            }
        }
    }
}
