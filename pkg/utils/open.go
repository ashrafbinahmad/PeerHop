package utils

import (
	"os/exec"
	"runtime"
)

// OpenFileDefault opens the file using the system's default application
func OpenFileDefault(path string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default: // linux, etc
		cmd = exec.Command("xdg-open", path)
	}

	return cmd.Start()
}
