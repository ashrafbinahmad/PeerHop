//go:build windows

package utils

import (
	"os/exec"
)

func ShowOpenWithDialog(file string) error {
	cmd := exec.Command("rundll32.exe", "shell32.dll,OpenAs_RunDLL", file)
	HideWindow(cmd)
	return cmd.Start()
}
