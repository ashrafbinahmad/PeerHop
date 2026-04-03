package utils

import (
	"fmt"
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
	fmt.Printf("[DEBUG] ShowInFolder: input path = %s\n", path)
	var cmd *exec.Cmd
	absPath, err := filepath.Abs(path)
	if err != nil {
		fmt.Printf("[DEBUG] ShowInFolder: Abs error = %v, using path as is\n", err)
		absPath = path
	}
	fmt.Printf("[DEBUG] ShowInFolder: absPath = %s\n", absPath)

	switch runtime.GOOS {
	case "windows":
		fmt.Printf("[DEBUG] ShowInFolder (Windows): executing explorer /select,\"%s\"\n", absPath)
		cmd = exec.Command("explorer", "/select,"+absPath)
		// HideWindow(cmd) // REASON: This might hide the explorer window as well!
	case "darwin":
		fmt.Printf("[DEBUG] ShowInFolder (Mac): executing open -R \"%s\"\n", absPath)
		cmd = exec.Command("open", "-R", absPath)
	default: // linux
		// Try to open the parent directory
		dir := filepath.Dir(absPath)
		fmt.Printf("[DEBUG] ShowInFolder (Linux): executing xdg-open \"%s\"\n", dir)
		cmd = exec.Command("xdg-open", dir)
	}

	err = cmd.Start()
	if err != nil {
		fmt.Printf("[DEBUG] ShowInFolder: Start error = %v\n", err)
	}
	return err
}
