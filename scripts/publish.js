#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
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
    log('Usage: npm run publish 1.4.0', 'yellow');
    process.exit(1);
}

// Validate version format (X.Y.Z)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
}

log(`\nPublishing Transend v${version}`, 'cyan');
log('================================\n', 'cyan');

const buildsDir = path.join(__dirname, '..', 'builds');
const backupDir = path.join(__dirname, '..', 'builds_backup');

// Step 1: Clean existing builds (or backup if locked)
step(1, 10, 'Cleaning existing builds...');
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
step(2, 10, 'Building CLI binaries...');
log('  Building Windows CLI...', 'white');
if (!exec('go build -o builds/transend_cli_win.exe ./cmd/transend', 'Windows CLI build')) {
    process.exit(1);
}
success('Built Windows CLI');

log('  Building Linux CLI...', 'white');
process.env.GOOS = 'linux';
process.env.GOARCH = 'amd64';
if (!exec('go build -o builds/transend_cli_linux ./cmd/transend', 'Linux CLI build')) {
    process.exit(1);
}
delete process.env.GOOS;
delete process.env.GOARCH;
success('Built Linux CLI\n');

// Step 3: Install frontend dependencies
step(3, 10, 'Installing frontend dependencies...');
process.chdir(path.join(__dirname, '..', 'ui', 'frontend'));
if (!exec('npm install', 'Frontend npm install')) {
    error('Failed to install frontend dependencies');
    process.exit(1);
}
process.chdir(path.join(__dirname, '..'));
success('Frontend dependencies installed\n');

// Step 4: Build GUI applications (Windows only - Linux requires WSL)
step(4, 10, 'Building GUI applications...');
log('  Building Windows GUI installer...', 'white');
if (!exec('cd ui && wails build -platform windows/amd64 -nsis -o ../builds/transend_setup.exe', 'Windows GUI build')) {
    process.exit(1);
}
success('Built Windows GUI installer');

log('  Building Windows GUI executable...', 'white');
if (!exec('cd ui && wails build -platform windows/amd64 -o ../builds/transend_win.exe', 'Windows GUI build')) {
    process.exit(1);
}
success('Built Windows GUI\n');

info('Skipping Linux GUI build (requires WSL - build manually if needed)');
log('');

// Step 5: Verify all builds
step(5, 10, 'Verifying builds...');
const requiredFiles = [
    'builds/transend_win.exe',
    'builds/transend_setup.exe',
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

// Step 6: Update version file
step(6, 10, 'Updating version file...');
fs.writeFileSync('version', version);
success(`Updated version to ${version}\n`);

// Step 7: Update npm package
step(7, 10, 'Updating npm package...');
const npmPackageJsonPath = path.join(__dirname, '..', 'npm-package', 'package.json');
const npmPackageJson = JSON.parse(fs.readFileSync(npmPackageJsonPath, 'utf8'));
npmPackageJson.version = version;
fs.writeFileSync(npmPackageJsonPath, JSON.stringify(npmPackageJson, null, 2) + '\n');
success(`Updated npm-package/package.json to ${version}\n`);

// Step 8: Copy binaries to npm-package
step(8, 10, 'Copying binaries to npm package...');
const npmBinDir = path.join(__dirname, '..', 'npm-package', 'bin');
if (!fs.existsSync(npmBinDir)) {
    fs.mkdirSync(npmBinDir, { recursive: true });
}
fs.copyFileSync('builds/transend_cli_win.exe', path.join(npmBinDir, 'transend-win.exe'));
fs.copyFileSync('builds/transend_cli_linux', path.join(npmBinDir, 'transend-linux'));
success('Copied CLI binaries to npm-package/bin\n');

// Step 9: Git commit and tag
step(9, 10, 'Creating git tag...');
exec('git add .', 'Git add');
try {
    execSync(`git commit -m "Release v${version}"`, { stdio: 'inherit' });
} catch (err) {
    info('No changes to commit (or commit failed)');
}
if (!exec(`git tag -a v${version} -m "Release v${version}"`, 'Git tag')) {
    error('Failed to create git tag');
    process.exit(1);
}
success(`Created git tag v${version}`);

if (!exec('git push origin main', 'Git push')) {
    error('Failed to push to git');
    process.exit(1);
}
if (!exec(`git push origin v${version}`, 'Git push tag')) {
    error('Failed to push tag');
    process.exit(1);
}
success('Pushed to git\n');

// Step 10: Publish to npm
step(10, 10, 'Publishing to npm...');
process.chdir(path.join(__dirname, '..', 'npm-package'));
if (!exec('npm publish', 'NPM publish')) {
    error('Failed to publish to npm');
    process.exit(1);
}
success('Published to npm\n');

log('================================', 'cyan');
log(`✓ Successfully published v${version}!`, 'green');
log('  - Git tag pushed', 'white');
log('  - NPM package published', 'white');
log('  - GitHub release will be created automatically', 'white');
