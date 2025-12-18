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

A native, lightweight GUI (Wails) is included.

```bash
# Run the standalone executable
peerhop.exe
```

## 🧠 How it Works

PeerHop is built with **Go** for high performance. It uses a lightweight HTTP server to stream files directly between devices on your LAN.
