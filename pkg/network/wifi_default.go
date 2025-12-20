//go:build !windows

package network

// GetWiFiName returns the SSID of the currently connected Wi-Fi network
// Currently only implemented for Windows
func GetWiFiName() string {
	return ""
}
