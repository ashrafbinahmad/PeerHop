//go:build !windows

package network

// NetworkProfile holds info about a network interface
type NetworkProfile struct {
	Name     string `json:"name"`
	IP       string `json:"ip"`
	SSID     string `json:"ssid"`
	Password string `json:"password,omitempty"`
	Type     string `json:"type"` // "wifi", "hotspot", "ethernet"
}

// GetNetworkProfiles dummy
func GetNetworkProfiles() []NetworkProfile {
	return []NetworkProfile{}
}

// HotspotConfig holds hotspot credentials
type HotspotConfig struct {
	SSID       string
	Passphrase string
}

// GetHotspotConfig dummy
func GetHotspotConfig() (HotspotConfig, error) {
	return HotspotConfig{}, nil
}

// TryEnableHotspot dummy
func TryEnableHotspot() error {
	return nil
}

// GetWiFiName returns the SSID of the currently connected Wi-Fi network
// Currently only implemented for Windows
func GetWiFiName() string {
	return ""
}
