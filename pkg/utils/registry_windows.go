//go:build windows

package utils

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// GetOpenableApps returns a list of apps that can open the file based on its extension
func GetOpenableApps(path string) ([]AppInfo, error) {
	ext := filepath.Ext(path)
	if ext == "" {
		return nil, fmt.Errorf("no extension")
	}

	apps := []AppInfo{}
	seen := make(map[string]bool)

	// method 1: OpenWithList in Registry
	// HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ext\OpenWithList
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\`+ext+`\OpenWithList`, registry.READ)
	if err == nil {
		defer k.Close()
		// values are sorted by "a", "b", "c", "MRUList"
		// We iterate over the values to get the list of apps
		names, err := k.ReadValueNames(-1)
		if err == nil {
			for _, name := range names {
				if name == "MRUList" {
					continue
				}
				val, _, err := k.GetStringValue(name)
				if err == nil {
					// val is usually just the exe name, e.g. "Code.exe"
					// We try to resolve it to a full path and friendly name
					info := resolveAppInfo(val)

					// Verify existence: Check if app is in PATH or exists at absolute path
					if resolvedPath, err := exec.LookPath(info.Path); err == nil {
						// Use the resolved path (handles PATH lookup)
						info.Path = resolvedPath

						if !seen[info.Path] {
							apps = append(apps, info)
							seen[info.Path] = true
						}
					}
				}
			}
		}
	}

	// Always add "Show in Folder"
	if !seen["explorer"] {
		apps = append(apps, AppInfo{
			Name: "Show in Folder",
			Path: "explorer",
		})
	}

	return apps, nil
}

// resolveAppInfo attempts to find the full path and friendly name for an executable
func resolveAppInfo(exeName string) AppInfo {
	// Defaults
	name := strings.TrimSuffix(exeName, filepath.Ext(exeName))
	cmdPath := exeName

	// Check HKCR\Applications\<exeName>
	k, err := registry.OpenKey(registry.CLASSES_ROOT, `Applications\`+exeName, registry.READ)
	if err == nil {
		defer k.Close()

		// Try to get FriendlyAppName
		if val, _, err := k.GetStringValue("FriendlyAppName"); err == nil && val != "" && !strings.HasPrefix(val, "@") {
			name = val
		}

		// Try to get Command from shell\open\command
		kCmd, err := registry.OpenKey(registry.CLASSES_ROOT, `Applications\`+exeName+`\shell\open\command`, registry.READ)
		if err == nil {
			defer kCmd.Close()
			if val, _, err := kCmd.GetStringValue(""); err == nil && val != "" {
				parsed := extractPathFromCommand(val)
				if parsed != "" {
					cmdPath = parsed
				}
			}
		}
	}

	return AppInfo{
		Name: name,
		Path: cmdPath,
	}
}

// extractPathFromCommand extracts the executable path from a command string
// e.g. "C:\Path\To\App.exe" "%1" -> C:\Path\To\App.exe
func extractPathFromCommand(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if len(cmd) == 0 {
		return ""
	}

	// Case 1: Quoted path
	if cmd[0] == '"' {
		// Find closing quote
		end := strings.Index(cmd[1:], "\"")
		if end != -1 {
			// +1 because we search from index 1, +1 to include the closing quote (actually we want raw path?)
			// exec.Command works with quoted paths? No, usually it expects raw path.
			// Let's strip quotes for exec.Command if it's just the path.
			// Yes, exec.Command("path with spaces") works. exec.Command("\"path\"") might be treated as literal.
			// So we should STRIP quotes.
			return cmd[1 : end+1]
		}
	}

	// Case 2: Unquoted path - assume first space is delimiter
	end := strings.Index(cmd, " ")
	if end != -1 {
		return cmd[:end]
	}

	// Case 3: Just command
	return cmd
}

// OpenFileWithApp opens the file using the specified app command
func OpenFileWithApp(filePath string, appCmd string) error {
	if appCmd == "explorer" {
		// "Open Folder" behavior: select the file
		cmd := exec.Command("explorer", "/select,", filePath)
		return cmd.Start()
	}

	// cmdPath should be clean path. exec.Command handles spaces in arg0 correctly.
	cmd := exec.Command(appCmd, filePath)
	return cmd.Start()
}
