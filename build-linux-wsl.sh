#!/bin/bash

# Ensure Go and Wails paths work inside WSL bash
export PATH=/usr/local/go/bin:$HOME/go/bin:$PATH

# Navigate to UI directory
cd /mnt/f/transender/ui || {
  echo "❌ Directory /mnt/f/transender/ui not found"
  exit 1
}

# Build Linux binary with Wails
wails build -platform linux/amd64 -o ../../../builds/transend_linux
