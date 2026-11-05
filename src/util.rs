use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// `1.50 MB` style sizes (binary units), matching the old UI.
pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1024.0 && i < UNITS.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    format!("{v:.2} {}", UNITS[i])
}

/// `2.40 MB/s` transfer rate.
pub fn format_speed(bytes_per_sec: f64) -> String {
    format!("{}/s", format_bytes(bytes_per_sec.max(0.0) as u64))
}

/// Reduces an untrusted upload name to a safe single file name.
pub fn sanitize_filename(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_control() || r#"<>:"|?*"#.contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    (!cleaned.is_empty() && cleaned != "." && cleaned != "..").then_some(cleaned)
}

/// `dir/name`, or `dir/name_<unix>.ext` if that already exists.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ts = chrono::Utc::now().timestamp();
    match p.extension() {
        Some(ext) => dir.join(format!("{stem}_{ts}.{}", ext.to_string_lossy())),
        None => dir.join(format!("{stem}_{ts}")),
    }
}

/// Bundles files and folders into `bundle_<unix>.zip` in the temp dir.
pub fn zip_paths(paths: &[PathBuf]) -> std::io::Result<PathBuf> {
    let out = std::env::temp_dir().join(format!("bundle_{}.zip", chrono::Utc::now().timestamp()));
    let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(std::fs::File::create(&out)?));
    let opts = zip::write::SimpleFileOptions::default().large_file(true);
    let mut add = |src: &Path, name: String| -> std::io::Result<()> {
        zip.start_file(name.replace('\\', "/"), opts).map_err(std::io::Error::other)?;
        std::io::copy(&mut std::fs::File::open(src)?, &mut zip)?;
        Ok(())
    };
    for p in paths {
        if p.is_dir() {
            let root = p.parent().unwrap_or(p);
            let mut stack = vec![p.clone()];
            while let Some(dir) = stack.pop() {
                for entry in std::fs::read_dir(&dir)? {
                    let path = entry?.path();
                    if path.is_dir() {
                        stack.push(path);
                    } else {
                        let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().into_owned();
                        add(&path, rel)?;
                    }
                }
            }
        } else {
            add(p, p.file_name().unwrap_or_default().to_string_lossy().into_owned())?;
        }
    }
    zip.finish().map_err(std::io::Error::other)?.flush()?;
    Ok(out)
}

/// 128-bit random hex token.
pub fn random_token() -> String {
    let bytes: [u8; 16] = rand::random();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Constant-time comparison so a token cannot be probed byte by byte.
pub fn token_eq(a: &str, b: &str) -> bool {
    !b.is_empty() && a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| crate::settings::home_dir().file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "PeerHop".into())
}

// ---------- minimal file logger (10 MB rotation) ----------

static LOG: OnceLock<parking_lot::Mutex<Option<std::fs::File>>> = OnceLock::new();

fn log_file() -> &'static parking_lot::Mutex<Option<std::fs::File>> {
    LOG.get_or_init(|| {
        let path = crate::settings::app_data_dir().join("logs").join("peerhop.log");
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > 10 * 1024 * 1024) {
            let _ = std::fs::rename(&path, path.with_extension("log.old"));
        }
        parking_lot::Mutex::new(std::fs::OpenOptions::new().create(true).append(true).open(&path).ok())
    })
}

/// Appends a line to `<app data>/logs/peerhop.log`. Use `log_info!` / `log_warn!`.
pub fn log(level: &str, msg: std::fmt::Arguments<'_>) {
    let line = format!("{} [{level}] {msg}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
    if cfg!(debug_assertions) {
        eprint!("{line}");
    }
    if let Some(f) = log_file().lock().as_mut() {
        let _ = f.write_all(line.as_bytes());
    }
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => { $crate::util::log("INFO", format_args!($($arg)*)) };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => { $crate::util::log("WARN", format_args!($($arg)*)) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_untrusted_names() {
        assert_eq!(sanitize_filename("../../etc/passwd").as_deref(), Some("passwd"));
        assert_eq!(sanitize_filename(r"C:\dir\a<b>.txt").as_deref(), Some("a_b_.txt"));
        assert_eq!(sanitize_filename(".."), None);
        assert_eq!(sanitize_filename("   "), None);
    }

    #[test]
    fn formats_sizes() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1536), "1.50 KB");
    }

    #[test]
    fn compares_tokens() {
        assert!(token_eq("abc", "abc"));
        assert!(!token_eq("abd", "abc"));
        assert!(!token_eq("", ""));
    }

    #[test]
    fn unique_path_avoids_collisions() {
        let dir = std::env::temp_dir().join(format!("peerhop_test_{}", random_token()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a.txt"));
        std::fs::write(dir.join("a.txt"), b"x").unwrap();
        let p = unique_path(&dir, "a.txt");
        assert_ne!(p, dir.join("a.txt"));
        assert!(p.to_string_lossy().ends_with(".txt"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
