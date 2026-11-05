const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { buildMSIX } = require("./build-msix");
const { buildFrontend, cargoBuild, copyBinary } = require("./cargo");

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

const version = process.argv[2];
if (!version) {
  log(
    "Version is required! Usage: node scripts/build-multi-lang.js 1.5.1",
    "red",
  );
  process.exit(1);
}

const ROOT_DIR = path.join(__dirname, "..");
const BUILDS_DIR = path.join(ROOT_DIR, "builds");
const LANGS_DIR = path.join(BUILDS_DIR, "langs");
const FRONTEND_DIR = path.join(ROOT_DIR, "ui", "frontend");

// Dynamically get languages from index.ts
function getLanguages() {
  try {
    const langsIndex = fs.readFileSync(
      path.join(FRONTEND_DIR, "src", "langs", "index.ts"),
      "utf8",
    );
    const langMatches = langsIndex.match(/code:\s*["']([^"']+)["']/g);
    if (langMatches) {
      return langMatches.map((m) => m.match(/["']([^"']+)["']/)[1]);
    }
  } catch (e) {
    console.error(
      "Warning: Could not parse languages from index.ts, defaulting to 'en'",
    );
  }
  return ["en"];
}

const languages = getLanguages();

async function build() {
  log(`\nStarting Multi-Language Build for v${version}`, "cyan");

  if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LANGS_DIR)) {
    fs.mkdirSync(LANGS_DIR, { recursive: true });
  }

  for (const lang of languages) {
    log(`Building for Language: ${lang.toUpperCase()}`, "cyan");
    log(`================================\n`, "white");

    // 1. Build frontend with the default language (embedded into the exe)
    log(`Building frontend for ${lang}...`, "yellow");
    const env = { VITE_DEFAULT_LANG: lang };
    buildFrontend(env);

    // 2. Build the GUI with the same default language
    log(`Building GUI for ${lang}...`, "yellow");
    cargoBuild(["PeerHop"], env);
    const outputName = `peerhop_win_${lang}.exe`;
    const destPath = copyBinary("PeerHop", path.join("builds", "langs", outputName));

    // 3. Build MSIX for this language
    log(`Building MSIX for ${lang}...`, "yellow");
    process.chdir(ROOT_DIR);

    // buildMSIX expects 'builds/peerhop_win.exe'. We must copy our localized one there.
    const targetExe = path.join(BUILDS_DIR, "peerhop_win.exe");
    log(`Using ${outputName} for MSIX...`, "white");
    fs.copyFileSync(destPath, targetExe);

    const successMSIX = buildMSIX(version);
    if (successMSIX) {
      const oldPath = path.join(BUILDS_DIR, "peerhop_store.msix");
      const newPath = path.join(LANGS_DIR, `peerhop_store_${lang}.msix`);
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);

      // Wait a bit for file handles to clear (avoids EBUSY)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        fs.renameSync(oldPath, newPath);
        log(`Successfully created: peerhop_store_${lang}.msix`, "green");
      } catch (renameErr) {
        log(
          `Initial rename failed: ${renameErr.message}. Retrying...`,
          "yellow",
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        fs.renameSync(oldPath, newPath);
        log(
          `Successfully created (after retry): peerhop_store_${lang}.msix`,
          "green",
        );
      }
    } else {
      log(`Failed to build MSIX for ${lang}`, "red");
    }

    log(`\nFinished build for ${lang}`, "green");
  }

  log(`\nAll languages built successfully!`, "cyan");
  log(`Check the 'builds/langs' folder for localized artifacts.`, "white");
}

build().catch((err) => {
  log(`Build failed: ${err.message}`, "red");
  process.exit(1);
});
