//! Native desktop UI (egui).

use eframe::egui;

mod app;
mod chat;
mod connect;
mod i18n;
mod notifier;
mod settings_panel;
mod theme;
mod thumbs;
mod widgets;

pub const FEEDBACK_URL: &str = "https://github.com/ashrafbinahmad/peerhop/issues/new";
pub const COFFEE_URL: &str = "https://buymeacoffee.com/peerhop";

pub fn run(initial_files: Vec<String>) -> eframe::Result {
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("PeerHop")
        .with_app_id("peerhop")
        .with_inner_size([1060.0, 700.0])
        .with_min_inner_size([380.0, 520.0])
        .with_drag_and_drop(true);
    if let Some(img) = app::load_png(include_bytes!("../../ui/frontend/src/assets/images/appicon.png")) {
        let [w, h] = img.size;
        let rgba = img.pixels.iter().flat_map(|c| c.to_srgba_unmultiplied()).collect();
        viewport = viewport.with_icon(egui::IconData { rgba, width: w as u32, height: h as u32 });
    }
    let options = eframe::NativeOptions { viewport, centered: true, ..Default::default() };
    eframe::run_native("PeerHop", options, Box::new(move |cc| Ok(Box::new(app::App::new(cc, initial_files)))))
}
