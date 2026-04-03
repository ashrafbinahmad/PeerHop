# Testing the Mobile Chat UI

## How to Access the Mobile View

The mobile view (`MobileUnified.tsx`) is automatically shown when you access the application through the QR code on your mobile device. Here's how it works:

### Desktop View

- Accessed directly at `http://localhost:5173` (or when running the Wails app)
- Shows the split-panel interface with chat on left, QR code on right
- `/api/meta` endpoint returns `null` (no metadata)

### Mobile View

- Accessed by scanning the QR code from your mobile device
- The QR code contains a URL like `http://192.168.x.x:PORT`
- When accessed, the server's `/api/meta` endpoint returns:
  ```json
  {
    "mode": "download",
    "filename": "example.pdf",
    "size": 12345
  }
  ```
  OR
  ```json
  {
    "mode": "upload"
  }
  ```

## What You Should See on Mobile

### Visual Appearance:

1. **Purple Gradient Background** - Linear gradient from `#667eea` to `#764ba2`
2. **Header** - "💬 File Transfer Chat" with glassmorphic effect
3. **Chat Area** - Scrollable message list showing:
   - Sent messages (files uploaded to desktop)
   - Received messages (files downloaded from desktop)
   - Empty state if no transfers yet
4. **Bottom Buttons**:
   - **Receive Files** (if desktop has files to share)
   - **Send Files** (always available)

### Features:

- ✅ Message bubbles with timestamps
- ✅ File icons and names
- ✅ Status indicators (✓ for success, ✗ for failure)
- ✅ Upload progress bar during file transfer
- ✅ Auto-scroll to latest message
- ✅ File counter showing selected files

## Troubleshooting

### If you're NOT seeing the mobile chat UI:

1. **Check the URL**
   - Make sure you're accessing via the QR code URL
   - The URL should be something like `http://192.168.1.x:8080`
   - NOT `http://localhost:5173`

2. **Check Browser Console**
   - Open mobile browser dev tools (if available)
   - Look for errors in the console
   - Check if `/api/meta` is being called

3. **Check Network**
   - Ensure mobile and desktop are on the same WiFi network
   - Try accessing the URL directly in mobile browser

4. **Clear Cache**
   - Clear browser cache on mobile
   - Do a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

5. **Check Server**
   - Ensure the Go backend server is running
   - Check if files are selected on desktop (for download mode)

## Testing Steps

### Test Upload (Mobile → Desktop):

1. Scan QR code on mobile
2. You should see the purple gradient chat UI
3. Click "Send Files" button
4. Select files from your mobile device
5. Click "Send Files" again (or it auto-sends)
6. Watch the upload progress
7. File should appear as a "sent" message bubble
8. Check desktop - file should be saved

### Test Download (Desktop → Mobile):

1. On desktop, click "Send Files" and select files
2. QR code updates with the file info
3. Scan QR code on mobile
4. You should see "Receive Files" button
5. Click it to download
6. File should appear as a "received" message bubble

## Component Structure

```
App.tsx
├── Checks /api/meta endpoint
├── If meta exists → MobileUnified (Mobile View)
└── If meta is null → DesktopView (Desktop View)

MobileUnified.tsx
├── Header (💬 File Transfer Chat)
├── Messages Area
│   ├── Empty State (if no messages)
│   ├── Message Bubbles (sent/received)
│   └── Upload Progress (during transfer)
└── Input Area
    ├── Receive Files Button (if downloadFilename exists)
    └── Send Files Button (always)
```

## Expected Behavior

| Action                       | Desktop                           | Mobile                                    |
| ---------------------------- | --------------------------------- | ----------------------------------------- |
| Select files on desktop      | Shows "Ready to Send" + QR        | -                                         |
| Scan QR (download mode)      | -                                 | Shows chat UI with "Receive Files" button |
| Click "Receive Files"        | -                                 | Downloads file, adds to chat              |
| Click "Send Files" on mobile | -                                 | Opens file picker                         |
| Upload files from mobile     | Receives files, saves locally     | Shows progress, then success message      |
| View chat history            | Shows all transfers in left panel | Shows all transfers in main area          |

## Key Differences: Desktop vs Mobile

| Feature    | Desktop                     | Mobile           |
| ---------- | --------------------------- | ---------------- |
| Background | Dark slate (#0f172a)        | Purple gradient  |
| Layout     | Split panel (chat + QR)     | Full-screen chat |
| Styling    | Tailwind classes            | Inline styles    |
| QR Code    | Always visible (right side) | Not shown        |
| Buttons    | Bottom of left panel        | Bottom of screen |
| Messages   | Left panel only             | Full screen      |

## If Still Not Working

1. Check `f:\transender\pkg\server\unified_handler.go` - ensure `/api/meta` is working
2. Verify the frontend is built: `cd ui && npm run build`
3. Check if the embedded dist files are up to date
4. Try accessing the mobile URL directly in a desktop browser to see if it shows the purple gradient
5. Check if axios is installed: `cd ui/frontend && npm list axios`
