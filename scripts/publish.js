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

// Get version from command line (optional - can read from version file)
let version = process.argv[2];

// If no version provided, try to read from version file
if (!version) {
    const versionFilePath = path.join(__dirname, '..', 'version');
    if (fs.existsSync(versionFilePath)) {
        version = fs.readFileSync(versionFilePath, 'utf8').trim();
        info(`Using version from version file: ${version}`);
    } else {
        error('Version is required!');
        log('Usage: npm run publish [version]', 'yellow');
        log('Or run prepublish first to create version file', 'yellow');
        process.exit(1);
    }
}

// Validate version format (X.Y.Z)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
}

// Check current version in package.json
const rootPackageJsonPath = path.join(__dirname, '..', 'package.json');
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
const currentVersion = rootPackageJson.version;

// Compare versions
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (parts1[i] > parts2[i]) return 1;
        if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
}

const versionComparison = compareVersions(version, currentVersion);
if (versionComparison <= 0) {
    error(`New version (${version}) must be greater than current version (${currentVersion})`);
    log('Please provide a higher version number', 'yellow');
    process.exit(1);
}

info(`Version check passed: ${currentVersion} → ${version}`);

log(`\nPublishing Transend v${version}`, 'cyan');
log('================================\n', 'cyan');

// Verify builds exist
const requiredFiles = [
    'builds/transend_win.exe',
    'builds/transend_setup.exe',
    'builds/transend_setup.msi',
    'builds/transend_cli_win.exe',
    'builds/transend_cli_linux'
];

log('Checking for build files...', 'yellow');
let allPresent = true;
for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
        error(`Missing: ${file}`);
        allPresent = false;
    }
}

if (!allPresent) {
    error('\nBuild files are missing!');
    log('Please run: npm run prepublish <version>', 'yellow');
    process.exit(1);
}
success('All build files present\n');

// Step 1: Update root package.json
step(1, 6, 'Updating root package.json...');
rootPackageJson.version = version;
fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + '\n');
success(`Updated root package.json to ${version}\n`);

// Step 2: Update version file
step(2, 6, 'Updating version file...');
fs.writeFileSync('version', version);
success(`Updated version to ${version}\n`);

// Step 3: Update npm package
step(3, 6, 'Updating npm package...');
const npmPackageJsonPath = path.join(__dirname, '..', 'npm-package', 'package.json');
const npmPackageJson = JSON.parse(fs.readFileSync(npmPackageJsonPath, 'utf8'));
npmPackageJson.version = version;
fs.writeFileSync(npmPackageJsonPath, JSON.stringify(npmPackageJson, null, 2) + '\n');
success(`Updated npm-package/package.json to ${version}\n`);

// Step 4: Copy binaries to npm-package
step(4, 6, 'Copying binaries to npm package...');
const npmBinDir = path.join(__dirname, '..', 'npm-package', 'bin');
if (!fs.existsSync(npmBinDir)) {
    fs.mkdirSync(npmBinDir, { recursive: true });
}
fs.copyFileSync('builds/transend_cli_win.exe', path.join(npmBinDir, 'transend-win.exe'));
fs.copyFileSync('builds/transend_cli_linux', path.join(npmBinDir, 'transend-linux'));
success('Copied CLI binaries to npm-package/bin\n');

// Step 5: Git commit and tag
step(5, 6, 'Creating git tag...');
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

// Step 6: Publish to npm
step(6, 6, 'Publishing to npm...');
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
