#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildMSIX } = require('./build-msix');

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

log(`\nBuilding PeerHop v${version}`, 'cyan');
log('================================\n', 'cyan');
log('Build Process Overview:', 'cyan');
log('  1. Clean old builds', 'white');
log('  2. Install frontend dependencies', 'white');
log('  3. Build frontend (embedded)', 'white');
log('  4. Build CLI binaries', 'white');
log('  5. Build GUI applications', 'white');
log('  6. Verify all builds\n', 'white');

const buildsDir = path.join(__dirname, '..', 'builds');
const backupDir = path.join(__dirname, '..', 'builds_backup');

// Step 0.5: Update frontend versions
step('0.5', 6, 'Updating frontend versions...');
const frontendVersionPath = path.join(__dirname, '..', 'ui', 'frontend', 'src', 'version.ts');
const frontendPackageJsonPath = path.join(__dirname, '..', 'ui', 'frontend', 'package.json');
try {
    // 1. Update version.ts
    fs.writeFileSync(frontendVersionPath, `export const APP_VERSION = "${version}";\n`);

    // 2. Update package.json
    const frontendPackageJson = JSON.parse(fs.readFileSync(frontendPackageJsonPath, 'utf8'));
    frontendPackageJson.version = version;
    fs.writeFileSync(frontendPackageJsonPath, JSON.stringify(frontendPackageJson, null, 2) + '\n');

    success(`Updated frontend versions to ${version}\n`);
} catch (err) {
    error(`Failed to update frontend versions: ${err.message}`);
    process.exit(1);
}

// Step 1: Clean existing builds (or backup if locked)
step(1, 6, 'Cleaning existing builds...');
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



// Step 2: Install frontend dependencies
step(2, 6, 'Installing frontend dependencies...');
process.chdir(path.join(__dirname, '..', 'ui', 'frontend'));
if (!exec('npm install', 'Frontend npm install')) {
    error('Failed to install frontend dependencies');
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Frontend dependencies installed\n');

// Step 2.5: Update version in MSI product.wxs
step('2.5', 6, 'Updating MSI installer version...');
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

// Step 2.6: Clean cached icon files to force regeneration
step('2.6', 6, 'Cleaning cached icon files...');
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

// Step 3: Build frontend (CRITICAL: Must be done before Wails/CLI build)
// Wails and CLI use Go's embed directive to bundle frontend assets at compile time.
// If we don't rebuild the frontend here, the binaries will contain stale/old UI code.
step(3, 6, 'Building frontend...');
const frontendDir = path.join(__dirname, '..', 'ui', 'frontend');
process.chdir(frontendDir);
log('  Running npm run build...', 'white');
if (!exec('npm run build', 'Frontend build')) {
    error('Failed to build frontend');
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Frontend built successfully\n');

// Verify frontend dist exists
const distDir = path.join(frontendDir, 'dist');
if (!fs.existsSync(distDir)) {
    error('Frontend dist directory not found after build!');
    process.exit(1);
}
const distFiles = fs.readdirSync(distDir);
if (distFiles.length === 0) {
    error('Frontend dist directory is empty!');
    process.exit(1);
}
info(`Frontend dist contains ${distFiles.length} items`);

// Copy dist to pkg/server/dist (CRITICAL for Mobile UI)
log('  Copying frontend build to pkg/server/dist...', 'white');
const serverDistDir = path.join(__dirname, '..', 'pkg', 'server', 'dist');

// Clear existing server dist
if (fs.existsSync(serverDistDir)) {
    fs.rmSync(serverDistDir, { recursive: true, force: true });
}
fs.mkdirSync(serverDistDir, { recursive: true });

// Copy all files
fs.cpSync(distDir, serverDistDir, { recursive: true });
success('Copied frontend to pkg/server/dist\n');

log('');

// Step 4: Build CLI binaries (Must be done after frontend copy)
step(4, 6, 'Building CLI binaries...');
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

// Step 4: Build GUI applications (Windows only - Linux requires WSL)
step(5, 6, 'Building GUI applications...');

// Build flags with version info
const buildFlags = `-ldflags "-X main.version=${version}"`;
const uiDir = path.join(__dirname, '..', 'ui');

log('  Building Windows GUI NSIS installer...', 'white');
process.chdir(uiDir);
if (!exec(`wails build -platform windows/amd64 -nsis ${buildFlags} -o ../../../builds/peerhop_setup.exe`, 'Windows GUI NSIS build')) {
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
if (!exec('wix build product.wxs -ext WixToolset.UI.wixext -o ../../../../builds/peerhop_setup.msi', 'WiX MSI build')) {
    process.exit(1);
}
// Cleanup wixpdb
try {
    const wixpdb = path.join(__dirname, '..', 'builds', 'peerhop_setup.wixpdb');
    if (fs.existsSync(wixpdb)) fs.unlinkSync(wixpdb);
} catch (e) { }
process.chdir(path.join(__dirname, '..'));
success('Built Windows GUI MSI installer');

log('  Building Windows GUI executable...', 'white');
process.chdir(uiDir);
// Build to default location (ui/build/bin/PeerHop.exe) - this ensures proper frontend embedding
if (!exec(`wails build -platform windows/amd64 ${buildFlags}`, 'Windows GUI build')) {
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));

// Copy the built binary to builds directory
const sourceBinary = path.join(uiDir, 'build', 'bin', 'PeerHop.exe');
const targetBinary = path.join(__dirname, '..', 'builds', 'peerhop_win.exe');

if (!fs.existsSync(sourceBinary)) {
    error(`Built binary not found at: ${sourceBinary}`);
    process.exit(1);
}

// Get source binary size for verification
const sourceSize = fs.statSync(sourceBinary).size;
info(`Source binary size: ${(sourceSize / 1024 / 1024).toFixed(2)} MB`);

// Copy to builds directory
try {
    fs.copyFileSync(sourceBinary, targetBinary);
    const targetSize = fs.statSync(targetBinary).size;
    if (targetSize !== sourceSize) {
        error('Binary copy size mismatch!');
        process.exit(1);
    }
    success(`Built Windows GUI (${(targetSize / 1024 / 1024).toFixed(2)} MB)\n`);
    success(`Built Windows GUI (${(targetSize / 1024 / 1024).toFixed(2)} MB)\n`);
} catch (err) {
    error(`Failed to copy binary: ${err.message}`);
    process.exit(1);
}

// Step 4.5: Build MSIX for Microsoft Store
step('5.5', 6, 'Building MSIX package for Microsoft Store...');
try {
    const successMSIX = buildMSIX(version);
    if (successMSIX) {
        success('Built MSIX package for Microsoft Store\n');
    } else {
        error('Failed to build MSIX package');
        // We don't exit(1) here to allow other artifacts to be verified/published if user wants, 
        // but maybe we should? For now, let's keep it non-fatal or make it fatal?
        // User said "do the build-msix", implies it's important. 
        process.exit(1);
    }
} catch (err) {
    error(`Failed to execute MSIX build: ${err.message}`);
    process.exit(1);
}

// Attempt to build Linux GUI in WSL
log('  Building Linux GUI in WSL...', 'white');
try {
    // Check if WSL is available
    execSync('wsl --status', { stdio: 'pipe' });

    // Use the shell script which properly sets up the environment
    const buildScriptPath = path.join(__dirname, '..', 'build-linux-wsl.sh');

    if (!fs.existsSync(buildScriptPath)) {
        throw new Error('build-linux-wsl.sh not found');
    }

    // Convert Windows path to WSL path for the script
    const winPath = buildScriptPath.replace(/\\/g, '/');
    const driveLetter = winPath.charAt(0).toLowerCase();
    const wslScriptPath = `/mnt/${driveLetter}${winPath.substring(2)}`;

    info('Building Linux binary in WSL (this may take a few minutes)...');
    execSync(`wsl bash ${wslScriptPath}`, { stdio: 'inherit' });
    process.chdir(path.join(__dirname, '..'));
    success('Built Linux GUI in WSL\n');
} catch (err) {
    process.chdir(path.join(__dirname, '..'));
    error('Failed to build Linux GUI in WSL');
    if (err.message.includes('not found')) {
        info('Make sure build-linux-wsl.sh exists and WSL is properly configured');
    } else {
        info(`Error: ${err.message}`);
    }
    info('Linux build is optional - continuing without it\n');
}


// Step 5: Verify all builds
step(6, 6, 'Verifying builds...');
const requiredFiles = [
    'builds/peerhop_win.exe',
    'builds/peerhop_setup.exe',
    'builds/peerhop_setup.msi',
    'builds/peerhop_cli_win.exe',
    'builds/peerhop_cli_linux'
];

const optionalFiles = [
    'builds/peerhop_linux'
];

let missingFiles = [];
const copiedFromBackup = [];

// Check which files are present
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        success(`Found: ${file}`);
    } else {
        error(`Missing: ${file}`);
        missingFiles.push(file);
    }
}

for (const file of optionalFiles) {
    if (fs.existsSync(file)) {
        success(`Found (optional): ${file}`);
    } else {
        info(`Optional: ${file} (build in WSL if needed)`);
    }
}

// Try to copy missing files from backup
if (missingFiles.length > 0 && fs.existsSync(backupDir)) {
    log('\n  Attempting to copy missing files from builds_backup...', 'yellow');

    for (const file of missingFiles) {
        const backupFile = path.join(backupDir, path.basename(file));
        if (fs.existsSync(backupFile)) {
            try {
                fs.copyFileSync(backupFile, file);
                success(`Copied from backup: ${path.basename(file)}`);
                copiedFromBackup.push(path.basename(file));
                // Remove from missing files list
                missingFiles = missingFiles.filter(f => f !== file);
            } catch (err) {
                error(`Failed to copy ${path.basename(file)} from backup: ${err.message}`);
            }
        }
    }
}

// Check if there are still missing files after attempting backup copy
if (missingFiles.length > 0) {
    error('\nSome required build files are still missing and not found in backup!');
    process.exit(1);
}
log('');

log('================================', 'cyan');
log(`✓ Successfully built v${version}!`, 'green');
log('  - All binaries created', 'white');
log('  - Installers ready', 'white');
log('  - Frontend embedded in GUI binaries', 'white');

// Show warning if files were copied from backup
if (copiedFromBackup.length > 0) {
    log('\n⚠️  WARNING:', 'red');
    log('The following files were copied from builds_backup:', 'red');
    copiedFromBackup.forEach(file => {
        log(`  - ${file}`, 'red');
    });
    log('These files were NOT rebuilt and may be outdated!', 'red');
}

log('\n📝 Note:', 'cyan');
log('  The GUI binaries contain embedded frontend assets.', 'white');
log('  Any UI changes require rebuilding the entire application.', 'white');

log('\nNext steps:', 'cyan');
log('  Run: npm run publish', 'white');
log('  Or manually test the builds in ./builds/', 'white');

