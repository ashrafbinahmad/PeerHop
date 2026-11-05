//! Desktop notifications for finished transfers, bundled so a batch of files
//! produces one toast. Only fires while the window is in the background.

use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, channel};
use std::time::Duration;

use super::i18n::I18n;

/// Small files finish before anyone looks away; don't nag about them.
const MIN_SIZE: u64 = 5 * 1024 * 1024;
const BUNDLE_WINDOW: Duration = Duration::from_millis(1500);

pub enum Note {
    Received { name: String, size: u64 },
    ClientDone { device: String, name: String, size: u64 },
}

pub fn spawn(lang: Arc<Mutex<Arc<I18n>>>, focused: Arc<AtomicBool>) -> Sender<Note> {
    let (tx, rx) = channel::<Note>();
    std::thread::Builder::new()
        .name("notifier".into())
        .spawn(move || {
            while let Ok(first) = rx.recv() {
                let mut batch = vec![first];
                let deadline = std::time::Instant::now() + BUNDLE_WINDOW;
                while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
                    match rx.recv_timeout(left) {
                        Ok(n) => batch.push(n),
                        Err(_) => break,
                    }
                }
                batch.retain(|n| match n {
                    Note::Received { size, .. } | Note::ClientDone { size, .. } => *size >= MIN_SIZE,
                });
                if batch.is_empty() || focused.load(Ordering::Relaxed) {
                    continue;
                }
                let i18n = lang.lock().clone();
                peerhop::platform::notify(i18n.t("app_name").to_string(), body(&i18n, &batch));
            }
        })
        .ok();
    tx
}

fn body(t: &I18n, batch: &[Note]) -> String {
    match batch {
        [Note::Received { name, .. }] => t.tf("notification_received_body", &[("filename", name)]),
        [Note::ClientDone { device, name, .. }] => t.tf("notification_client_received_body", &[("device", device), ("filename", name)]),
        _ => {
            let first_name = |n: &Note| match n {
                Note::ClientDone { name, .. } => Some(name.clone()),
                _ => None,
            };
            let names: Vec<_> = batch.iter().map(first_name).collect();
            let count = batch.len().to_string();
            match &names[0] {
                Some(name) if names.iter().all(|n| n.as_ref() == Some(name)) => {
                    t.tf("notification_multi_client_received_body", &[("count", &count), ("filename", name)])
                }
                _ => t.tf("notification_multi_files_received_body", &[("count", &count)]),
            }
        }
    }
}
