//go:build windows

package utils

import (
	"os/exec"
	"regexp"
	"strings"
)

func ShowOpenWithDialog(file string) error {
	cmd := exec.Command("rundll32.exe", "shell32.dll,OpenAs_RunDLL", file)
	HideWindow(cmd)
	return cmd.Start()
}

// GetUserEmail returns a likely email based on the primary Microsoft account on the system.
func GetUserEmail() string {
	// HKCU\Software\Microsoft\IdentityCRL\UserExtendedProperties
	cmd := exec.Command("reg", "query", "HKCU\\Software\\Microsoft\\IdentityCRL\\UserExtendedProperties")
	HideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}

	// Look for subkeys which look like an email
	lines := strings.Split(string(out), "\n")
	emailRegex := regexp.MustCompile(`[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+`)
	for _, line := range lines {
		match := emailRegex.FindString(line)
		if match != "" {
			return match
		}
	}

	return ""
}
