//go:build !windows

package utils

import (
	"os/exec"
)

// ShowOpenWithDialog on non-Windows just opens the file with the default app
func ShowOpenWithDialog(file string) error {
	cmd := exec.Command("xdg-open", file)
	return cmd.Start()
}
