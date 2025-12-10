# Unified QR Code Implementation

## Overview
The application now features a **persistent QR code** that's always visible on the desktop view. Both desktop and mobile users can use the same QR code to **send and receive** files.

## What Changed

### 1. **Backend - Unified Server Handler** (`pkg/server/unified_handler.go`)
- Created a new `UnifiedHandler` that supports both upload and download modes
- The handler dynamically switches between modes based on whether files are selected
- Thread-safe file path management with mutex locks
- Single `/api/meta` endpoint returns current mode (upload/download)

### 2. **Backend - Persistent Server** (`ui/app.go`)
- Server now starts on application startup (not when files are selected)
- Server runs throughout the application lifetime on a fixed port
- `GetServerInfo()` - New function to get the QR code URL
- `StartTransfer()` - Updated to set file path in unified handler (doesn't restart server)
- `ClearTransfer()` - New function to clear files and return to upload mode

### 3. **Desktop View** (`ui/frontend/src/views/DesktopView.tsx`)
- QR code is **always visible** on the right side
- Fetches server info on component mount
- Dynamic text based on current state:
  - **📥 Ready to Receive** - When no files selected (mobile can upload)
  - **📤 Ready to Send** - When files selected (mobile can download)
- Shows filename when files are ready to send

### 4. **Mobile Unified View** (`ui/frontend/src/views/MobileUnified.tsx`)
- Replaced separate MobileUpload and MobileDownload components
- Single interface with mode selection:
  - **Receive from Computer** - Download files sent from desktop
  - **Send to Computer** - Upload files to desktop
- Back button to return to mode selection
- Smooth transitions between states

### 5. **App Router** (`ui/frontend/src/App.tsx`)
- Simplified to use `MobileUnified` component
- Automatically detects if running on mobile (via `/api/meta` endpoint)
- Shows appropriate interface (Desktop vs Mobile)

### 6. **Styling** (`ui/frontend/src/App.css`)
- Added `.btn-secondary` for secondary button styling
- Added `.back-button` for navigation
- Enhanced card positioning for back button support

## How It Works

### Desktop User Flow:
1. **Application starts** → Server starts automatically with QR code visible
2. **State: Ready to Receive** → QR shows "📥 Ready to Receive"
   - Mobile users can scan and upload files
3. **User selects files** → State changes to "Ready to Send"
   - QR now shows "📤 Ready to Send: filename.zip"
   - Mobile users can scan and download the file
4. **Transfer complete** → Can clear selection or select new files

### Mobile User Flow:
1. **Scan QR code** → Opens mobile web interface
2. **Choose action:**
   - **📥 Receive from Computer** - Download files if desktop has files ready
   - **📤 Send to Computer** - Upload files to desktop
3. **Complete transfer** → Success screen with option to do more

## Benefits

✅ **Single QR Code** - No need to generate new QR codes when switching between send/receive
✅ **Bi-directional** - Both desktop and mobile can initiate transfers
✅ **Always Ready** - Server is always running, ready for connections
✅ **Intuitive UI** - Clear visual indicators of current mode
✅ **Seamless Experience** - No need to restart or reconfigure

## Technical Details

### API Endpoints:
- `GET /api/meta` - Returns current mode and file info
- `POST /api/upload` - Upload files to desktop
- `GET /api/download` - Download files from desktop

### State Management:
- Backend maintains current file path
- Frontend polls or checks meta endpoint for current state
- Unified handler switches behavior based on file availability

## Next Steps

To test the implementation:
1. Run `npm run dev:ui` (already running)
2. Open the desktop app
3. QR code should appear immediately showing "Ready to Receive"
4. Select files → QR text changes to "Ready to Send"
5. Scan QR with mobile → See both send/receive options
