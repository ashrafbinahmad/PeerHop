#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    white: '\x1b[37m'
};

function log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function step(num, total, message) {
    log(`[${num}/${total}] ${message}`, 'yellow');
}

function success(message) {
    log(`  ✓ ${message}`, 'green');
}

function error(message) {
    log(`  ✗ ${message}`, 'red');
}

function info(message) {
    log(`  ℹ ${message}`, 'yellow');
}

function exec(command, description) {
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (err) {
        error(`${description} failed`);
        return false;
    }
}

// Get version from command line
const version = process.argv[2];

if (!version) {
    error('Version is required!');
    log('Usage: npm run prepublish 1.5.1', 'yellow');
    process.exit(1);
}

// Validate version format (X.Y.Z)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
}

log(`\nBuilding Transend v${version}`, 'cyan');
log('================================\n', 'cyan');

const buildsDir = path.join(__dirname, '..', 'builds');
const backupDir = path.join(__dirname, '..', 'builds_backup');

// Step 1: Clean existing builds (or backup if locked)
step(1, 5, 'Cleaning existing builds...');
if (fs.existsSync(buildsDir)) {
    try {
        fs.rmSync(buildsDir, { recursive: true, force: true, maxRetries: 3 });
        success('Removed old builds');
    } catch (err) {
        // If deletion fails (file locked), copy to backup instead
        info('Folder is locked, copying to builds_backup...');
        try {
            if (fs.existsSync(backupDir)) {
                fs.rmSync(backupDir, { recursive: true, force: true, maxRetries: 3 });
            }
            fs.cpSync(buildsDir, backupDir, { recursive: true });
            success('Copied builds to builds_backup');
            info('Will overwrite files in builds folder');
        } catch (copyErr) {
            error('Could not backup builds folder');
            log(`  Error: ${copyErr.message}`, 'red');
            log('  Please close all programs accessing the builds folder', 'yellow');
            process.exit(1);
        }
    }
} else {
    info('No existing builds to clean');
}

// Create builds directory if it doesn't exist
if (!fs.existsSync(buildsDir)) {
    fs.mkdirSync(buildsDir, { recursive: true });
}
log('');

// Step 2: Build CLI binaries
step(2, 5, 'Building CLI binaries...');
log('  Building Windows CLI...', 'white');
if (!exec('npm run build:cli:win', 'Windows CLI build')) {
    process.exit(1);
}
success('Built Windows CLI');

log('  Building Linux CLI...', 'white');
if (!exec('npm run build:cli:linux', 'Linux CLI build')) {
    process.exit(1);
}
success('Built Linux CLI\n');

// Step 3: Install frontend dependencies
step(3, 5, 'Installing frontend dependencies...');
process.chdir(path.join(__dirname, '..', 'ui', 'frontend'));
if (!exec('npm install', 'Frontend npm install')) {
    error('Failed to install frontend dependencies');
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Frontend dependencies installed\n');

// Step 3.5: Update version in MSI product.wxs
step('3.5', 5, 'Updating MSI installer version...');
const productWxsPath = path.join(__dirname, '..', 'ui', 'build', 'windows', 'msi', 'product.wxs');
try {
    let productWxs = fs.readFileSync(productWxsPath, 'utf8');

    // Update Version attribute in Package element
    productWxs = productWxs.replace(
        /Version="[^"]*"/,
        `Version="${version}"`
    );

    fs.writeFileSync(productWxsPath, productWxs);
    success(`Updated MSI version to ${version}\n`);
} catch (err) {
    error(`Failed to update MSI version: ${err.message}`);
    process.exit(1);
}

// Step 3.6: Clean cached icon files to force regeneration
step('3.6', 5, 'Cleaning cached icon files...');
const iconsToClean = [
    path.join(__dirname, '..', 'ui', 'build', 'windows', 'icon.ico'),
    path.join(__dirname, '..', 'ui', 'build', 'windows', '_icon.ico'),
    path.join(__dirname, '..', 'ui', 'build', '_appicon.png'),
];

let iconsRemoved = 0;
for (const iconPath of iconsToClean) {
    try {
        if (fs.existsSync(iconPath)) {
            fs.unlinkSync(iconPath);
            iconsRemoved++;
        }
    } catch (err) {
        info(`Could not remove ${path.basename(iconPath)}: ${err.message}`);
    }
}

if (iconsRemoved > 0) {
    success(`Removed ${iconsRemoved} cached icon file(s) - will be regenerated from appicon.png\n`);
} else {
    info('No cached icon files found to clean\n');
}

// Step 4: Build GUI applications (Windows only - Linux requires WSL)
step(4, 5, 'Building GUI applications...');

// Build flags with version info
const buildFlags = `-ldflags "-X main.version=${version}"`;
const uiDir = path.join(__dirname, '..', 'ui');

log('  Building Windows GUI NSIS installer...', 'white');
process.chdir(uiDir);
if (!exec(`wails build -platform windows/amd64 -nsis ${buildFlags} -o ../../../builds/transend_setup.exe`, 'Windows GUI NSIS build')) {
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Built Windows GUI NSIS installer');

log('  Building Windows GUI MSI installer...', 'white');
process.chdir(uiDir);
if (!exec(`wails build -platform windows/amd64 ${buildFlags}`, 'Windows GUI build for MSI')) {
    process.exit(1);
}
process.chdir(path.join(uiDir, 'build', 'windows', 'msi'));
if (!exec('wix build product.wxs -o ../../../../builds/transend_setup.msi', 'WiX MSI build')) {
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Built Windows GUI MSI installer');

log('  Building Windows GUI executable...', 'white');
process.chdir(uiDir);
if (!exec(`wails build -platform windows/amd64 ${buildFlags} -o ../../../builds/transend_win.exe`, 'Windows GUI build')) {
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Built Windows GUI\n');

info('Skipping Linux GUI build (requires WSL - build manually if needed)');
log('');

// Step 5: Verify all builds
step(5, 5, 'Verifying builds...');
const requiredFiles = [
    'builds/transend_win.exe',
    'builds/transend_setup.exe',
    'builds/transend_setup.msi',
    'builds/transend_cli_win.exe',
    'builds/transend_cli_linux'
];

const optionalFiles = [
    'builds/transend_linux'
];

let allPresent = true;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        success(`Found: ${file}`);
    } else {
        error(`Missing: ${file}`);
        allPresent = false;
    }
}

for (const file of optionalFiles) {
    if (fs.existsSync(file)) {
        success(`Found (optional): ${file}`);
    } else {
        info(`Optional: ${file} (build in WSL if needed)`);
    }
}

if (!allPresent) {
    error('Some build files are missing!');
    process.exit(1);
}
log('');

log('================================', 'cyan');
log(`✓ Successfully built v${version}!`, 'green');
log('  - All binaries created', 'white');
log('  - Installers ready', 'white');
log('\nNext steps:', 'cyan');
log('  Run: npm run publish', 'white');
log('  Or manually test the builds in ./builds/', 'white');
