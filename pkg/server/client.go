package server

import (
	"net"
	"strings"
	"sync"
	"time"
)

// Client represents a connected device
type Client struct {
	Name           string    `json:"name"` // User-editable name
	UserAgent      string    `json:"userAgent"`
	IP             string    `json:"ip"`
	LastSeen       time.Time `json:"lastSeen"`
	Platform       string    `json:"platform"`       // "android", "iOS", "windows", "linux", "unknown"
	Blocked        bool      `json:"blocked"`        // Whether this client is blocked
	SendingBlocked bool      `json:"sendingBlocked"` // Whether this client is blocked from sending files/text
}

// ClientStore manages connected clients
type ClientStore struct {
	mu                sync.RWMutex
	clients           map[string]*Client
	blockedIPs        map[string]bool // Track blocked IPs
	sendingBlockedIPs map[string]bool // Track IPs blocked from sending
}

// NewClientStore creates a new client store
func NewClientStore() *ClientStore {
	return &ClientStore{
		clients:           make(map[string]*Client),
		blockedIPs:        make(map[string]bool),
		sendingBlockedIPs: make(map[string]bool),
	}
}

// AddOrUpdateClient adds a new client or updates an existing one (grouped by IP)
func (cs *ClientStore) AddOrUpdateClient(userAgent, ip string) *Client {
	// Group ALL server local IPs to skip them
	serverIPs := getLocalIPs()
	isServer := false
	for _, sip := range serverIPs {
		if ip == sip {
			isServer = true
			break
		}
	}
	if ip == "127.0.0.1" || ip == "::1" || ip == "localhost" || ip == "192.168.137.1" {
		isServer = true
	}

	if isServer {
		// Don't track the server itself as a client
		return nil
	}

	cs.mu.Lock()
	defer cs.mu.Unlock()

	// Use IP as the unique key to group multiple tabs/connections from the same device
	client, exists := cs.clients[ip]
	if !exists {
		platform := parsePlatform(userAgent)
		client = &Client{
			Name:           platform, // Default name is platform
			UserAgent:      userAgent,
			IP:             ip,
			Platform:       platform,
			Blocked:        cs.blockedIPs[ip],
			SendingBlocked: cs.sendingBlockedIPs[ip],
		}
		cs.clients[ip] = client
	}

	client.LastSeen = time.Now()
	// Update UA/Platform if changed
	client.UserAgent = userAgent
	client.Platform = parsePlatform(userAgent)

	// If name is still empty or matches old platform name, update it?
	if client.Name == "" {
		client.Name = client.Platform
	}

	return client
}

// UpdateClientName updates the custom name for a client identified by IP
func (cs *ClientStore) UpdateClientName(ip, name string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[ip]
	if exists {
		client.Name = name
		return true
	}
	return false
}

// GetClients returns all active clients (seen in last 5 minutes), excluding the server's own IPs
func (cs *ClientStore) GetClients() []*Client {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var active []*Client
	cutoff := time.Now().Add(-5 * time.Minute)

	// Get ALL server local IPs to filter them out
	serverIPs := getLocalIPs()

	for _, client := range cs.clients {

		// Check if client IP matches ANY of the server's IPs
		isServer := false
		for _, ip := range serverIPs {
			if client.IP == ip {
				isServer = true
				break
			}
		}
		// Also check strictly for localhost and common hotspot IPs
		if client.IP == "127.0.0.1" || client.IP == "::1" || client.IP == "localhost" || client.IP == "192.168.137.1" {
			isServer = true
		}

		if isServer {

			continue
		}

		if client.LastSeen.After(cutoff) {
			active = append(active, client)
		}
	}

	return active
}

// getLocalIPs returns ALL local IP addresses of the server
func getLocalIPs() []string {
	var ips []string
	// Try to get IP from network interfaces
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok { // Accept loopback too just in case
			if ipnet.IP.To4() != nil {
				ips = append(ips, ipnet.IP.String())
			}
		}
	}
	return ips
}

// RemoveClient removes a client by IP
func (cs *ClientStore) RemoveClient(ip string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	delete(cs.clients, ip)
}

// Helper to deduce platform from User-Agent
func parsePlatform(ua string) string {
	// Simple heuristic
	lower := strings.ToLower(ua)
	if strings.Contains(lower, "android") {
		return "android"
	}
	if strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad") || strings.Contains(lower, "ipod") {
		return "iOS"
	}
	if strings.Contains(lower, "linux") {
		return "linux"
	}
	if strings.Contains(lower, "windows") {
		return "windows"
	}
	if strings.Contains(lower, "macintosh") || strings.Contains(lower, "mac os") {
		return "iOS" // Treat Mac as iOS/Apple generic for icon purposes if needed, or separate
	}
	return "unknown"
}

// BlockClient blocks a client by IP
func (cs *ClientStore) BlockClient(ip string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[ip]
	if exists {
		client.Blocked = true
		cs.blockedIPs[ip] = true
		return true
	}
	return false
}

// UnblockClient unblocks a client by IP
func (cs *ClientStore) UnblockClient(ip string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[ip]
	if exists {
		client.Blocked = false
		delete(cs.blockedIPs, ip)
		return true
	}
	return false
}

// IsBlocked checks if an IP is blocked
func (cs *ClientStore) IsBlocked(ip string) bool {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.blockedIPs[ip]
}

// BlockSending blocks a client from sending files/text by IP
func (cs *ClientStore) BlockSending(ip string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[ip]
	if exists {
		client.SendingBlocked = true
		cs.sendingBlockedIPs[ip] = true
		return true
	}
	return false
}

// UnblockSending unblocks a client from sending files/text by IP
func (cs *ClientStore) UnblockSending(ip string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[ip]
	if exists {
		client.SendingBlocked = false
		delete(cs.sendingBlockedIPs, ip)
		return true
	}
	return false
}

// IsSendingBlocked checks if an IP is blocked from sending
func (cs *ClientStore) IsSendingBlocked(ip string) bool {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.sendingBlockedIPs[ip]
}
