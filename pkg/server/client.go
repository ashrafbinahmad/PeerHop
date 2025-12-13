package server

import (
	"strings"
	"sync"
	"time"
)

// Client represents a connected device
type Client struct {
	ID        string    `json:"id"`
	UserAgent string    `json:"userAgent"`
	IP        string    `json:"ip"`
	LastSeen  time.Time `json:"lastSeen"`
	Platform  string    `json:"platform"` // "android", "ios", "windows", "linux", "unknown"
}

// ClientStore manages connected clients
type ClientStore struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

// NewClientStore creates a new client store
func NewClientStore() *ClientStore {
	return &ClientStore{
		clients: make(map[string]*Client),
	}
}

// AddOrUpdateClient adds a new client or updates an existing one
func (cs *ClientStore) AddOrUpdateClient(id, userAgent, ip string) *Client {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	client, exists := cs.clients[id]
	if !exists {
		client = &Client{
			ID:        id,
			UserAgent: userAgent,
			IP:        ip,
			Platform:  parsePlatform(userAgent),
		}
		cs.clients[id] = client
	}

	client.LastSeen = time.Now()
	// Update IP/UA if changed (unlikely but possible)
	client.IP = ip
	client.UserAgent = userAgent

	return client
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
		return "ios"
	}
	if strings.Contains(lower, "linux") {
		return "linux"
	}
	if strings.Contains(lower, "windows") {
		return "windows"
	}
	if strings.Contains(lower, "macintosh") || strings.Contains(lower, "mac os") {
		return "ios" // Treat Mac as iOS/Apple generic for icon purposes if needed, or separate
	}
	return "unknown"
}
