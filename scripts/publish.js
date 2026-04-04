#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

function step(num, total, message) {
  log(`[${num}/${total}] ${message}`, "yellow");
}

function success(message) {
  log(`  ✓ ${message}`, "green");
}

function error(message) {
  log(`  ✗ ${message}`, "red");
}

function info(message) {
  log(`  ℹ ${message}`, "yellow");
}

function exec(command, description) {
  try {
    execSync(command, { stdio: "inherit" });
    return true;
  } catch (err) {
    error(`${description} failed`);
    return false;
  }
}

const readline = require("readline");

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

async function main() {
  // Get version from command line (optional - can read from version file)
  let version = process.argv[2];

  // If no version provided, try to read from version file
  if (!version) {
    const versionFilePath = path.join(__dirname, "..", "version");
    if (fs.existsSync(versionFilePath)) {
      version = fs.readFileSync(versionFilePath, "utf8").trim();
      info(`Using version from version file: ${version}`);
    } else {
      error("Version is required!");
      log("Usage: npm run publish [version]", "yellow");
      log("Or run prepublish first to create version file", "yellow");
      process.exit(1);
    }
  }

  // Validate version format (X.Y.Z)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    error("Invalid version format. Use semantic versioning (e.g., 1.0.0)");
    process.exit(1);
  }

  // Check current version in package.json
  const rootPackageJsonPath = path.join(__dirname, "..", "package.json");
  const rootPackageJson = JSON.parse(
    fs.readFileSync(rootPackageJsonPath, "utf8"),
  );
  const currentVersion = rootPackageJson.version;

  // Compare versions
  function compareVersions(v1, v2) {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
  }

  const versionComparison = compareVersions(version, currentVersion);
  if (versionComparison <= 0) {
    error(
      `New version (${version}) must be greater than current version (${currentVersion})`,
    );
    log("Please provide a higher version number", "yellow");
    process.exit(1);
  }

  info(`Version check passed: ${currentVersion} → ${version}`);

  log(`\nPublishing PeerHop v${version}`, "cyan");
  log("================================\n", "cyan");

  // Build check removed per request
  log("Skipping build file verification...", "yellow");
  success("Proceeding to publish operations\n");

  // Step 1: Update frontend versions
  step(1, 7, "Updating frontend versions...");
  const frontendVersionPath = path.join(
    __dirname,
    "..",
    "ui",
    "frontend",
    "src",
    "version.ts",
  );
  const frontendPackageJsonPath = path.join(
    __dirname,
    "..",
    "ui",
    "frontend",
    "package.json",
  );
  try {
    // 1. Update version.ts
    fs.writeFileSync(
      frontendVersionPath,
      `export const APP_VERSION = "${version}";\n`,
    );

    // 2. Update frontend package.json
    const frontendPackageJson = JSON.parse(
      fs.readFileSync(frontendPackageJsonPath, "utf8"),
    );
    frontendPackageJson.version = version;
    fs.writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify(frontendPackageJson, null, 2) + "\n",
    );

    success(`Updated frontend versions to ${version}\n`);
  } catch (err) {
    error(`Failed to update frontend versions: ${err.message}`);
  }

  // Step 2: Update root package.json
  step(2, 7, "Updating root package.json...");
  rootPackageJson.version = version;
  fs.writeFileSync(
    rootPackageJsonPath,
    JSON.stringify(rootPackageJson, null, 2) + "\n",
  );
  success(`Updated root package.json to ${version}\n`);

  // Step 3: Update version file
  step(3, 7, "Updating version file...");
  fs.writeFileSync("version", version);
  success(`Updated version to ${version}\n`);

  // Step 4: Update npm package
  step(4, 7, "Updating npm package...");
  const npmPackageJsonPath = path.join(
    __dirname,
    "..",
    "npm-package",
    "package.json",
  );
  const npmPackageJson = JSON.parse(
    fs.readFileSync(npmPackageJsonPath, "utf8"),
  );
  npmPackageJson.version = version;
  fs.writeFileSync(
    npmPackageJsonPath,
    JSON.stringify(npmPackageJson, null, 2) + "\n",
  );
  success(`Updated npm-package/package.json to ${version}\n`);

  // Step 5: Copy binaries to npm-package
  step(5, 7, "Copying binaries to npm package...");
  const npmBinDir = path.join(__dirname, "..", "npm-package", "bin");
  if (!fs.existsSync(npmBinDir)) {
    fs.mkdirSync(npmBinDir, { recursive: true });
  }

  if (fs.existsSync("builds/peerhop_cli_win.exe")) {
    fs.copyFileSync(
      "builds/peerhop_cli_win.exe",
      path.join(npmBinDir, "peerhop-win.exe"),
    );
  } else {
    log("Warning: builds/peerhop_cli_win.exe missing, skipping npm copy.", "yellow");
  }

  if (fs.existsSync("builds/peerhop_cli_linux")) {
    fs.copyFileSync(
      "builds/peerhop_cli_linux",
      path.join(npmBinDir, "peerhop-linux"),
    );
  } else {
    log("Warning: builds/peerhop_cli_linux missing, skipping npm copy.", "yellow");
  }
  
  success("Finished copying available CLI binaries to npm-package/bin\n");

  // Step 6: Create Github Release and Upload Assets
  step(6, 7, "Publishing to GitHub Releases...");

  // Check if gh CLI is installed
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch (e) {
    error("GitHub CLI (gh) is not installed or not in PATH.");
    log("Please install it: https://cli.github.com/", "yellow");
    process.exit(1);
  }

  const releaseRepo = "ashrafbinahmad/PeerHop-releases";

  // Get all files in builds/ to upload (excluding debug symbols)
  const buildsDir = path.join(__dirname, "..", "builds");
  const allBuildFiles = fs
    .readdirSync(buildsDir)
    .filter(
      (file) =>
        !file.endsWith(".wixpdb") &&
        !file.endsWith("mount_info") &&
        fs.statSync(path.join(buildsDir, file)).isFile(),
    )
    .map((file) => `builds/${file}`);

  const filesToUpload = allBuildFiles.join(" ");

  // Create release and upload files using gh CLI
  // We use the --repo flag to target the specific release repository
  // We create the tag in that repo.
  const cmd = `gh release create v${version} ${filesToUpload} --repo ${releaseRepo} --title "v${version}" --notes "Release v${version}"`;

  info(`Uploading binaries to ${releaseRepo}...`);
  if (!exec(cmd, "GitHub Release Creation")) {
    error("Failed to create GitHub release");
    process.exit(1);
  }
  success(`Published release v${version} to GitHub\n`);

  // We still push the tag to the source repo for version tracking, but without triggering the old workflow
  step("6.5", 7, "Tagging source repository...");
  exec("git add .", "Git add");
  try {
    execSync(`git commit -m "Release v${version}"`, { stdio: "inherit" });
  } catch (err) {}

  if (exec(`git tag -a v${version} -m "Release v${version}"`, "Git tag")) {
    exec("git push origin main", "Git push");
    exec(`git push origin v${version}`, "Git push tag");
    success("Source repository tagged");
  }

  // Step 6: Publish to npm
  const answer = await askQuestion(
    `${colors.yellow}Do you want to publish PeerHop v${version} to npm? (y/N): ${colors.reset}`,
  );
  const shouldPublish =
    answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";

  if (shouldPublish) {
    step(7, 7, "Publishing to npm...");
    process.chdir(path.join(__dirname, "..", "npm-package"));
    if (!exec("npm publish", "NPM publish")) {
      error("Failed to publish to npm");
      process.exit(1);
    }
    success("Published to npm\n");
  } else {
    info("Step 6 skipped: NPM publish\n");
  }

  log("================================", "cyan");
  log(`✓ Process completed for v${version}!`, "green");
  log("  - Git tag pushed", "white");
  if (shouldPublish) {
    log("  - NPM package published", "white");
  } else {
    log("  - NPM package skipped", "yellow");
  }
  log("  - GitHub release created and assets uploaded", "white");
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
