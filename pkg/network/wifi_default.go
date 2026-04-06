//go:build !windows

package network

import (
	"context"
	"net"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"time"
)

// NetworkProfile holds info about a network interface
type NetworkProfile struct {
	Name     string `json:"name"`
	IP       string `json:"ip"`
	SSID     string `json:"ssid"`
	Password string `json:"password,omitempty"`
	Type     string `json:"type"` // "wifi", "hotspot", "ethernet"
}

// GetNetworkProfiles returns active network profiles on Linux/MacOS systems
func GetNetworkProfiles() []NetworkProfile {
	var profiles []NetworkProfile

	// 1. Get all network interfaces from Go standard library
	ifaces, err := net.Interfaces()
	if err != nil {
		return profiles
	}

	// 2. Map interface names to SSIDs for Wi-Fi interfaces
	ssidMap := make(map[string]string)

	if runtime.GOOS == "linux" {
		// Try nmcli - it's common on desktop Linux
		if out, err := exec.Command("nmcli", "-t", "-f", "DEVICE,SSID", "dev", "wifi").Output(); err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					dev := parts[0]
					ssid := parts[1]
					if ssid != "" && ssid != "--" {
						ssidMap[dev] = ssid
					}
				}
			}
		}
	}

	// 3. Combine info
	for _, iface := range ifaces {
		// Only consider interfaces that are UP and not loopback
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok || ipnet.IP.IsLoopback() {
				continue
			}

			ip := ipnet.IP.To4()
			if ip == nil {
				continue
			}

			ipStr := ip.String()
			profile := NetworkProfile{
				Name: iface.Name,
				IP:   ipStr,
			}

			// Determine Type and SSID
			if ssid, ok := ssidMap[iface.Name]; ok {
				profile.Type = "wifi"
				profile.SSID = ssid
			} else if isWireless(iface.Name) {
				profile.Type = "wifi"
				profile.SSID = getSSIDForInterface(iface.Name)
			} else {
				profile.Type = "ethernet"
			}
			profiles = append(profiles, profile)
		}
	}

	// 4. Sort: Wi-Fi First, then Ethernet
	sort.Slice(profiles, func(i, j int) bool {
		typePriority := func(t string) int {
			switch t {
			case "wifi":
				return 0
			case "hotspot":
				return 1
			default:
				return 2
			}
		}
		return typePriority(profiles[i].Type) < typePriority(profiles[j].Type)
	})

	return profiles
}

func isWireless(name string) bool {
	if runtime.GOOS == "linux" {
		if _, err := os.Stat("/sys/class/net/" + name + "/wireless"); err == nil {
			return true
		}
		if _, err := os.Stat("/sys/class/net/" + name + "/phy80211"); err == nil {
			return true
		}
	}
	// On MacOS, we'll assume it might be wireless if SSID can be detected
	return false
}

func getSSIDForInterface(name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	if runtime.GOOS == "linux" {
		// 1. Try iwgetid
		if out, err := exec.CommandContext(ctx, "iwgetid", name, "-r").Output(); err == nil {
			ssid := strings.TrimSpace(string(out))
			if ssid != "" {
				return ssid
			}
		}

		// 2. Try iw
		if out, err := exec.CommandContext(ctx, "iw", "dev", name, "link").Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, "SSID:") {
					parts := strings.SplitN(line, "SSID:", 2)
					if len(parts) == 2 {
						return strings.TrimSpace(parts[1])
					}
				}
			}
		}
	} else if runtime.GOOS == "darwin" {
		// MacOS implementation using airport utility
		cmd := "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
		if out, err := exec.CommandContext(ctx, cmd, "-I").Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, " SSID: ") {
					parts := strings.SplitN(line, ":", 2)
					if len(parts) == 2 {
						return strings.TrimSpace(parts[1])
					}
				}
			}
		}
	}

	return ""
}

// HotspotConfig holds hotspot credentials
type HotspotConfig struct {
	SSID       string
	Passphrase string
}

// GetHotspotConfig returns current hotspot settings (not yet implemented for non-Windows)
func GetHotspotConfig() (HotspotConfig, error) {
	return HotspotConfig{}, nil
}

// TryEnableHotspot dummy
func TryEnableHotspot() error {
	return nil
}

// GetWiFiName returns the SSID of the currently connected Wi-Fi network
func GetWiFiName() string {
	// 1. Try generic iwgetid (Linux)
	if runtime.GOOS == "linux" {
		if out, err := exec.Command("iwgetid", "-r").Output(); err == nil {
			ssid := strings.TrimSpace(string(out))
			if ssid != "" {
				return ssid
			}
		}
	}

	// 2. Try iterating interfaces to find one with an SSID
	profiles := GetNetworkProfiles()
	for _, p := range profiles {
		if p.Type == "wifi" && p.SSID != "" {
			return p.SSID
		}
	}

	// 3. Fallback for MacOS
	if runtime.GOOS == "darwin" {
		return getSSIDForInterface("")
	}

	return ""
}
