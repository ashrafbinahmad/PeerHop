//go:build windows

package utils

import (
	"os/exec"
	"syscall"
)

// HideWindow configures the command to run with a hidden window on Windows
func HideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
}
