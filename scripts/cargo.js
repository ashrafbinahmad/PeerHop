// Shared helpers for building the Rust binaries from the release scripts.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const EXE = process.platform === "win32" ? ".exe" : "";

/** Build the web UI (embedded into the binaries), optionally with a default language. */
function buildFrontend(env = {}) {
  execSync("npm run build", {
    cwd: path.join(ROOT_DIR, "ui", "frontend"),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/** `cargo build --release` for the given binaries (default: GUI + CLI). */
function cargoBuild(bins = ["PeerHop", "peerhop-cli"], env = {}) {
  const args = bins.map((b) => `--bin ${b}`).join(" ");
  execSync(`cargo build --release ${args}`, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/** Path of a release binary built by cargoBuild. */
function releaseBinary(bin) {
  return path.join(ROOT_DIR, "target", "release", bin + EXE);
}

/** Copy a release binary to `dest` (relative to the repo root), creating folders. */
function copyBinary(bin, dest) {
  const target = path.join(ROOT_DIR, dest);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(releaseBinary(bin), target);
  return target;
}

/**
 * Build the Windows GUI and place it where the packaging steps expect it:
 * builds/peerhop_win.exe (MSIX) and ui/build/bin/PeerHop.exe (WiX MSI source).
 */
function buildWindowsGui(env = {}) {
  cargoBuild(["PeerHop"], env);
  copyBinary("PeerHop", "builds/peerhop_win.exe");
  copyBinary("PeerHop", "ui/build/bin/PeerHop.exe");
}

module.exports = { ROOT_DIR, buildFrontend, cargoBuild, releaseBinary, copyBinary, buildWindowsGui };
