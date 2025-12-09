#!/usr/bin/env node
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
};

function log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
    log(`  ✗ ${message}`, 'red');
}

// Get version from command line
const version = process.argv[2];

if (!version) {
    error('Version is required!');
    log('Usage: npm run release 1.5.2', 'yellow');
    process.exit(1);
}

// Validate version format (X.Y.Z)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
}

log(`\nStarting release process for v${version}`, 'cyan');
log('================================\n', 'cyan');

try {
    // Step 1: Run prepublish
    log('Running prepublish...', 'cyan');
    execSync(`node ./scripts/prepublish.js ${version}`, { stdio: 'inherit' });

    // Step 2: Run publish
    log('\nRunning publish...', 'cyan');
    execSync(`node ./scripts/publish.js ${version}`, { stdio: 'inherit' });

} catch (err) {
    error('Release process failed!');
    process.exit(1);
}
