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

### Key Technologies
- **Core & server**: Rust, tokio, axum
- **Desktop UI**: egui / eframe
- **Web UI**: React, TypeScript, Vite, TailwindCSS
- **Distribution**: NPM, GitHub Releases, Microsoft Store (MSIX), MSI
