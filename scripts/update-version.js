#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Get version from command line
const version = process.argv[2];

if (!version) {
    console.error('❌ Version is required!');
    console.log('Usage: node update-version.js 1.5.1');
    process.exit(1);
}

// Validate version format (X.Y.Z)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
}

console.log(`\n🔄 Updating version to ${version}...\n`);

const rootDir = path.join(__dirname, '..');

// 1. Update MSI product.wxs
const productWxsPath = path.join(rootDir, 'ui', 'build', 'windows', 'msi', 'product.wxs');
try {
    let productWxs = fs.readFileSync(productWxsPath, 'utf8');
    productWxs = productWxs.replace(/Version="[^"]*"/, `Version="${version}"`);
    fs.writeFileSync(productWxsPath, productWxs);
    console.log('✓ Updated MSI product.wxs');
} catch (err) {
    console.error(`❌ Failed to update MSI product.wxs: ${err.message}`);
}

// 2. Update root package.json
const rootPackageJsonPath = path.join(rootDir, 'package.json');
try {
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
    rootPackageJson.version = version;
    fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + '\n');
    console.log('✓ Updated root package.json');
} catch (err) {
    console.error(`❌ Failed to update root package.json: ${err.message}`);
}

// 3. Update npm-package/package.json
const npmPackageJsonPath = path.join(rootDir, 'npm-package', 'package.json');
try {
    const npmPackageJson = JSON.parse(fs.readFileSync(npmPackageJsonPath, 'utf8'));
    npmPackageJson.version = version;
    fs.writeFileSync(npmPackageJsonPath, JSON.stringify(npmPackageJson, null, 2) + '\n');
    console.log('✓ Updated npm-package/package.json');
} catch (err) {
    console.error(`❌ Failed to update npm-package/package.json: ${err.message}`);
}

// 4. Update version file
const versionFilePath = path.join(rootDir, 'version');
try {
    fs.writeFileSync(versionFilePath, version);
    console.log('✓ Updated version file');
} catch (err) {
    console.error(`❌ Failed to update version file: ${err.message}`);
}

console.log(`\n✅ Version updated to ${version} in all configuration files!\n`);
