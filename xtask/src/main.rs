//! Release tasks, run through cargo aliases (see `.cargo/config.toml`).
//!
//! `cargo msix [patch|minor|major|X.Y.Z|--same]`
//!   Sets the release version everywhere, builds the release GUI (with the
//!   embedded web UI) and packs + signs `builds/peerhop_store.msix`.
//!   Default is `patch`: the Store rejects a package whose version isn't higher
//!   than the last one, so every run gets a new version unless `--same` is given.
//!
//! The steps themselves live in `scripts/` (shared with the npm scripts); this
//! only picks the version and runs them in order.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

type Version = [u32; 3];

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("msix") => msix(args.get(1).map(String::as_str).unwrap_or("patch")),
        _ => Err(USAGE.into()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("\x1b[31merror:\x1b[0m {e}");
            ExitCode::FAILURE
        }
    }
}

const USAGE: &str = "usage: cargo msix [patch|minor|major|X.Y.Z|--same]";

fn msix(how: &str) -> Result<(), String> {
    let root = root();
    let current = parse(read_version(&root)?.as_str()).ok_or("the `version` file does not hold X.Y.Z")?;
    let next = next_version(current, how)?;

    if next != current {
        println!("Version {} -> {}", show(current), show(next));
        node(&root, &["scripts/update-version.js", &show(next)])?;
    } else {
        println!("Version {} (unchanged)", show(current));
    }
    let fail = |step: &str| format!("{step} failed; the version is now {} (rerun with `cargo msix --same`)", show(next));
    node(&root, &["scripts/build-win.js"]).map_err(|_| fail("the Windows build"))?;
    node(&root, &["scripts/build-msix.js"]).map_err(|_| fail("MSIX packaging"))?;
    println!("\x1b[32mbuilds/peerhop_store.msix\x1b[0m  (version {}.0)", show(next));
    Ok(())
}

fn next_version(current: Version, how: &str) -> Result<Version, String> {
    let [major, minor, patch] = current;
    let next = match how {
        "--same" | "same" => return Ok(current),
        "patch" => [major, minor, patch + 1],
        "minor" => [major, minor + 1, 0],
        "major" => [major + 1, 0, 0],
        explicit => parse(explicit).ok_or_else(|| format!("`{explicit}` is not a version\n{USAGE}"))?,
    };
    if next < current {
        return Err(format!("{} is lower than the current {}; the Store only accepts higher versions", show(next), show(current)));
    }
    // MSIX version parts are 16-bit.
    if next.iter().any(|&n| n > 65535) {
        return Err(format!("{} has a part above 65535, which MSIX does not allow", show(next)));
    }
    Ok(next)
}

fn parse(s: &str) -> Option<Version> {
    let mut parts = s.trim().split('.').map(|p| p.parse::<u32>().ok());
    let v = [parts.next()??, parts.next()??, parts.next()??];
    parts.next().is_none().then_some(v)
}

fn show(v: Version) -> String {
    format!("{}.{}.{}", v[0], v[1], v[2])
}

fn read_version(root: &Path) -> Result<String, String> {
    std::fs::read_to_string(root.join("version")).map_err(|e| format!("cannot read the `version` file: {e}"))
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().expect("xtask lives inside the repo").to_path_buf()
}

fn node(root: &Path, args: &[&str]) -> Result<(), String> {
    let status = Command::new("node").args(args).current_dir(root).status().map_err(|e| format!("cannot run node (is Node.js installed?): {e}"))?;
    if status.success() { Ok(()) } else { Err(format!("`node {}` failed", args.join(" "))) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bumps() {
        assert_eq!(next_version([2, 5, 9], "patch"), Ok([2, 5, 10]));
        assert_eq!(next_version([2, 5, 9], "minor"), Ok([2, 6, 0]));
        assert_eq!(next_version([2, 5, 9], "major"), Ok([3, 0, 0]));
        assert_eq!(next_version([2, 5, 9], "--same"), Ok([2, 5, 9]));
        assert_eq!(next_version([2, 5, 9], "2.7.1"), Ok([2, 7, 1]));
        assert!(next_version([2, 5, 9], "2.5.8").is_err());
        assert!(next_version([2, 5, 9], "2.5").is_err());
        assert!(next_version([2, 5, 9], "70000.0.0").is_err());
    }
}
