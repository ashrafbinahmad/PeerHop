package server

import (
	"strings"
	"sync"
	"time"
)

// Client represents a connected device
type Client struct {
	ID             string    `json:"id"`
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
func (cs *ClientStore) AddOrUpdateClient(id, userAgent, ip string) *Client {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	// Use IP as the unique key to group multiple tabs/connections from the same device
	client, exists := cs.clients[ip]
	if !exists {
		platform := parsePlatform(userAgent)
		client = &Client{
			ID:             id,
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
	// Update UA/Platform if changed, and store the latest Client ID
	client.ID = id
	client.UserAgent = userAgent
	client.Platform = parsePlatform(userAgent)

	// If name is still empty or matches old platform name, update it?
	// Actually, let's keep it as is once set.
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

// GetClients returns all active clients (seen in last 5 minutes)
func (cs *ClientStore) GetClients() []*Client {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var active []*Client
	cutoff := time.Now().Add(-5 * time.Minute)

	for _, client := range cs.clients {
		if client.LastSeen.After(cutoff) {
			active = append(active, client)
		}
	}
	return active
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
