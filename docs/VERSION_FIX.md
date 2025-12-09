# Version and Icon Fix for Installers

## Problem
1. **Version Issue**: The MSI and NSIS installers were always showing version 1.0.0 regardless of the version specified during the publish process.
2. **Icon Issue**: When replacing the `appicon.png` file, the new icon wasn't appearing in the installers because Wails cached the generated `.ico` files.

## Root Causes

### Version
The version number was hardcoded in the `ui/build/windows/msi/product.wxs` file (line 6):
```xml
<Package Name="Transend"
         Version="1.0.0"
         ...
```

### Icon
Wails generates Windows icon files (`icon.ico`, `_icon.ico`) from `appicon.png` and caches them in:
- `ui/build/windows/icon.ico`
- `ui/build/windows/_icon.ico`
- `ui/build/_appicon.png`

During builds, if these cached files exist, Wails doesn't regenerate them from the updated `appicon.png`.

## Solution

### 1. Updated Publish Script (`scripts/publish.js`)
- **Added Step 3.5**: Automatically updates the MSI `product.wxs` version before building
- **Added Step 3.6**: Cleans cached icon files (`.ico` and `_appicon.png`) to force regeneration from the source `appicon.png`
- **Modified Step 4**: Changed build commands to:
  - Use `wails build` directly with `-ldflags` to pass version information
  - Ensure version metadata is embedded in all binaries
  - Generate fresh icon files from updated `appicon.png`

### 2. Created Version Update Utility (`scripts/update-version.js`)
A standalone script to update version numbers across all configuration files:
- MSI `product.wxs`
- Root `package.json`
- `npm-package/package.json`
- `version` file

### 3. Added Version Update Script
Added `version:update` script to `package.json` for manual version updates:
```bash
npm run version:update 1.5.2
```

## Usage

### Publishing a New Version
Simply run:
```bash
npm run publish 1.5.2
```

The publish script will now:
1. Update all version numbers in configuration files
2. Build binaries with correct version metadata
3. Create installers with the correct version

### Manually Updating Version
To update version numbers without publishing:
```bash
npm run version:update 1.5.2
```

### Updating the App Icon
To update the application icon:
1. Replace `ui/build/appicon.png` with your new icon (must be PNG format, recommended 512x512px)
2. Run the publish script - it will automatically:
   - Delete cached `.ico` files
   - Regenerate icon files from your new `appicon.png`
   - Include the new icon in all installers

**For dev mode**, if the icon doesn't update:
```bash
cd ui
wails dev -clean
```
This clears all caches and forces icon regeneration.


## Files Modified
1. `scripts/publish.js` - Added version update logic
2. `scripts/update-version.js` - New utility script
3. `package.json` - Added `version:update` script

## Verification
After the next publish, the MSI installer will show the correct version in:
- Windows Add/Remove Programs
- Installer version information
- File properties of the installer
