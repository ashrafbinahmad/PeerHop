package utils

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

type AppInfo struct {
	Name string `json:"name"`
	Path string `json:"command"`
	Icon string `json:"icon,omitempty"`
}

// OpenFileDefault opens the file using the system's default application
func OpenFileDefault(path string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", path)
		HideWindow(cmd)
	case "darwin":
		cmd = exec.Command("open", path)
	default: // linux, etc
		cmd = exec.Command("xdg-open", path)
	}

	return cmd.Start()
}

// ShowInFolder opens the file manager and selects the file
func ShowInFolder(path string) error {
	var cmd *exec.Cmd
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", "/select,", absPath)
		HideWindow(cmd)
	case "darwin":
		cmd = exec.Command("open", "-R", absPath)
	default: // linux
		// Try to open the parent directory
		dir := filepath.Dir(absPath)
		cmd = exec.Command("xdg-open", dir)
	}

	return cmd.Start()
}
