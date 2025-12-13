# Mobile UI Not Updating - Root Causes and Solutions

## Problem
After running `npm run build 2.12.0`, the mobile UI was not showing the latest code changes (e.g., missing the send text toggler button).

## Root Causes

### 1. Frontend Not Rebuilt Before Wails Build ✅ FIXED
**Issue:** The Wails binary embeds frontend assets at compile time using Go's `embed` directive. If the frontend isn't rebuilt before the Wails build, the binary contains stale UI code.

**Solution:** Updated `scripts/build-all.js` to add Step 3.7 that builds the frontend BEFORE building the Wails GUI applications.

### 2. Browser Caching ✅ FIXED
**Issue:** Even with a fresh binary, mobile browsers cache JavaScript and CSS files. When you scan the QR code and visit the URL, your phone's browser serves the cached old version instead of fetching the new code from the server.

**Solution:** Added cache-control headers in `pkg/server/unified_handler.go` to prevent browser caching:
```go
w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
w.Header().Set("Pragma", "no-cache")
w.Header().Set("Expires", "0")
```

## How to Test the Fix

### 1. Make a UI Change
Edit any mobile UI file, for example `ui/frontend/src/views/MobileUnified.tsx`

### 2. Build the Application
```bash
cd ui/frontend && npm run build
cd ../..
cd ui && wails build -platform windows/amd64
cp ui/build/bin/ui.exe builds/transend_win.exe
```

Or use the automated script:
```bash
npm run build 2.12.0
```

### 3. Test on Mobile
1. Run `builds/transend_win.exe`
2. Scan the QR code with your phone
3. **Important:** If you visited the URL before, you may need to:
   - **Hard refresh** the page (usually Ctrl+Shift+R or Cmd+Shift+R)
   - **Clear browser cache** for that site
   - **Use incognito/private mode** to bypass cache entirely

The cache-control headers will prevent future caching, but won't clear existing cache.

## Why This Happened

### Wails Embedding Process
```
Source Code (TypeScript/React)
        ↓
    npm run build
        ↓
    dist/ folder (compiled JS/CSS)
        ↓
    wails build (Go embed directive)
        ↓
    Binary with embedded dist/
```

If you skip the "npm run build" step or do it after "wails build", the binary contains an old version of dist/.

### Browser Caching Behavior
```
First Visit:
Browser → Server → Fresh UI → Cache it

Second Visit (without cache headers):
Browser → Check cache → Use cached UI (STALE!)

Second Visit (with cache headers):
Browser → Check cache → Headers say "no-cache" → Fetch fresh UI ✅
```

## Prevention

### For Development
Use `npm run dev` which runs the Wails dev server. This automatically reloads when you make changes.

### For Production Builds
Always use the build script which now ensures the correct order:
```bash
npm run build <version>
```

This script now:
1. Builds CLI binaries
2. Installs frontend dependencies
3. **Builds frontend** ← NEW STEP
4. Builds Wails GUI (embeds fresh frontend)
5. Verifies all builds

### For Mobile Testing
- Always do a hard refresh or use incognito mode when testing UI changes
- The cache-control headers will prevent caching going forward
- Consider adding a version number in the UI to verify which version is loaded

## Files Modified

1. **scripts/build-all.js**
   - Added Step 3.7: Build frontend before Wails build
   - Updated step counts from 5 to 6
   - Added build process overview
   - Added verification that dist folder exists and is not empty

2. **pkg/server/unified_handler.go**
   - Added cache-control headers to ServeHTTP method
   - Prevents browser caching of static assets
   - Ensures mobile browsers always fetch latest UI

## Summary

✅ **Build Script Fixed** - Frontend is now always rebuilt before Wails build  
✅ **Cache Headers Added** - Browsers won't cache the UI anymore  
✅ **Documentation Created** - Clear explanation of the issues and solutions  

**Next time you build, your mobile UI will always reflect the latest code!**
