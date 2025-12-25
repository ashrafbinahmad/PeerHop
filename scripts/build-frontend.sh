#!/bin/bash
# Sync frontend dist to all embedded locations

echo "Building frontend..."
cd ui/frontend && npm run build && cd ../..

echo "Copying dist to pkg/server/dist..."
rm -rf pkg/server/dist
cp -r ui/frontend/dist pkg/server/dist

echo "✓ Frontend synced to all locations!"
