# PeerHop - Local File Transfer

![PeerHop Header](assets/header.png)

PeerHop is a lightning-fast tool to share files between devices on your local network. No cloud, no internet required—just direct peer-to-peer transfer via WiFi.

[![NPM Version](https://img.shields.io/npm/v/peerhop)](https://www.npmjs.com/package/peerhop)

## 📥 Downloads

![Download Guide](assets/download.png)

| OS                | Download Link                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Windows** (x64) | [**peerhop_setup.exe**](https://github.com/ashrafbinahmad/peerhop/releases/latest/download/peerhop_setup.exe) |
| **Linux** (x64)   | [**peerhop-linux**](https://github.com/ashrafbinahmad/peerhop/releases/latest/download/peerhop-linux)         |

## 🚀 Quick Start (No Install)

If you have Node.js installed, just run:

```bash
npx peerhop <file>
```

## 📦 Installation

### Windows

1. Download [peerhop.exe](https://github.com/ashrafbinahmad/peerhop/releases/latest/download/peerhop.exe).
2. Add it to your PATH or run it directly from PowerShell/CMD.

### Linux (Apt-Get / Manual)

**Standard Install (One-line)**:

```bash
curl -L https://github.com/ashrafbinahmad/peerhop/releases/latest/download/peerhop-linux -o peerhop && chmod +x peerhop && sudo mv peerhop /usr/local/bin/
```

**Install via Apt (Debian/Ubuntu)**:
_Coming soon! For now, please use the command above or NPM._

```bash
# sudo add-apt-repository ppa:peerhop/stable
# sudo apt-get update
# sudo apt-get install peerhop
```

### NPM (Cross-Platform)

```bash
npm install -g peerhop
```

## 🛠 Usage

![Usage Guide](assets/usage.png)

### Sending Files

```bash
# Send a single file
peerhop image.png

# Send multiple files (automatically zipped)
peerhop photo1.jpg photo2.jpg documents/
```

### Receiving Files

```bash
peerhop -r
```

1. Run the command.
2. Scan the QR code with a phone.
3. Select files on the phone to upload.

## 📱 Desktop GUI

A native, lightweight GUI (Rust + egui) is included. Drop, paste (Ctrl+V) or pick files to share; phones connect by scanning the QR code.

```bash
# Run the standalone executable
peerhop.exe
```

## 🧠 Architecture & Codebase

PeerHop is written in **Rust**. The desktop app is a native **egui** window; phones and other browsers use a **React** web page that the app serves itself (embedded in the binary). The core engine is a lightweight HTTP server (axum/tokio) that streams files directly between devices over the local network (LAN) without routing through external servers.

### Directory Structure

- **`/src`**: The Rust crate.
  - **`store.rs`** / **`hub.rs`**: Transactions, connected devices and the shared session state (with the WebSocket broadcast channel).
  - **`server/`**: HTTP API, range-aware downloads, streaming uploads, WebSocket updates and the embedded web UI.
  - **`net.rs`**: LAN IP, Wi-Fi/hotspot discovery and Wi-Fi QR payloads.
  - **`platform.rs`**: OS integration (open/reveal files, notifications, clipboard, single instance, Windows share target).
  - **`settings.rs`**, **`util.rs`**: Persistent settings (same file as earlier versions) and helpers (zip, file names, logging).
  - **`gui/`**: The egui desktop UI (chat, connect, settings, themes, translations).
  - **`main.rs`** / **`bin/peerhop-cli.rs`**: Desktop app and CLI entry points.
- **`/ui/frontend`**: The React, Vite and TailwindCSS web UI used by phones and browsers (`build.rs` builds it if `dist/` is missing).
- **`/ui/build`**: Windows icon and MSI (WiX) sources. **`/share_shim`**: the MSIX share-target helper.
- **`/npm-package` & `/scripts`**: Build and distribution scripts for NPM, Windows, and Linux releases.

### Development

```bash
npm run dev          # run the desktop app (cargo run)
npm run dev:cli -- <file>   # run the CLI
npm test             # cargo test
npm run build:win    # release build -> builds/peerhop_win.exe
npm run build:linux:wsl     # Linux GUI + CLI via WSL
```

Requires a Rust toolchain (1.85+, edition 2024) and Node.js for the web UI. On Linux the GUI also needs the usual X11/Wayland and GTK development packages.

### Microsoft Store package (MSIX)

```bash
cargo msix            # bump the patch version (2.5.9 -> 2.5.10), build and pack builds/peerhop_store.msix
cargo msix minor      # or: major, an explicit X.Y.Z, or --same to rebuild without bumping
```

Needs the Windows 10/11 SDK (MakeAppx, SignTool), CMake and Visual Studio for the share-target helper. The package is signed with a self-signed certificate from your own certificate store (created on first run by `scripts/generate-test-cert.ps1`), or with `PEERHOP_SIGN_PFX` / `PEERHOP_SIGN_PASSWORD` if set. No certificate or password is kept in the repo, and Store uploads are re-signed by Microsoft.

### Key Technologies
- **Core & server**: Rust, tokio, axum
- **Desktop UI**: egui / eframe
- **Web UI**: React, TypeScript, Vite, TailwindCSS
- **Distribution**: NPM, GitHub Releases, Microsoft Store (MSIX), MSI

## 🔒 Privacy

Transfers go directly between devices on your network; files never pass through a PeerHop server.

The desktop app sends **anonymous usage counts per country** to a Firebase Realtime Database: one count per install, and the number and total size of completed file transfers. The country comes from [ipinfo.io](https://ipinfo.io). No files, file names, device names, IP addresses or identifiers are stored. Turn it off in **Settings > Share usage stats**. The code is in [`src/analytics.rs`](src/analytics.rs) and the database rules in [`firebase/database.rules.json`](firebase/database.rules.json).

## 🍴 Forks

You're welcome to fork and modify PeerHop under the license below. Two requests:

- **Use your own name and logo.** The license covers the code, not the PeerHop name or logo; please don't publish forks (on the Microsoft Store, npm or elsewhere) as "PeerHop" or with its icon.
- **Point analytics at your own database** (`DB` in `src/analytics.rs`) or remove it, so your users aren't counted as PeerHop's.

## 🤝 Contributing

Issues and pull requests are welcome. Please run `cargo test` before sending a PR. Report security issues privately, see [SECURITY.md](SECURITY.md).

## 📄 License

[ISC](LICENSE) © Muhammed Asraf. Third-party licenses are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
