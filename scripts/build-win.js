#!/usr/bin/env node
// Build the Windows GUI (builds/peerhop_win.exe) with cargo.
const { execSync } = require("child_process");
const { buildFrontend, buildWindowsGui } = require("./cargo");

const colors = { reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m" };
function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function run(description, fn) {
  try {
    fn();
  } catch {
    log(`✗ ${description} failed`, "red");
    process.exit(1);
  }
}

const version = process.argv[2];
if (version) {
  log(`Updating global version to ${version}...`, "cyan");
  run("Update Version", () => execSync(`node ./scripts/update-version.js ${version}`, { stdio: "inherit" }));
}

log("Building frontend (embedded web UI)...", "cyan");
run("Frontend build", () => buildFrontend());

log("Building Windows binary with cargo...", "cyan");
run("Cargo Windows build", () => buildWindowsGui());

log("\n✓ Windows build completed: builds/peerhop_win.exe", "green");
