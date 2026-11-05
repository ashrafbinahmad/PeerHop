#!/bin/bash
# Build the web UI that cargo embeds into the binaries (ui/frontend/dist).
set -e
cd "$(dirname "$0")/../ui/frontend" && npm run build
echo "✓ Frontend built; run cargo build to embed it"
