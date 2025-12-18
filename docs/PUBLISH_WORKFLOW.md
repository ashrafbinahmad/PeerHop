# Publishing Workflow

## Overview

The publishing process is now split into two separate steps for better control:

1. **Prepublish** - Build all binaries and installers
2. **Publish** - Commit to git and publish to npm

## Commands

### Build Only (Prepublish)

Build all binaries without publishing to git/npm:

```bash
npm run prepublish 1.5.2
```

**What it does:**

- Cleans build directory
- Builds CLI binaries (Windows & Linux)
- Installs frontend dependencies
- Updates MSI version in product.wxs
- Cleans cached icon files
- Builds GUI applications (NSIS, MSI, EXE)
- Verifies all builds

**Use this when:**

- You want to test builds locally before publishing
- You need to make manual changes before releasing
- You're debugging the build process

### Publish Only

Publish existing builds to git and npm:

```bash
npm run publish [version]
```

**What it does:**

- Verifies build files exist
- Updates version file
- Updates npm-package/package.json
- Copies binaries to npm-package
- Creates git commit and tag
- Pushes to git
- Publishes to npm

**Use this when:**

- You've already run `prepublish`
- You've tested the builds and are ready to release
- Version parameter is optional (reads from version file if not provided)

### Full Release (Combined)

Build and publish in one command:

```bash
npm run release 1.5.2
```

**What it does:**

- Runs prepublish with the specified version
- Then runs publish automatically

**Use this when:**

- You want the complete build + publish flow
- You're confident the build will succeed
- You want to release immediately

## Workflow Examples

### Example 1: Careful Release (Recommended)

```bash
# Step 1: Build everything
npm run prepublish 1.5.2

# Step 2: Test the builds manually
./builds/peerhop_win.exe
./builds/peerhop_setup.msi

# Step 3: If tests pass, publish
npm run publish
```

### Example 2: Quick Release

```bash
npm run release 1.5.2
```

### Example 3: Update Icon or Files Then Publish

```bash
# Step 1: Build with old icon
npm run prepublish 1.5.2

# Step 2: Replace icon
cp new_icon.png ui/build/appicon.png

# Step 3: Rebuild to apply new icon
npm run prepublish 1.5.2

# Step 4: Test and publish
npm run publish
```

## Additional Commands

### Update Version Numbers Only

```bash
npm run version:update 1.5.2
```

Updates version in all config files without building.

### Check Build Status

```bash
npm run check:release
```

Verifies all required build files exist.

## Files Created by Prepublish

- `builds/peerhop_win.exe` - Windows GUI executable
- `builds/peerhop_setup.exe` - NSIS installer
- `builds/peerhop_setup.msi` - MSI installer
- `builds/peerhop_cli_win.exe` - Windows CLI
- `builds/peerhop_cli_linux` - Linux CLI
- `builds/peerhop_linux` - Linux GUI (optional, requires WSL)

## Notes

- The `prepublish` script updates the MSI version automatically
- Icon cache is cleared automatically to use updated appicon.png
- Version info is embedded in all binaries via ldflags
- The `publish` script can read version from the version file if not provided
