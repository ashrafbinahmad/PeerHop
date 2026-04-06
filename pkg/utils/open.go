package utils

import (
	"fmt"
	"os"
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

// ShowInFolder opens the file manager and selects the file (or opens the directory if it is one)
func ShowInFolder(path string) error {
	fmt.Printf("[DEBUG] ShowInFolder: input path = %s\n", path)
	var cmd *exec.Cmd
	absPath, err := filepath.Abs(path)
	if err != nil {
		fmt.Printf("[DEBUG] ShowInFolder: Abs error = %v, using path as is\n", err)
		absPath = path
	}
	fmt.Printf("[DEBUG] ShowInFolder: absPath = %s\n", absPath)

	// Check if path is a directory
	info, err := os.Stat(absPath)
	isDir := err == nil && info.IsDir()

	switch runtime.GOOS {
	case "windows":
		absPath = filepath.Clean(absPath)
		if isDir {
			fmt.Printf("[DEBUG] ShowInFolder (Windows): executing explorer \"%s\"\n", absPath)
			cmd = exec.Command("explorer", absPath)
		} else {
			// Check if file exists. If it doesn't, we can't select it, so open the parent folder.
			// This prevents Explorer from defaulting to the Documents folder.
			exists := false
			if _, err := os.Stat(absPath); err == nil {
				exists = true
			}

			if exists {
				fmt.Printf("[DEBUG] ShowInFolder (Windows): file exists, selecting: %s\n", absPath)
				// The most reliable way in Go to call /select, with spaces:
				// Pass "/select," as the first arg and the path as the second.
				// This ensures Go quotes ONLY the path part correctly.
				cmd = exec.Command("explorer", "/select,", absPath)
			} else {
				parent := filepath.Dir(absPath)
				fmt.Printf("[DEBUG] ShowInFolder (Windows): file not found, opening parent: %s\n", parent)
				// If parent doesn't exist either, Explorer will fallback to Documents or This PC.
				cmd = exec.Command("explorer", parent)
			}
		}
	case "darwin":
		if isDir {
			fmt.Printf("[DEBUG] ShowInFolder (Mac): executing open \"%s\"\n", absPath)
			cmd = exec.Command("open", absPath)
		} else {
			fmt.Printf("[DEBUG] ShowInFolder (Mac): executing open -R \"%s\"\n", absPath)
			cmd = exec.Command("open", "-R", absPath)
		}
	default: // linux
		// Try to open the parent directory or the directory itself
		target := absPath
		if !isDir {
			target = filepath.Dir(absPath)
		}
		fmt.Printf("[DEBUG] ShowInFolder (Linux): executing xdg-open \"%s\"\n", target)
		cmd = exec.Command("xdg-open", target)
	}

	err = cmd.Start()
	if err != nil {
		fmt.Printf("[DEBUG] ShowInFolder: Start error = %v\n", err)
	}
	return err
}
