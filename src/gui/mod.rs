//! Native desktop UI (egui).

use eframe::egui;

mod app;
mod chat;
mod connect;
mod i18n;
mod notifier;
mod rail;
mod settings_panel;
mod sheets;
mod theme;
mod thumbs;
mod titlebar;
mod widgets;

pub const FEEDBACK_URL: &str = "https://github.com/ashrafbinahmad/peerhop/issues/new";
pub const COFFEE_URL: &str = "https://buymeacoffee.com/peerhop";

pub fn run(initial_files: Vec<String>) -> eframe::Result {
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("PeerHop")
        .with_app_id("peerhop")
        .with_inner_size([790.0, 700.0])
        // Never narrower than the expanded sidebar layout.
        .with_min_inner_size([rail::WIDE_FROM, 520.0])
        // We draw our own title bar (see titlebar.rs).
        .with_decorations(false)
        .with_drag_and_drop(true);
    // Scaled down: a full-size (1890px) window icon stalls the first seconds of
    // painting on Windows.
    if let Some(img) = app::load_png(include_bytes!("../../ui/frontend/src/assets/images/appicon.png"), 128) {
        let [w, h] = img.size;
        let rgba = img.pixels.iter().flat_map(|c| c.to_srgba_unmultiplied()).collect();
        viewport = viewport.with_icon(egui::IconData { rgba, width: w as u32, height: h as u32 });
    }
    let options = eframe::NativeOptions { viewport, centered: true, ..Default::default() };
    eframe::run_native("PeerHop", options, Box::new(move |cc| Ok(Box::new(app::App::new(cc, initial_files)))))
}
