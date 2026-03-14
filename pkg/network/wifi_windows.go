//go:build windows

package network

import (
	"context"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

// GetWiFiName returns the SSID of the currently connected Wi-Fi network (Windows only).
func GetWiFiName() string {
	return fetchWiFiName()
}

func fetchWiFiName() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Call netsh directly — avoids PowerShell cold-start overhead (~10x faster)
	cmd := exec.CommandContext(ctx, "netsh", "wlan", "show", "interfaces")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	for _, line := range strings.Split(string(output), "\n") {
		trimmed := strings.TrimSpace(line)
		// Match "SSID" but not "BSSID"
		if strings.HasPrefix(trimmed, "SSID") && !strings.HasPrefix(trimmed, "BSSID") {
			parts := strings.SplitN(trimmed, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}
