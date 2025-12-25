package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"peerhop/pkg/logger"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type string      `json:"type"` // "transaction_update", "devices_update"
	Data interface{} `json:"data"`
}

// SafeConn wraps websocket.Conn to ensure thread-safe writes
type SafeConn struct {
	conn      *websocket.Conn
	mu        sync.Mutex
	clientIP  string // Track client IP for blocking
	isDesktop bool   // Whether this is a desktop app connection
}

// WriteMessage sends a message to the connection in a thread-safe manner
func (sc *SafeConn) WriteMessage(messageType int, data []byte) error {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	return sc.conn.WriteMessage(messageType, data)
}

// Close closes the underlying connection
func (sc *SafeConn) Close() error {
	return sc.conn.Close()
}

// ReadMessage reads a message from the underlying connection (not mutex protected as we only have one reader)
func (sc *SafeConn) ReadMessage() (int, []byte, error) {
	return sc.conn.ReadMessage()
}

// SetReadDeadline sets the read deadline
func (sc *SafeConn) SetReadDeadline(t time.Time) error {
	return sc.conn.SetReadDeadline(t)
}

// SetPongHandler sets the pong handler
func (sc *SafeConn) SetPongHandler(h func(appData string) error) {
	sc.conn.SetPongHandler(h)
}

// WebSocketHub manages all active WebSocket connections
type WebSocketHub struct {
	mu                  sync.RWMutex
	connections         map[*SafeConn]bool
	txStore             *TransactionStore
	clientStore         *ClientStore
	desktopName         string // Desktop device name
	textTransferEnabled bool   // Text transfer setting
	themeID             string // Current theme ID
	accentID            string // Current accent ID

	// Track last sent percentage for each transaction to only send whole number changes
	lastSentPercent map[int]int

	done chan struct{} // Channel to signal shutdown
}

// NewWebSocketHub creates a new WebSocket hub
func NewWebSocketHub(txStore *TransactionStore, clientStore *ClientStore) *WebSocketHub {
	return &WebSocketHub{
		connections:     make(map[*SafeConn]bool),
		txStore:         txStore,
		clientStore:     clientStore,
		desktopName:     "PeerHop", // Default name
		themeID:         "night",   // Default theme
		accentID:        "blue",    // Default accent
		lastSentPercent: make(map[int]int),
		done:            make(chan struct{}),
	}
}

// AddConnection adds a new WebSocket connection
func (hub *WebSocketHub) AddConnection(conn *SafeConn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.connections[conn] = true
	logger.Info("[WebSocket] New connection added. Total connections: %d", len(hub.connections))
}

// RemoveConnection removes a WebSocket connection
func (hub *WebSocketHub) RemoveConnection(conn *SafeConn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if _, ok := hub.connections[conn]; ok {
		delete(hub.connections, conn)
		conn.Close()
		logger.Info("[WebSocket] Connection removed. Total connections: %d", len(hub.connections))
	}
}

// Broadcast sends a message to all connected clients
func (hub *WebSocketHub) Broadcast(msgType string, data interface{}) {
	hub.mu.RLock()
	defer hub.mu.RUnlock()

	message := WSMessage{
		Type: msgType,
		Data: data,
	}

	jsonData, err := json.Marshal(message)
	if err != nil {
		logger.Error("[WebSocket] Error marshaling message: %v", err)
		return
	}

	for conn := range hub.connections {
		// Check if client is blocked - only allow devices_update messages through
		if hub.clientStore != nil && conn.clientIP != "" && hub.clientStore.IsBlocked(conn.clientIP) {
			// Blocked clients can only receive devices_update to see their blocked status
			if msgType != "devices_update" && msgType != "devices_init" {
				continue // Skip this client for other message types
			}
		}

		err := conn.WriteMessage(websocket.TextMessage, jsonData)
		if err != nil {
			logger.Warn("[WebSocket] Error writing to connection: %v", err)
			// Connection will be cleaned up by the read loop or keep-alive
		}
	}
}

// BroadcastTransactionUpdate broadcasts a single transaction update
func (hub *WebSocketHub) BroadcastTransactionUpdate(txn *Transaction) {
	// Only broadcast percentage updates if they increase by whole numbers
	currentPercent := int(txn.TransactionPercent)

	hub.mu.Lock()
	lastPercent, exists := hub.lastSentPercent[txn.ID]

	// Only send if:
	// 1. First time sending for this transaction (!exists)
	// 2. Percentage increased to next whole number
	// 3. Percentage decreased (reset to 0 after cancellation)
	// 4. Status changed to completed, pending, or in_progress, or cancelled
	shouldBroadcast := !exists ||
		currentPercent > lastPercent ||
		currentPercent < lastPercent || // Reset to 0
		txn.Status == "completed" ||
		txn.Status == "pending" ||
		txn.Status == "cancelled"

	if shouldBroadcast {
		hub.lastSentPercent[txn.ID] = currentPercent
		// Reduce log noise for frequent progress updates, log only status changes or 100%
		if txn.Status == "completed" || txn.Status == "pending" || txn.Status == "cancelled" || currentPercent%10 == 0 {
			logger.Debug("[WebSocket] Broadcasting txn %d: %s %.0f%% (status: %s)",
				txn.ID, txn.Filename, txn.TransactionPercent, txn.Status)
		}
	}
	hub.mu.Unlock()

	if shouldBroadcast {
		hub.Broadcast("transaction_update", txn)
	}
}

// BroadcastDevicesUpdate broadcasts the current list of connected devices
func (hub *WebSocketHub) BroadcastDevicesUpdate() {
	if hub.clientStore == nil {
		return
	}
	clients := hub.clientStore.GetClients()
	hub.Broadcast("devices_update", map[string]interface{}{
		"clients": clients,
	})
}

// SetDesktopName sets the desktop device name and broadcasts the update
func (hub *WebSocketHub) SetDesktopName(name string) {
	hub.mu.Lock()
	hub.desktopName = name
	hub.mu.Unlock()
	hub.Broadcast("desktop_name_update", map[string]interface{}{
		"name": name,
	})
}

// GetDesktopName returns the current desktop device name
func (hub *WebSocketHub) GetDesktopName() string {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	return hub.desktopName
}

// SetTextTransferEnabled sets the text transfer setting and broadcasts the update
func (hub *WebSocketHub) SetTextTransferEnabled(enabled bool) {
	hub.mu.Lock()
	hub.textTransferEnabled = enabled
	hub.mu.Unlock()
	hub.Broadcast("settings_update", map[string]interface{}{
		"textTransferEnabled": enabled,
	})
}

func (hub *WebSocketHub) GetTextTransferEnabled() bool {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	return hub.textTransferEnabled
}

// SetTheme sets the theme settings and broadcasts the update
func (hub *WebSocketHub) SetTheme(themeId, accentId string) {
	hub.mu.Lock()
	hub.themeID = themeId
	hub.accentID = accentId
	hub.mu.Unlock()
	hub.Broadcast("theme_update", map[string]interface{}{
		"themeId":  themeId,
		"accentId": accentId,
	})
}

// GetTheme returns the current theme settings
func (hub *WebSocketHub) GetTheme() (string, string) {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	return hub.themeID, hub.accentID
}

// StartMonitoring starts monitoring transactions and devices for changes
func (hub *WebSocketHub) StartMonitoring() {
	// Start transaction monitoring
	go func() {
		ticker := time.NewTicker(200 * time.Millisecond) // Faster updates
		defer ticker.Stop()

		lastTransactionCount := 0
		lastTransactions := make(map[int]*Transaction)

		for {
			select {
			case <-hub.done:
				return
			case <-ticker.C:
				if hub.txStore == nil {
					continue
				}

				transactions := hub.txStore.GetAllTransactions()

				// Check if transaction count changed
				if len(transactions) != lastTransactionCount {
					lastTransactionCount = len(transactions)
				}

				// Check each transaction for changes
				for _, txn := range transactions {
					lastTxn, exists := lastTransactions[txn.ID]

					// New transaction
					if !exists {
						hub.BroadcastTransactionUpdate(txn)
						// Store a copy of the transaction
						txnCopy := *txn
						lastTransactions[txn.ID] = &txnCopy
						continue
					}

					// Check if transaction changed
					if txn.TransactionPercent != lastTxn.TransactionPercent ||
						txn.Status != lastTxn.Status ||
						txn.BytesTransferred != lastTxn.BytesTransferred {
						hub.BroadcastTransactionUpdate(txn)
						// Update with a copy of the transaction
						txnCopy := *txn
						lastTransactions[txn.ID] = &txnCopy
					}
				}
			}
		}
	}()

	// Start devices monitoring
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		lastClientCount := 0

		for {
			select {
			case <-hub.done:
				return
			case <-ticker.C:
				if hub.clientStore == nil {
					continue
				}

				clients := hub.clientStore.GetClients()
				if len(clients) != lastClientCount {
					lastClientCount = len(clients)
					hub.BroadcastDevicesUpdate()
				}
			}
		}
	}()
}

// Shutdown closes the hub, stops monitoring, and closes all connections
func (hub *WebSocketHub) Shutdown() {
	// Signal monitoring goroutines to stop
	close(hub.done)

	// Close all connections
	hub.mu.Lock()
	defer hub.mu.Unlock()

	logger.Info("[WebSocket] Shutting down hub. Closing %d connections...", len(hub.connections))
	for conn := range hub.connections {
		conn.Close()
		delete(hub.connections, conn)
	}
}

// DisconnectClient disconnects a client by IP
func (hub *WebSocketHub) DisconnectClient(ip string) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for conn := range hub.connections {
		if conn.clientIP == ip {
			conn.Close()
			delete(hub.connections, conn)
			logger.Info("[WebSocket] Disconnected blocked client: %s", ip)
		}
	}
}

// HandleWebSocket handles WebSocket upgrade and connection
func (hub *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Check if client is blocked before upgrading
	clientIP := r.RemoteAddr
	if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
		clientIP = clientIP[:idx] // Strip port
	}

	// Check if this is a desktop app connection (skip client tracking)
	isDesktop := r.URL.Query().Get("desktop") == "true"

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("[WebSocket] Upgrade error: %v", err)
		return
	}

	// Create thread-safe connection wrapper with client IP
	safeConn := &SafeConn{
		conn:      conn,
		clientIP:  clientIP,
		isDesktop: isDesktop,
	}

	hub.AddConnection(safeConn)

	// Track client (only for non-desktop connections)
	if !isDesktop && hub.clientStore != nil {
		userAgent := r.UserAgent()
		logger.Info("[WebSocket] Adding client - IP: %s, UA: %s, isDesktop: %v", clientIP, userAgent, isDesktop)
		hub.clientStore.AddOrUpdateClient(userAgent, clientIP)
	} else if isDesktop {
		logger.Info("[WebSocket] SKIPPING desktop app - IP: %s, isDesktop: %v", clientIP, isDesktop)
	}

	// Send initial data
	if hub.txStore != nil {
		transactions := hub.txStore.GetAllTransactions()
		for _, txn := range transactions {
			hub.lastSentPercent[txn.ID] = int(txn.TransactionPercent)
		}
		jsonData, _ := json.Marshal(WSMessage{
			Type: "transactions_init",
			Data: map[string]interface{}{
				"transactions": transactions,
			},
		})
		safeConn.WriteMessage(websocket.TextMessage, jsonData)
	}

	if hub.clientStore != nil {
		clients := hub.clientStore.GetClients()
		jsonData, _ := json.Marshal(WSMessage{
			Type: "devices_init",
			Data: map[string]interface{}{
				"clients": clients,
			},
		})
		safeConn.WriteMessage(websocket.TextMessage, jsonData)
	}

	// Send desktop name
	hub.mu.RLock()
	desktopName := hub.desktopName
	hub.mu.RUnlock()
	jsonData, _ := json.Marshal(WSMessage{
		Type: "desktop_name_init",
		Data: map[string]interface{}{
			"name": desktopName,
		},
	})
	safeConn.WriteMessage(websocket.TextMessage, jsonData)

	// Send text transfer setting
	hub.mu.RLock()
	textTransferEnabled := hub.textTransferEnabled
	hub.mu.RUnlock()
	settingsData, _ := json.Marshal(WSMessage{
		Type: "settings_init",
		Data: map[string]interface{}{
			"textTransferEnabled": textTransferEnabled,
		},
	})
	safeConn.WriteMessage(websocket.TextMessage, settingsData)

	// Send theme settings
	hub.mu.RLock()
	themeID := hub.themeID
	accentID := hub.accentID
	hub.mu.RUnlock()
	themeData, _ := json.Marshal(WSMessage{
		Type: "theme_init",
		Data: map[string]interface{}{
			"themeId":  themeID,
			"accentId": accentID,
		},
	})
	safeConn.WriteMessage(websocket.TextMessage, themeData)

	// Keep connection alive and handle incoming messages
	go func() {
		defer hub.RemoveConnection(safeConn)

		// Set up ping/pong to keep connection alive
		safeConn.SetReadDeadline(time.Now().Add(60 * time.Second))
		safeConn.SetPongHandler(func(string) error {
			safeConn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		// Start ping ticker
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		go func() {
			for range ticker.C {
				if err := safeConn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}()

		for {
			_, msg, err := safeConn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					logger.Error("[WebSocket] Error: %v", err)
				}
				break
			}

			// Handle incoming messages
			var incomingMsg struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(msg, &incomingMsg) == nil {
				switch incomingMsg.Type {

				}
			}
		}
	}()

	fmt.Printf("[WebSocket] Client connected from %s\n", r.RemoteAddr)
}
