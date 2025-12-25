const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function exec(command) {
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (err) {
    log(`Command failed: ${command}`, 'red');
    log(err.message, 'red');
    return false;
  }
}

// Configuration
const APP_DISPLAY_NAME = "PeerHop";
const APP_IDENTITY_NAME = "Transender.PeerHop"; // From Partner Center
const PUBLISHER_DISPLAY_NAME = "Peerhop"; // Change this to your actual publisher name if you buy a cert
const CERT_SUBJECT = "CN=CBE90A45-8594-4076-AEDB-BD3B88F1C249"; // From Partner Center
const CERT_PASSWORD = "PeerHop123"; // Logic should probably accept this via env var
const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.join(SCRIPT_DIR, '..');
const BUILDS_DIR = path.join(ROOT_DIR, 'builds');
const DIST_DIR = path.join(ROOT_DIR, 'ui', 'build', 'windows', 'msix_dist'); // Temp layout dir

// Input executable
const INPUT_EXE = path.join(BUILDS_DIR, 'peerhop_win.exe');
const OUTPUT_MSIX = path.join(BUILDS_DIR, 'peerhop_store.msix');
const CERT_PATH = path.join(SCRIPT_DIR, 'PeerHop_SelfSigned.pfx');

// Check tools
const SDK_PATH = "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64";
let makeAppxPath = "MakeAppx.exe";
let signToolPath = "SignTool.exe";

function checkTools() {
  try {
    // Try global path first
    try {
      execSync('MakeAppx.exe /?', { stdio: 'ignore' });
      execSync('SignTool.exe /?', { stdio: 'ignore' });
      return true;
    } catch (e) {
      // Try explicit path
      const explicitMakeAppx = path.join(SDK_PATH, 'MakeAppx.exe');
      const explicitSignTool = path.join(SDK_PATH, 'SignTool.exe');

      if (fs.existsSync(explicitMakeAppx) && fs.existsSync(explicitSignTool)) {
        log(`Found tools at ${SDK_PATH}`, 'green');
        makeAppxPath = `"${explicitMakeAppx}"`;
        signToolPath = `"${explicitSignTool}"`;
        return true;
      }
      throw e;
    }
  } catch (e) {
    log('Error: MakeAppx.exe or SignTool.exe not found in PATH or standard location.', 'red');
    log(`Checked PATH and ${SDK_PATH}`, 'yellow');
    log('Please install Windows SDK or Visual Studio with UWP tools.', 'yellow');
    return false;
  }
}

function generateManifest(version) {
  // MSIX requires version in X.Y.Z.0 format
  const storeVersion = `${version}.0`;

  const manifestContent = `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">

  <Identity
    Name="${APP_IDENTITY_NAME}"
    Version="${storeVersion}"
    Publisher="${CERT_SUBJECT}"
    ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>${APP_DISPLAY_NAME}</DisplayName>
    <PublisherDisplayName>${PUBLISHER_DISPLAY_NAME}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.19041.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us"/>
  </Resources>

  <Applications>
    <Application Id="App"
      Executable="PeerHop.exe"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${APP_DISPLAY_NAME}"
        Description="Fast local file transfer"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
      </uap:VisualElements>
    </Application>
  </Applications>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>`;

  return manifestContent;
}

function buildMSIX(version) {
  log('\nBuilding MSIX Package...', 'cyan');

  if (!fs.existsSync(INPUT_EXE)) {
    log(`Error: Input executable not found: ${INPUT_EXE}`, 'red');
    return false;
  }

  if (!checkTools()) return false;

  // 1. Prepare Layout Directory
  log('Preparing layout directory...', 'white');
  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, 'Assets'), { recursive: true });

  // Copy Executable
  fs.copyFileSync(INPUT_EXE, path.join(DIST_DIR, 'PeerHop.exe'));

  // Create Dummy Assets (Use real ones if available in assets folder)
  // For now, we'll try to find them or warn.
  // TODO: Generate or copy real assets. For this script to work out of box, we need files.
  // We will assume they exist or copy the appicon.png as placeholder.
  const sourceIcon = path.join(ROOT_DIR, 'ui', 'build', 'appicon.png');
  if (fs.existsSync(sourceIcon)) {
    fs.copyFileSync(sourceIcon, path.join(DIST_DIR, 'Assets', 'StoreLogo.png'));
    fs.copyFileSync(sourceIcon, path.join(DIST_DIR, 'Assets', 'Square150x150Logo.png'));
    fs.copyFileSync(sourceIcon, path.join(DIST_DIR, 'Assets', 'Square44x44Logo.png'));
  } else {
    log('Warning: appicon.png not found. Creating empty placeholders.', 'yellow');
    fs.writeFileSync(path.join(DIST_DIR, 'Assets', 'StoreLogo.png'), '');
    fs.writeFileSync(path.join(DIST_DIR, 'Assets', 'Square150x150Logo.png'), '');
    fs.writeFileSync(path.join(DIST_DIR, 'Assets', 'Square44x44Logo.png'), '');
  }

  // 2. Generate Manifest
  log('Generating AppxManifest.xml...', 'white');
  const manifest = generateManifest(version);
  fs.writeFileSync(path.join(DIST_DIR, 'AppxManifest.xml'), manifest);

  // 3. MakeAppx
  log('Packing MSIX...', 'white');
  if (fs.existsSync(OUTPUT_MSIX)) fs.unlinkSync(OUTPUT_MSIX);

  const packCmd = `${makeAppxPath} pack /d "${DIST_DIR}" /p "${OUTPUT_MSIX}"`;
  if (!exec(packCmd)) return false;

  // 4. Sign
  log('Signing MSIX...', 'white');

  // Check if we need to generate cert
  if (!fs.existsSync(CERT_PATH)) {
    log('Certificate not found. Generating self-signed cert...', 'yellow');
    // Execute powershell script
    const psCmd = `powershell -ExecutionPolicy Bypass -File "${path.join(SCRIPT_DIR, 'generate-test-cert.ps1')}"`;
    execSync(psCmd, { stdio: 'inherit' });
  }

  if (!fs.existsSync(CERT_PATH)) {
    log('Error: Certificate missing even after generation attempt.', 'red');
    return false;
  }

  const signCmd = `${signToolPath} sign /fd SHA256 /a /f "${CERT_PATH}" /p "${CERT_PASSWORD}" "${OUTPUT_MSIX}"`;
  if (!exec(signCmd)) return false;

  log(`\nSuccessfully created signed MSIX: ${OUTPUT_MSIX}`, 'green');
  return true;
}

// Run if called directly
if (require.main === module) {
  const version = process.argv[2];
  if (!version) {
    log('Please provide version argument', 'red');
    process.exit(1);
  }
  buildMSIX(version);
}

module.exports = { buildMSIX };
