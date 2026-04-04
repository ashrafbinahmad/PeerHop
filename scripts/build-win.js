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

function exec(command, description) {
  try {
    execSync(command, { stdio: "inherit" });
    return true;
  } catch (err) {
    log(`✗ ${description} failed`, "red");
    return false;
  }
}

async function main() {
  const version = process.argv[2];
  const rootDir = path.join(__dirname, "..");

  if (version) {
    log(`Updating global version to ${version}...`, "cyan");
    if (!exec(`node ./scripts/update-version.js ${version}`, "Update Version")) {
      process.exit(1);
    }
  }

  log("Starting prebuild:frontend...", "cyan");
  if (!exec("npm run prebuild:frontend", "Prebuild Frontend")) {
    process.exit(1);
  }

  log("Building Windows binary with Wails...", "cyan");
  const buildFlags = version ? `-ldflags "-X main.version=${version}"` : "";
  const buildCmd = `cd ui && wails build -clean -platform windows/amd64 ${buildFlags} -o ../../../builds/peerhop_win.exe`;
  
  if (!exec(buildCmd, "Wails Windows Build")) {
    process.exit(1);
  }

  log("\n✓ Windows build completed successfully!", "green");
}

main().catch((err) => {
  log(`Unexpected error: ${err.message}`, "red");
  process.exit(1);
});
