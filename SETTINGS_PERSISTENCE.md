# Settings Persistence Implementation

## Overview

Implemented persistent settings storage to ensure all user preferences are saved to disk and restored when the server restarts.

## Changes Made

### 1. Created Settings Manager (`pkg/server/settings.go`)

- **Purpose**: Manages saving and loading settings to/from disk
- **Location**: Settings are stored in `%APPDATA%\PeerHop\settings.json` (Windows) or `~/.peerhop/settings.json` (other OS)
- **Settings Persisted**:
  - `textTransferEnabled`: Whether text transfer is enabled
  - `securityEnabled`: Whether security token validation is enabled
  - `multiClientEnabled`: Whether multi-client mode is enabled
  - `isDarkMode`: Dark/light theme preference
  - `themeId`: Selected theme ID (e.g., "night", "day")
  - `accentId`: Selected accent color ID (e.g., "blue", "green")
  - `desktopDeviceName`: Custom desktop device name

### 2. Updated UnifiedHandler (`pkg/server/unified_handler.go`)

- Added `SettingsManager` field to the `UnifiedHandler` struct
- Modified `NewUnifiedHandler()` to:
  - Create a settings manager instance
  - Load persisted settings from disk
  - Apply saved settings to the WebSocket hub and handler
  - Initialize with saved values instead of hardcoded defaults

### 3. Added Settings Persistence to API Endpoints

Updated the following endpoints to save settings when they change:

#### Theme Endpoint (`/api/theme`)

- Saves `isDarkMode`, `themeId`, and `accentId` when theme is updated
- Settings persist across server restarts

#### Settings Endpoint (`/api/settings`)

- Saves `textTransferEnabled`, `securityEnabled`, and `multiClientEnabled`
- Settings persist across server restarts

#### Desktop Name Endpoint (`/api/desktop-name`)

- Saves `desktopDeviceName` when updated
- Settings persist across server restarts

## How It Works

### On Server Startup:

1. `NewUnifiedHandler()` is called
2. Settings manager loads settings from `settings.json`
3. If file doesn't exist, default settings are used
4. Saved settings are applied to WebSocket hub and handler
5. Server starts with user's previous preferences

### When Settings Change:

1. User changes a setting in the UI
2. Frontend sends update to backend API endpoint
3. Backend updates in-memory state
4. Backend saves updated settings to `settings.json`
5. Settings are now persisted for next restart

### Settings File Location:

- **Windows**: `C:\Users\[Username]\AppData\Roaming\PeerHop\settings.json`
- **Linux/Mac**: `~/.peerhop/settings.json`

## Testing

To verify the implementation works:

1. **Start the application**
   - Note the current settings (theme, security, etc.)

2. **Change some settings**:
   - Toggle dark/light mode
   - Change theme or accent color
   - Enable/disable text transfer
   - Enable/disable security
   - Change desktop device name

3. **Restart the server**:
   - Close and reopen the application
   - OR use the "Restart Server" button in the UI

4. **Verify settings persisted**:
   - All your previous settings should be restored
   - Check `%APPDATA%\PeerHop\settings.json` to see the saved values

## Example Settings File

```json
{
  "textTransferEnabled": true,
  "securityEnabled": true,
  "multiClientEnabled": false,
  "isDarkMode": true,
  "themeId": "night",
  "accentId": "blue",
  "desktopDeviceName": "My Desktop"
}
```

## Benefits

1. **User Experience**: Settings are preserved across restarts
2. **Consistency**: No need to reconfigure after every restart
3. **Reliability**: Settings stored in standard OS app data directory
4. **Simplicity**: Single JSON file for all settings
5. **Thread-Safe**: Uses mutex locks for concurrent access

## Notes

- Settings are saved immediately when changed (no manual save required)
- Invalid or corrupted settings file will fall back to defaults
- Settings directory is created automatically if it doesn't exist
- Frontend localStorage is still used for immediate UI state, backend persistence ensures server-side consistency
