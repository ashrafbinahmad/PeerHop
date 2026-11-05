//! Builds the embedded web UI when missing and stamps the Windows icon/version.

use std::path::Path;
use std::process::Command;

fn main() {
    let frontend = Path::new("ui/frontend");
    println!("cargo:rerun-if-changed=ui/frontend/src");
    println!("cargo:rerun-if-changed=ui/frontend/index.html");
    println!("cargo:rerun-if-changed=ui/frontend/package.json");
    println!("cargo:rerun-if-env-changed=PEERHOP_SKIP_FRONTEND");
    println!("cargo:rerun-if-env-changed=VITE_DEFAULT_LANG");

    let dist_ready = frontend.join("dist/index.html").exists();
    if !dist_ready && std::env::var_os("PEERHOP_SKIP_FRONTEND").is_none() {
        let npm = if cfg!(windows) { "npm.cmd" } else { "npm" };
        let run = |args: &[&str]| Command::new(npm).args(args).current_dir(frontend).status().map(|s| s.success()).unwrap_or(false);
        if !frontend.join("node_modules").exists() && !run(&["install"]) {
            panic!("`npm install` failed in ui/frontend; install Node.js or build the web UI manually");
        }
        if !run(&["run", "build"]) {
            panic!("`npm run build` failed in ui/frontend");
        }
    }

    #[cfg(windows)]
    {
        println!("cargo:rerun-if-changed=ui/build/windows/icon.ico");
        let mut res = winresource::WindowsResource::new();
        if Path::new("ui/build/windows/icon.ico").exists() {
            res.set_icon("ui/build/windows/icon.ico");
        }
        res.set("ProductName", "PeerHop").set("FileDescription", "PeerHop").set("CompanyName", "PeerHop");
        if let Err(e) = res.compile() {
            println!("cargo:warning=Could not embed Windows resources: {e}");
        }
    }
}
