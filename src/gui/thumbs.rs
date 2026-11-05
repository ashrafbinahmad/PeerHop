//! Image thumbnails decoded off the UI thread.

use eframe::egui;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};

const SIZE: u32 = 160;
const MAX_SOURCE_BYTES: u64 = 80 * 1024 * 1024;

enum Slot {
    Loading,
    Ready(egui::TextureHandle),
    None,
}

pub struct Thumbs {
    slots: HashMap<PathBuf, Slot>,
    req: Sender<PathBuf>,
    done: Receiver<(PathBuf, Option<egui::ColorImage>)>,
}

pub fn is_image(name: &str) -> bool {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp")
}

impl Thumbs {
    pub fn new(ctx: egui::Context) -> Self {
        let (req, jobs) = channel::<PathBuf>();
        let (out, done) = channel();
        std::thread::Builder::new()
            .name("thumbs".into())
            .spawn(move || {
                for path in jobs {
                    let img = decode(&path);
                    if out.send((path, img)).is_err() {
                        return;
                    }
                    ctx.request_repaint();
                }
            })
            .ok();
        Self { slots: HashMap::new(), req, done }
    }

    /// Texture for `path`, scheduling a decode on first request.
    pub fn get(&mut self, ctx: &egui::Context, path: &Path) -> Option<egui::TextureHandle> {
        while let Ok((p, img)) = self.done.try_recv() {
            let slot = match img {
                Some(img) => Slot::Ready(ctx.load_texture(p.to_string_lossy(), img, egui::TextureOptions::LINEAR)),
                None => Slot::None,
            };
            self.slots.insert(p, slot);
        }
        match self.slots.get(path) {
            Some(Slot::Ready(t)) => Some(t.clone()),
            Some(_) => None,
            None => {
                self.slots.insert(path.to_path_buf(), Slot::Loading);
                let _ = self.req.send(path.to_path_buf());
                None
            }
        }
    }

    pub fn forget(&mut self, path: &Path) {
        self.slots.remove(path);
    }
}

fn decode(path: &Path) -> Option<egui::ColorImage> {
    if std::fs::metadata(path).ok()?.len() > MAX_SOURCE_BYTES {
        return None;
    }
    let img = image::ImageReader::open(path).ok()?.with_guessed_format().ok()?.decode().ok()?;
    let thumb = img.thumbnail(SIZE, SIZE).to_rgba8();
    let (w, h) = thumb.dimensions();
    Some(egui::ColorImage::from_rgba_unmultiplied([w as usize, h as usize], thumb.as_raw()))
}
