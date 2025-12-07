# Transend - Local File Transfer

Transend is a lightning-fast tool to share files between devices on your local network. No cloud, no internet required—just direct peer-to-peer transfer via WiFi.

[![NPM Version](https://img.shields.io/npm/v/transend)](https://www.npmjs.com/package/transend)

## 📥 Downloads

| OS | Download Link |
|----|---------------|
| **Windows** (x64) | [**transend.exe**](https://github.com/ashrafbinahmad/transend/releases/latest/download/transend.exe) |
| **Linux** (x64) | [**transend-linux**](https://github.com/ashrafbinahmad/transend/releases/latest/download/transend-linux) |

*(Note: Replace links with your actual GitHub Release URLs once published)*

## 🚀 Quick Start (No Install)

If you have Node.js installed, just run:

```bash
npx transend <file>
```

## 📦 Installation

### Windows
1. Download [transend.exe](https://github.com/ashrafbinahmad/transend/releases/latest/download/transend.exe).
2. Add it to your PATH or run it directly from PowerShell/CMD.

### Linux (Apt-Get / Manual)

**Standard Install (One-line)**:
```bash
curl -L https://github.com/ashrafbinahmad/transend/releases/latest/download/transend-linux -o transend && chmod +x transend && sudo mv transend /usr/local/bin/
```

**Install via Apt (Debian/Ubuntu)**:
*Coming soon! For now, please use the command above or NPM.*
```bash
# sudo add-apt-repository ppa:transend/stable
# sudo apt-get update
# sudo apt-get install transend
```

### NPM (Cross-Platform)
```bash
npm install -g transend
```

## 🛠 Usage

### Sending Files
```bash
# Send a single file
transend image.png

# Send multiple files (automatically zipped)
transend photo1.jpg photo2.jpg documents/
```

### Receiving Files
```bash
transend -r
```
1. Run the command.
2. Scan the QR code with a phone.
3. Select files on the phone to upload.

## 📱 Desktop GUI
A modern Electron-based GUI is included in the `ui/` folder.
```bash
cd ui
npm install
npm run dev
```

## 🧠 How it Works
Transend is built with **Go** for high performance. It uses a lightweight HTTP server to stream files directly between devices on your LAN.
