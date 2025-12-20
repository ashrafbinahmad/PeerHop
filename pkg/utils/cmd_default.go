//go:build !windows

package utils

import "os/exec"

// HideWindow is a no-op on non-Windows systems
func HideWindow(cmd *exec.Cmd) {
}
