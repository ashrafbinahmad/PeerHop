//go:build windows

package network

import (
	"context"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

// GetWiFiName returns the SSID of the currently connected Wi-Fi network (Windows only)
func GetWiFiName() string {
	// Create context with timeout to prevent hanging
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Use powershell to get SSID accurately
	// Added -NoProfile and -NonInteractive to speed up and prevent hangs
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", "(netsh wlan show interfaces) -Match '^\\s+SSID' -Replace '^\\s+SSID\\s+:\\s+', ''")

	// Hide the command window
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}

	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}
