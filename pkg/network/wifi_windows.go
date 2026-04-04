//go:build windows

package network

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"sort"
	"strings"
	"syscall"
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

// HotspotConfig holds hotspot credentials
type HotspotConfig struct {
	SSID       string
	Passphrase string
}

// GetHotspotConfig retrieves current Windows Mobile Hotspot settings
func GetHotspotConfig() (HotspotConfig, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Direct PowerShell WinRT API calls
	psScript := `
	Add-Type -AssemblyName System.Runtime.WindowsRuntime
	$cp = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]::GetInternetConnectionProfile()
	if ($null -eq $cp) { exit }
	$tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]::CreateFromConnectionProfile($cp)
	if ($null -eq $tm) { exit }
	$c = $tm.GetCurrentAccessPointConfiguration()
	Write-Output "$($c.Ssid)|$($c.Passphrase)"
	`
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	output, err := cmd.Output()
	if err != nil {
		return HotspotConfig{}, err
	}

	res := strings.TrimSpace(string(output))
	if res == "" {
		return HotspotConfig{}, fmt.Errorf("no hotspot output")
	}

	parts := strings.Split(res, "|")
	if len(parts) == 2 {
		return HotspotConfig{SSID: parts[0], Passphrase: parts[1]}, nil
	}
	return HotspotConfig{}, fmt.Errorf("invalid hotspot output: %s", res)
}

// GetNetworkProfiles returns all active IPv4 interfaces and their SSIDs/Passwords
func GetNetworkProfiles() []NetworkProfile {
	var profiles []NetworkProfile

	// 1. Get all network interfaces from Go standard library
	ifaces, err := net.Interfaces()
	if err != nil {
		return profiles
	}

	// 2. Fetch all SSIDs and interface names from netsh wlan
	// This helps us match "Interface Name" to "SSID"
	ssidMap := make(map[string]string)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "netsh", "wlan", "show", "interfaces")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if out, err := cmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		var currentInterface string
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "Name") {
				parts := strings.SplitN(trimmed, ":", 2)
				if len(parts) == 2 {
					currentInterface = strings.TrimSpace(parts[1])
				}
			} else if strings.HasPrefix(trimmed, "SSID") && !strings.HasPrefix(trimmed, "BSSID") && currentInterface != "" {
				parts := strings.SplitN(trimmed, ":", 2)
				if len(parts) == 2 {
					ssidMap[currentInterface] = strings.TrimSpace(parts[1])
				}
			}
		}
	}

	// 3. Get Hotspot Config
	hotspot, _ := GetHotspotConfig()

	// 4. Combine info
	for _, iface := range ifaces {
		// Only consider interfaces that are UP
		if iface.Flags&net.FlagUp == 0 {
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
			} else if ipStr == "192.168.137.1" || (hotspot.SSID != "" && strings.Contains(iface.Name, "*")) {
				// Windows Hotspot defaults to 192.168.137.1 or has a '*' in name
				profile.Type = "hotspot"
				profile.SSID = hotspot.SSID
				profile.Password = hotspot.Passphrase
				// Fallback SSID if not detected yet
				if profile.SSID == "" {
					profile.SSID = "Mobile Hotspot"
				}
			} else {
				profile.Type = "ethernet"
			}
			profiles = append(profiles, profile)
		}
	}

	// 5. Sort: Wi-Fi First, then Hotspot, then Ethernet
	sort.Slice(profiles, func(i, j int) bool {
		// Priority: wifi (0) > hotspot (1) > ethernet (2)
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

// TryEnableHotspot attempts to turn on the Mobile Hotspot
func TryEnableHotspot() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	psScript := `
	Add-Type -AssemblyName System.Runtime.WindowsRuntime
	$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
	function Await($WinRtTask, $ResultType) {
		$asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
		$netTask = $asTask.Invoke($null, @($WinRtTask))
		$netTask.Wait(-1) | Out-Null
		return $netTask.Result
	}
	$cp = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]::GetInternetConnectionProfile()
	if ($null -eq $cp) { exit }
	$tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]::CreateFromConnectionProfile($cp)
	if ($null -eq $tm) { exit }
	if ($tm.TetheringOperationalState -ne 'On') {
		$res = Await ($tm.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
	}
	`
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	return cmd.Run()
}
