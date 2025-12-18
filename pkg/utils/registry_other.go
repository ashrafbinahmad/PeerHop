//go:build !windows

package utils

import (
	"os/exec"
)

// GetOpenableApps returns a list of apps that can open the file
func GetOpenableApps(path string) ([]AppInfo, error) {
	// For Linux/Darwin, just return a simple list for now
	apps := []AppInfo{}
	apps = append(apps, AppInfo{
		Name: "Show in Folder",
		Path: "folder",
	})
	return apps, nil
}

// OpenFileWithApp opens the file using the specified app command
func OpenFileWithApp(filePath string, appCmd string) error {
	if appCmd == "folder" {
		return ShowInFolder(filePath)
	}

	cmd := exec.Command(appCmd, filePath)
	return cmd.Start()
}
