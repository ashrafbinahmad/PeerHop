//go:build windows

package main

import (
    "context"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "time"

    "github.com/go-toast/toast"
    "github.com/wailsapp/wails/v2/pkg/runtime"

    "peerhop/pkg/logger"
    "peerhop/pkg/utils"
)

// RequestReview triggers the native Windows Store rating dialog using WinRT StoreRequestHelper request type 16.
// If WinRT does not work, it falls back to opening the ms-windows-store review URI.
func (a *App) RequestReview() error {
	storeID := getWindowsStoreProductID()
	fws := "ms-windows-store://review/?ProductId=" + storeID
	psCmd := fmt.Sprintf(`try {
		$req = [Windows.Services.Store.StoreRequestHelper]::SendRequestAsync(16, '%s')
		$req.GetResults() | Out-Null
	} catch {
		Start-Process -FilePath '%s'
	}`, storeID, fws)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psCmd)
	utils.HideWindow(cmd)
	if err := cmd.Run(); err != nil {
		logger.Warn("RequestReview PowerShell failed: %v", err)
		if a.ctx != nil {
			runtime.BrowserOpenURL(a.ctx, fws)
		}
		return nil
	}
	return nil
}

func removeZoneIdentifier(filePath string) {
	zonePath := filePath + ":Zone.Identifier"
	os.Remove(zonePath)
}

// GetClipboardFiles returns a list of file paths currently in the clipboard (Windows only)
func (a *App) GetClipboardFiles() ([]string, error) {
	// Use PowerShell to get the file drop list
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Format FileDropList | Select-Object -ExpandProperty FullName")

	utils.HideWindow(cmd)

	output, err := cmd.Output()
	if err != nil {
		// It might error if clipboard is empty or not files
		return []string{}, nil
	}

	lines := strings.Split(string(output), "\r\n")
	var paths []string
	for _, line := range lines {
		val := strings.TrimSpace(line)
		if val != "" {
			paths = append(paths, val)
		}
	}
	return paths, nil
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

    // Use toast for Windows to support silence
    notification := toast.Notification{
        AppID:   "PeerHop",
        Title:   title,
        Message: message,
        Icon:    iconPath,
        Audio:   toast.Silent,
    }
    return notification.Push()
}
