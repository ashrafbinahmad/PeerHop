#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const platform = os.platform();
const arch = os.arch();

if (arch !== 'x64') {
    console.error(`Architecture '${arch}' is not supported. This tool currently supports x64.`);
    process.exit(1);
}

let binName = '';
if (platform === 'win32') {
    binName = 'peerhop-win.exe';
} else if (platform === 'linux') {
    binName = 'peerhop-linux';
} else {
    console.error(`Platform '${platform}' is not supported. Supported: linux, win32`);
    process.exit(1);
}

const binPath = path.join(__dirname, 'bin', binName);
const args = process.argv.slice(2);

// Spawn the binary and inherit stdio so we see the QR code and progress bar
const child = spawn(binPath, args, { stdio: 'inherit' });

child.on('error', (err) => {
    console.error('Failed to start subprocess:', err);
});

child.on('exit', (code) => {
    process.exit(code);
});
