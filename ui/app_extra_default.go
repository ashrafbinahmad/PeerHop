//go:build !windows

package main

import (
    "os"
    "path/filepath"

    "github.com/gen2brain/beeep"
)

// RequestReview triggers the native system's review request, if supported
func (a *App) RequestReview() error {
    // Review request is not currently implemented for non-Windows platforms
    return nil
}

func removeZoneIdentifier(filePath string) {
    // Windows only - no-op for other platforms
}

// GetClipboardFiles returns a list of file paths currently in the clipboard
func (a *App) GetClipboardFiles() ([]string, error) {
    // Clipboard file list is currently only implemented for Windows
    return []string{}, nil
}

// SendNotification sends a native system notification
func (a *App) SendNotification(title, message string) error {
	// Create temp icon file for notifications that require a path
	iconPath := ""
	if len(appIcon) > 0 {
		tempDir := os.TempDir()
		iconPath = filepath.Join(tempDir, "peerhop_notif_icon.png")
		if _, err := os.Stat(iconPath); os.IsNotExist(err) {
			_ = os.WriteFile(iconPath, appIcon, 0644)
		}
	}

	// Use beeep for other platforms (default sound)
	return beeep.Notify(title, message, iconPath)
}
