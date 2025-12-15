package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

// WebSocketHub manages all active WebSocket connections
type WebSocketHub struct {
	mu          sync.RWMutex
	connections map[*websocket.Conn]bool
	txStore     *TransactionStore
	clientStore *ClientStore

	// Track last sent percentage for each transaction to only send whole number changes
	lastSentPercent map[int]int
}

// NewWebSocketHub creates a new WebSocket hub
func NewWebSocketHub(txStore *TransactionStore, clientStore *ClientStore) *WebSocketHub {
	return &WebSocketHub{
		connections:     make(map[*websocket.Conn]bool),
		txStore:         txStore,
		clientStore:     clientStore,
		lastSentPercent: make(map[int]int),
	}
}

// AddConnection adds a new WebSocket connection
func (hub *WebSocketHub) AddConnection(conn *websocket.Conn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.connections[conn] = true
	log.Printf("[WebSocket] New connection added. Total connections: %d", len(hub.connections))
}

// RemoveConnection removes a WebSocket connection
func (hub *WebSocketHub) RemoveConnection(conn *websocket.Conn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	delete(hub.connections, conn)
	conn.Close()
	log.Printf("[WebSocket] Connection removed. Total connections: %d", len(hub.connections))
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
		log.Printf("[WebSocket] Error marshaling message: %v", err)
		return
	}

	for conn := range hub.connections {
		err := conn.WriteMessage(websocket.TextMessage, jsonData)
		if err != nil {
			log.Printf("[WebSocket] Error writing to connection: %v", err)
			// Connection will be cleaned up by the read loop
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
	// 4. Status changed to completed, pending, or in_progress
	shouldBroadcast := !exists ||
		currentPercent > lastPercent ||
		currentPercent < lastPercent || // Reset to 0
		txn.Status == "completed" ||
		txn.Status == "pending" // Allow retry after cancel

	if shouldBroadcast {
		hub.lastSentPercent[txn.ID] = currentPercent
		log.Printf("[WebSocket] Broadcasting txn %d: %s %.0f%% (status: %s)",
			txn.ID, txn.Filename, txn.TransactionPercent, txn.Status)
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

// StartMonitoring starts monitoring transactions and devices for changes
func (hub *WebSocketHub) StartMonitoring() {
	// Start transaction monitoring
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		lastTransactionCount := 0
		lastTransactions := make(map[int]*Transaction)

		for range ticker.C {
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
	}()

	// Start devices monitoring
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		lastClientCount := 0

		for range ticker.C {
			if hub.clientStore == nil {
				continue
			}

			clients := hub.clientStore.GetClients()
			if len(clients) != lastClientCount {
				lastClientCount = len(clients)
				hub.BroadcastDevicesUpdate()
			}
		}
	}()
}

// HandleWebSocket handles WebSocket upgrade and connection
func (hub *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	hub.AddConnection(conn)

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
		conn.WriteMessage(websocket.TextMessage, jsonData)
	}

	if hub.clientStore != nil {
		clients := hub.clientStore.GetClients()
		jsonData, _ := json.Marshal(WSMessage{
			Type: "devices_init",
			Data: map[string]interface{}{
				"clients": clients,
			},
		})
		conn.WriteMessage(websocket.TextMessage, jsonData)
	}

	// Keep connection alive and handle incoming messages
	go func() {
		defer hub.RemoveConnection(conn)

		// Set up ping/pong to keep connection alive
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		// Start ping ticker
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		go func() {
			for range ticker.C {
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}()

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WebSocket] Error: %v", err)
				}
				break
			}
		}
	}()

	fmt.Printf("[WebSocket] Client connected from %s\n", r.RemoteAddr)
}
