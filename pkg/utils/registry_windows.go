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

	// method 1: OpenWithList in Registry
	// HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ext\OpenWithList
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\`+ext+`\OpenWithList`, registry.READ)
	if err == nil {
		defer k.Close()
		// values are sorted by "a", "b", "c", "MRUList"
		// We just iterate all values
		names, err := k.ReadValueNames(-1)
		if err == nil {
			for _, name := range names {
				if name == "MRUList" {
					continue
				}
				val, _, err := k.GetStringValue(name)
				if err == nil {
					// This is usually just the exe name, e.g. "Code.exe"
					// To get the full path or 'friendly name', we need more queries.
					// For now, let's use the exe name as the Name.
					apps = append(apps, AppInfo{
						Name: strings.TrimSuffix(val, filepath.Ext(val)),
						Path: val,
					})
				}
			}
		}
	}

	// Always add "Show in Folder"
	apps = append(apps, AppInfo{
		Name: "Show in Folder",
		Path: "explorer",
	})

	return apps, nil
}

// OpenFileWithApp opens the file using the specified app command
func OpenFileWithApp(filePath string, appCmd string) error {
	if appCmd == "explorer" {
		// "Open Folder" behavior: select the file
		cmd := exec.Command("explorer", "/select,", filePath)
		return cmd.Start()
	}

	// For specific apps, we might just have the EXE name (e.g. "Code.exe")
	// exec.Command relies on PATH.

	// If it's a known app name with spaces or args, standard exec might fail if not tokenized.
	// But registry usually gives "program.exe".

	cmd := exec.Command(appCmd, filePath)
	return cmd.Start()
}
