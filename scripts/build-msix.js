const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { cargoBuild, releaseBinary } = require("./cargo");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  white: "\x1b[37m",
};

function log(message, color = "white") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command) {
  try {
    execSync(command, { stdio: "inherit" });
    return true;
  } catch (err) {
    log(`Command failed: ${command}`, "red");
    log(err.message, "red");
    return false;
  }
}

// Configuration
const APP_DISPLAY_NAME = "PeerHop";
const APP_IDENTITY_NAME = "Transender.PeerHop";
const PUBLISHER_DISPLAY_NAME = "Peerhop";
const CERT_SUBJECT = "CN=CBE90A45-8594-4076-AEDB-BD3B88F1C249";
const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.join(SCRIPT_DIR, "..");
const BUILDS_DIR = path.join(ROOT_DIR, "builds");
const DIST_DIR = path.join(ROOT_DIR, "ui", "build", "windows", "msix_dist");

const INPUT_EXE = path.join(BUILDS_DIR, "peerhop_win.exe");
const SHIM_EXE = releaseBinary("ShareShim");
const OUTPUT_MSIX = path.join(BUILDS_DIR, "peerhop_store.msix");
// Signing: by default the code-signing certificate with CERT_SUBJECT in the
// current user's certificate store (created by scripts/generate-test-cert.ps1).
// CI or other machines can instead set PEERHOP_SIGN_PFX (+ PEERHOP_SIGN_PASSWORD).
// No certificate or password lives in the repo. Store uploads are re-signed by
// Microsoft, so this signature only matters for local sideloading.
const SIGN_PFX = process.env.PEERHOP_SIGN_PFX;
const SIGN_PASSWORD = process.env.PEERHOP_SIGN_PASSWORD || "";

const SDK_PATH =
  "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64";
let makeAppxPath = "MakeAppx.exe";
let signToolPath = "SignTool.exe";

// Supported file types for share target and file association
// Add more extensions here as needed — no wildcards, must start with a dot
const SUPPORTED_FILE_TYPES = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".mp3",
  ".wav",
  ".aac",
  ".flac",
  ".pdf",
  ".txt",
  ".docx",
  ".xlsx",
  ".pptx",
  ".zip",
  ".rar",
  ".7z",
  // '.apk', '.exe',
];

function checkTools() {
  try {
    try {
      execSync("MakeAppx.exe /?", { stdio: "ignore" });
      execSync("SignTool.exe /?", { stdio: "ignore" });
      return true;
    } catch (e) {
      const explicitMakeAppx = path.join(SDK_PATH, "MakeAppx.exe");
      const explicitSignTool = path.join(SDK_PATH, "SignTool.exe");

      if (fs.existsSync(explicitMakeAppx) && fs.existsSync(explicitSignTool)) {
        log(`Found tools at ${SDK_PATH}`, "green");
        makeAppxPath = `"${explicitMakeAppx}"`;
        signToolPath = `"${explicitSignTool}"`;
        return true;
      }
      throw e;
    }
  } catch (e) {
    log(
      "Error: MakeAppx.exe or SignTool.exe not found in PATH or standard location.",
      "red",
    );
    log(`Checked PATH and ${SDK_PATH}`, "yellow");
    log(
      "Please install Windows SDK or Visual Studio with UWP tools.",
      "yellow",
    );
    return false;
  }
}

function generateFileTypeElements(indent) {
  return SUPPORTED_FILE_TYPES.map(
    (ext) => `${indent}<uap:FileType>${ext}</uap:FileType>`,
  ).join("\n");
}

function generateManifest(version) {
  const storeVersion = `${version}.0`;
  // const fileTypeElements6 = generateFileTypeElements('            ');  // 12 spaces
  const fileTypeElements8 = generateFileTypeElements("                "); // 16 spaces
  const manifestContent = `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap2="http://schemas.microsoft.com/appx/manifest/uap/windows10/2"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:uap7="http://schemas.microsoft.com/appx/manifest/uap/windows10/7"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:desktop2="http://schemas.microsoft.com/appx/manifest/desktop/windows10/2"
  xmlns:desktop3="http://schemas.microsoft.com/appx/manifest/desktop/windows10/3"
  xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
  xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
  xmlns:desktop7="http://schemas.microsoft.com/appx/manifest/desktop/windows10/7"
  IgnorableNamespaces="uap10 uap3 uap7 desktop desktop2 desktop3">

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
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us"/>
  </Resources>

  <Applications>
    <Application Id="App"
      Executable="PeerHop.exe"
      EntryPoint="Windows.FullTrustApplication"
      uap10:SupportsMultipleInstances="true">
      <uap:VisualElements
        DisplayName="${APP_DISPLAY_NAME}"
        Description="Fast local file transfer"
        BackgroundColor="white"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
      </uap:VisualElements>
      <Extensions>
        <!-- Share Target: activated when user shares files/text to PeerHop -->
        <uap:Extension Category="windows.shareTarget" Executable="ShareShim.exe" EntryPoint="Windows.FullTrustApplication">
          <uap:ShareTarget>
            <uap:SupportedFileTypes>
              <uap:SupportsAnyFileType/>
            </uap:SupportedFileTypes>
            <uap:DataFormat>StorageItems</uap:DataFormat>
            <uap:DataFormat>Text</uap:DataFormat>
            <uap:DataFormat>URI</uap:DataFormat>
          </uap:ShareTarget>
        </uap:Extension>

        <!-- File Type Association: adds "Send with PeerHop" to right-click context menu -->
        <uap:Extension Category="windows.fileTypeAssociation" Executable="ShareShim.exe" EntryPoint="Windows.FullTrustApplication">
          <uap:FileTypeAssociation Name="peerhop.send">
            <uap:SupportedFileTypes>
        ${fileTypeElements8}
            </uap:SupportedFileTypes>
            <uap2:SupportedVerbs>
              <uap3:Verb Id="open" MultiSelectModel="Player" Parameters='"%1"'>Send with PeerHop</uap3:Verb>
            </uap2:SupportedVerbs>
          </uap:FileTypeAssociation>
        </uap:Extension>      
      </Extensions>
    </Application>
  </Applications>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>`;

  return manifestContent;
}

function buildMSIX(version) {
  log("\nBuilding MSIX Package...", "cyan");

  // Build ShareShim (share-target / "Send with PeerHop" entry point)
  log("Building ShareShim...", "cyan");
  try {
    cargoBuild(["ShareShim"]);
  } catch {
    log("Error: cargo build of ShareShim failed.", "red");
    return false;
  }

  if (!fs.existsSync(INPUT_EXE)) {
    log(`Error: Input executable not found: ${INPUT_EXE}`, "red");
    return false;
  }

  if (!checkTools()) return false;

  // 1. Prepare Layout Directory
  log("Preparing layout directory...", "white");
  if (fs.existsSync(DIST_DIR))
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, "Assets"), { recursive: true });

  // Copy main executable
  fs.copyFileSync(INPUT_EXE, path.join(DIST_DIR, "PeerHop.exe"));

  // Copy ShareShim
  if (fs.existsSync(SHIM_EXE)) {
    fs.copyFileSync(SHIM_EXE, path.join(DIST_DIR, "ShareShim.exe"));
    log("Copied ShareShim.exe to layout", "green");
  } else {
    log(`Error: ShareShim.exe not found at ${SHIM_EXE}.`, "red");
    process.exit(1);
  }

  // Copy assets
  const sourceIcon = path.join(ROOT_DIR, "ui", "build", "appicon.png");
  const source150Icon = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon150x150.png",
  );
  const source44Icon = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon44x44.png",
  );
  const source44IconAlt44 = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon44x44.targetsize-44_altform-unplated.png",
  );
  const source44IconAlt256 = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon44x44.targetsize-256_altform-unplated.png",
  );
  const source44IconAlt48 = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon44x44.targetsize-48_altform-unplated.png",
  );
  const source44IconIco = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "appicon44x44.ico",
  );
  const sourceLogoUniversal = path.join(
    ROOT_DIR,
    "ui",
    "frontend",
    "src",
    "assets",
    "images",
    "logo-universal.png",
  );

  function copyIfExists(src, dest) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      return true;
    }
    log(
      `Warning: ${path.relative(ROOT_DIR, src)} not found; skipping ${path.relative(ROOT_DIR, dest)}`,
      "yellow",
    );
    return false;
  }

  if (!fs.existsSync(sourceIcon)) {
    log(
      "Error: appicon.png not found. Please build the frontend before packaging MSIX.",
      "red",
    );
    process.exit(1);
  }

  copyIfExists(sourceIcon, path.join(DIST_DIR, "Assets", "StoreLogo.png"));
  copyIfExists(
    source150Icon,
    path.join(DIST_DIR, "Assets", "Square150x150Logo.png"),
  );
  copyIfExists(
    source150Icon,
    path.join(DIST_DIR, "Assets", "Square150x150Logo.altform-unplated.png"),
  );
  copyIfExists(
    source150Icon,
    path.join(
      DIST_DIR,
      "Assets",
      "Square150x150Logo.scale-100.altform-unplated.png",
    ),
  );
  copyIfExists(
    source150Icon,
    path.join(
      DIST_DIR,
      "Assets",
      "Square150x150Logo.scale-125.altform-unplated.png",
    ),
  );
  copyIfExists(
    source150Icon,
    path.join(
      DIST_DIR,
      "Assets",
      "Square150x150Logo.scale-150.altform-unplated.png",
    ),
  );
  copyIfExists(
    source150Icon,
    path.join(
      DIST_DIR,
      "Assets",
      "Square150x150Logo.scale-200.altform-unplated.png",
    ),
  );
  copyIfExists(
    source44Icon,
    path.join(DIST_DIR, "Assets", "Square44x44Logo.png"),
  );
  copyIfExists(
    source44IconAlt44,
    path.join(DIST_DIR, "Assets", "Peerhop.altform-unplated.png"),
  );
  copyIfExists(
    source44IconAlt44,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.scale-100.altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconAlt44,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.scale-125.altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconAlt44,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.scale-150.altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconAlt44,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.scale-200.altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconAlt256,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.targetsize-256_altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconAlt48,
    path.join(
      DIST_DIR,
      "Assets",
      "Square44x44Logo.targetsize-48_altform-unplated.png",
    ),
  );
  copyIfExists(
    source44IconIco,
    path.join(DIST_DIR, "Assets", "Square44x44Logo.ico"),
  );
  copyIfExists(
    sourceLogoUniversal,
    path.join(DIST_DIR, "Assets", "LogoUniversal.png"),
  );

  // 2. Generate Manifest
  log("Generating AppxManifest.xml...", "white");
  const manifest = generateManifest(version);
  fs.writeFileSync(path.join(DIST_DIR, "AppxManifest.xml"), manifest);

  // 3. Pack MSIX
  log("Packing MSIX...", "white");
  if (fs.existsSync(OUTPUT_MSIX)) fs.unlinkSync(OUTPUT_MSIX);

  const packCmd = `${makeAppxPath} pack /d "${DIST_DIR}" /p "${OUTPUT_MSIX}"`;
  if (!exec(packCmd)) return false;

  // 4. Sign
  log("Signing MSIX...", "white");

  let signArgs;
  if (SIGN_PFX) {
    if (!fs.existsSync(SIGN_PFX)) {
      log(`Error: PEERHOP_SIGN_PFX points to a missing file: ${SIGN_PFX}`, "red");
      return false;
    }
    signArgs = `/f "${SIGN_PFX}"` + (SIGN_PASSWORD ? ` /p "${SIGN_PASSWORD}"` : "");
  } else {
    if (!hasStoreCert()) {
      log("No signing certificate in your certificate store. Creating one...", "yellow");
      const psCmd = `powershell -ExecutionPolicy Bypass -File "${path.join(SCRIPT_DIR, "generate-test-cert.ps1")}"`;
      execSync(psCmd, { stdio: "inherit" });
    }
    if (!hasStoreCert()) {
      log("Error: no code-signing certificate found for " + CERT_SUBJECT, "red");
      return false;
    }
    signArgs = `/s My /n "${CERT_SUBJECT.replace(/^CN=/, "")}"`;
  }

  const signCmd = `${signToolPath} sign /fd SHA256 /a ${signArgs} "${OUTPUT_MSIX}"`;
  if (!exec(signCmd)) return false;

  log(`\nSuccessfully created signed MSIX: ${OUTPUT_MSIX}`, "green");
  return true;
}

/** True when the current user's store holds a usable signing cert for CERT_SUBJECT. */
function hasStoreCert() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$s = New-Object Security.Cryptography.X509Certificates.X509Store('My','CurrentUser'); $s.Open('ReadOnly'); @($s.Certificates | Where-Object { $_.Subject -eq '${CERT_SUBJECT}' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) }).Count"`,
      { encoding: "utf8" },
    );
    return parseInt(out.trim(), 10) > 0;
  } catch {
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  let version = process.argv[2];
  const rootDir = path.join(__dirname, "..");

  if (version) {
    log(`Updating global version to ${version}...`, "cyan");
    try {
      execSync(`node ./scripts/update-version.js ${version}`, {
        stdio: "inherit",
        cwd: rootDir,
      });
    } catch (err) {
      log("Global version update failed", "red");
      process.exit(1);
    }
  } else {
    // Read from version file if no argument provided
    const versionFilePath = path.join(rootDir, "version");
    if (fs.existsSync(versionFilePath)) {
      version = fs.readFileSync(versionFilePath, "utf8").trim();
      log(`Using version from version file: ${version}`, "cyan");
    } else {
      log("Error: No version provided and version file missing.", "red");
      process.exit(1);
    }
  }

  if (!buildMSIX(version)) process.exit(1);
}

module.exports = { buildMSIX };
