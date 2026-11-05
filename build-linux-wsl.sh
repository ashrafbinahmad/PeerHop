#!/bin/bash
# Build the Linux GUI and CLI with cargo (run inside WSL or on Linux).
# Needs: rustup toolchain, Node.js, and the GUI build deps
#   (e.g. libxkbcommon-dev libgtk-3-dev libdbus-1-dev pkg-config).
set -e
export PATH="$HOME/.cargo/bin:$PATH"

cd "$(dirname "$0")"
# Separate target dir so Linux artifacts don't clash with the Windows ones.
cargo build --release --bin PeerHop --bin peerhop-cli --target-dir target/linux

mkdir -p builds
cp target/linux/release/PeerHop builds/peerhop_linux
cp target/linux/release/peerhop-cli builds/peerhop_cli_linux
echo "✓ Built builds/peerhop_linux and builds/peerhop_cli_linux"
