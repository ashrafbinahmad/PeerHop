package server

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/schollz/progressbar/v3"
)

// getDownloadsDir returns the user's Downloads directory
func getDownloadsDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		// Fallback to current directory if we can't get home dir
		return "."
	}
	downloadsDir := filepath.Join(homeDir, "Downloads")

	// Create Downloads directory if it doesn't exist
	if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
		os.MkdirAll(downloadsDir, 0755)
	}

	return downloadsDir
}

// transactionProgressWriter wraps http.ResponseWriter to track download progress
type transactionProgressWriter struct {
	http.ResponseWriter
	ProgressBar  *progressbar.ProgressBar
	TxStore      *TransactionStore
	WSHub        *WebSocketHub // WebSocket hub for broadcasting updates
	ClientStore  *ClientStore  // Check for blocked status
	TxnID        int
	ClientIP     string // Client IP for tracking and blocking
	TotalBytes   int64
	BytesWritten int64
	LastUpdate   time.Time
}

func (w *transactionProgressWriter) Write(p []byte) (int, error) {
	// Check if client is blocked
	if w.ClientStore != nil && w.ClientIP != "" && w.ClientStore.IsBlocked(w.ClientIP) {
		return 0, fmt.Errorf("client blocked")
	}

	// Check if transaction has been cancelled (global or client-specific)
	if w.TxStore != nil && w.TxnID > 0 {
		if w.TxStore.IsCancelled(w.TxnID) {
			return 0, fmt.Errorf("transfer cancelled by user")
		}
		if w.ClientIP != "" && w.TxStore.IsClientCancelled(w.TxnID, w.ClientIP) {
			return 0, fmt.Errorf("transfer cancelled by client")
		}
	}

	n, err := w.ResponseWriter.Write(p)
	if n > 0 {
		w.BytesWritten += int64(n)

		// Update progress bar if available
		if w.ProgressBar != nil {
			w.ProgressBar.Add(n)
		}

		// Update transaction progress (Throttled)
		if w.TxStore != nil && w.TxnID > 0 {
			// Update if throttled interval passed OR if download completed
			if w.BytesWritten >= w.TotalBytes || time.Since(w.LastUpdate) > 200*time.Millisecond {
				// Use client-specific progress if we have a client IP
				if w.ClientIP != "" {
					w.TxStore.UpdateClientProgress(w.TxnID, w.ClientIP, w.BytesWritten, w.TotalBytes)
				} else {
					w.TxStore.UpdateProgress(w.TxnID, w.BytesWritten, w.TotalBytes)
				}
				w.LastUpdate = time.Now()

				// Broadcast update via WebSocket
				if w.WSHub != nil {
					// Use GetTransactionCopy to avoid race conditions (concurrent map read/write)
					txn, exists := w.TxStore.GetTransactionCopy(w.TxnID)
					if exists {
						w.WSHub.BroadcastTransactionUpdate(txn)
					}
				}
			}
		}
	}
	return n, err
}

// UnifiedHandler handles both file downloads and uploads
type UnifiedHandler struct {
	mu                sync.RWMutex
	FilePath          string
	Bar               *progressbar.ProgressBar
	DevServerURL      string            // If set, proxy frontend requests to this URL (e.g., "http://localhost:5173")
	UploadedFiles     []string          // Track files uploaded from mobile
	TxStore           *TransactionStore // Transaction store for tracking all transfers
	ClientStore       *ClientStore      // Client store for tracking connected devices
	WSHub             *WebSocketHub     // WebSocket hub for real-time updates
	IsDarkMode        bool              // Track current theme
	DesktopDeviceName string            // Desktop device name (editable)
}

func (h *UnifiedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Add CORS headers to allow requests from Wails desktop app
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Type")

	// Track Client by IP (no header required)
	// Skip tracking for Wails desktop app (identified by X-Client-Type header, WebView2 in User-Agent, or wails.localhost hostname)
	if h.ClientStore != nil {
		userAgent := r.UserAgent()
		clientType := r.Header.Get("X-Client-Type")
		isWailsDesktop := clientType == "desktop" ||
			strings.Contains(userAgent, "WebView2") ||
			strings.Contains(userAgent, "Wails") ||
			strings.Contains(r.Host, "wails.localhost")

		ip := r.RemoteAddr
		if idx := strings.LastIndex(ip, ":"); idx != -1 {
			ip = ip[:idx] // Strip port
		}

		if !isWailsDesktop {
			// Track client by IP
			h.ClientStore.AddOrUpdateClient(userAgent, ip)
		}
	}

	// Check if client is blocked
	// We allow access for now so they can load the UI to see "You are blocked" message
	// But we will block specific API actions below
	if h.ClientStore != nil {
		clientIP := r.RemoteAddr
		if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
			clientIP = clientIP[:idx]
		}
		if h.ClientStore.IsBlocked(clientIP) {
			// Only strictly block critical APIs here.
			// We allow /, /assets/, /api/ws (to receive events), /api/meta etc so UI loads.
			// Block uploads/downloads/actions
			if r.Method == http.MethodPost ||
				strings.Contains(r.URL.Path, "/download") ||
				strings.Contains(r.URL.Path, "/upload") {
				http.Error(w, "Access denied", http.StatusForbidden)
				return
			}
		}
	}

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// API: Metadata - returns current state (upload mode or download mode with file info)
	if r.URL.Path == "/api/meta" {
		h.mu.RLock()
		filePath := h.FilePath
		h.mu.RUnlock()

		if filePath != "" {
			// Download mode
			stat, err := os.Stat(filePath)
			size := int64(0)
			fileName := filepath.Base(filePath)
			if err == nil {
				size = stat.Size()
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"mode":     "download",
				"filename": fileName,
				"size":     size,
				"app":      "ui",
			})
		} else {
			// Upload mode
			json.NewEncoder(w).Encode(map[string]interface{}{
				"mode": "upload",
				"app":  "ui",
			})
		}
		return
	}

	// API: Download
	if r.URL.Path == "/api/download" {
		h.mu.RLock()
		filePath := h.FilePath
		h.mu.RUnlock()

		if filePath == "" {
			http.Error(w, "No file available for download", http.StatusNotFound)
			return
		}
		h.serveFile(w, r, filePath, 0)
		return
	}

	// API: Download individual file by index (for multi-file transfers)
	if strings.HasPrefix(r.URL.Path, "/api/download-file/") {
		// Find the transaction by its download link
		downloadLink := r.URL.Path
		if h.TxStore != nil {
			// Find transaction with this download link
			txn, found := h.TxStore.FindTransactionByDownloadLink(downloadLink)
			if found && txn.ServerFilePath != "" {
				h.serveFile(w, r, txn.ServerFilePath, txn.ID)
				return
			}
		}

		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// API: Upload
	if r.URL.Path == "/api/upload" && r.Method == http.MethodPost {
		// Check if sending is blocked
		if h.ClientStore != nil {
			clientIP := r.RemoteAddr
			if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
				clientIP = clientIP[:idx]
			}
			if h.ClientStore.IsSendingBlocked(clientIP) {
				http.Error(w, "Sending is blocked", http.StatusForbidden)
				return
			}
		}
		h.handleUpload(w, r)
		return
	}

	// API: Get uploaded files list
	if r.URL.Path == "/api/uploads" {
		h.mu.RLock()
		files := h.UploadedFiles
		h.mu.RUnlock()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"files": files,
		})
		return
	}

	// API: Get connected clients
	if r.URL.Path == "/api/clients" {
		if h.ClientStore == nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"clients": []interface{}{},
			})
			return
		}
		clients := h.ClientStore.GetClients()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"clients": clients,
		})
		return
	}

	// API: Get client's own IP address
	if r.URL.Path == "/api/my-ip" {
		clientIP := r.RemoteAddr
		if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
			clientIP = clientIP[:idx]
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"ip": clientIP,
		})
		return
	}

	// API: Theme
	if r.URL.Path == "/api/theme" {
		if r.Method == http.MethodPost {
			var req struct {
				IsDarkMode bool   `json:"isDarkMode"`
				ThemeID    string `json:"themeId"`
				AccentID   string `json:"accentId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid body", http.StatusBadRequest)
				return
			}

			h.mu.Lock()
			h.IsDarkMode = req.IsDarkMode
			h.mu.Unlock()

			// Broadcast
			if h.WSHub != nil {
				if req.ThemeID != "" {
					h.WSHub.SetTheme(req.ThemeID, req.AccentID)
				} else {
					// Fallback for just IsDarkMode update
					h.WSHub.Broadcast("theme_update", map[string]interface{}{
						"isDarkMode": req.IsDarkMode,
					})
				}
			}

			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}

		// GET
		h.mu.RLock()
		isDark := h.IsDarkMode
		h.mu.RUnlock()

		var themeID, accentID string
		if h.WSHub != nil {
			themeID, accentID = h.WSHub.GetTheme()
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"isDarkMode": isDark,
			"themeId":    themeID,
			"accentId":   accentID,
		})
		return
	}

	// API: Settings
	if r.URL.Path == "/api/settings" {
		if r.Method == http.MethodPost {
			var req struct {
				TextTransferEnabled bool `json:"textTransferEnabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid body", http.StatusBadRequest)
				return
			}

			// Update in WebSocket hub and broadcast
			if h.WSHub != nil {
				h.WSHub.SetTextTransferEnabled(req.TextTransferEnabled)
			}

			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}

		// GET
		enabled := false
		if h.WSHub != nil {
			enabled = h.WSHub.GetTextTransferEnabled()
		}

		json.NewEncoder(w).Encode(map[string]bool{
			"textTransferEnabled": enabled,
		})
		return
	}

	// API: Desktop Device Name
	if r.URL.Path == "/api/desktop-name" {
		if r.Method == http.MethodPost {
			var req struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid body", http.StatusBadRequest)
				return
			}

			h.mu.Lock()
			h.DesktopDeviceName = req.Name
			h.mu.Unlock()

			// Broadcast to all clients via WebSocket
			if h.WSHub != nil {
				h.WSHub.SetDesktopName(req.Name)
			}

			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}

		// GET
		h.mu.RLock()
		name := h.DesktopDeviceName
		h.mu.RUnlock()

		// If empty, try to get from WebSocket hub
		if name == "" && h.WSHub != nil {
			name = h.WSHub.GetDesktopName()
		}

		json.NewEncoder(w).Encode(map[string]string{
			"name": name,
		})
		return
	}

	// API: WebSocket connection
	if r.URL.Path == "/api/ws" {
		if h.WSHub != nil {
			h.WSHub.HandleWebSocket(w, r)
		} else {
			http.Error(w, "WebSocket not available", http.StatusServiceUnavailable)
		}
		return
	}

	// API: Get all transactions
	if r.URL.Path == "/api/transactions" {
		if h.TxStore == nil {
			fmt.Println("[API] TxStore is nil, returning empty transactions")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"transactions": []interface{}{},
			})
			return
		}

		transactions := h.TxStore.GetAllTransactions()
		// fmt.Printf("[API] Returning %d transactions\n", len(transactions), transactions.)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"transactions": transactions,
		})
		return
	}

	// API: Send text message
	if r.URL.Path == "/api/send-text" && r.Method == http.MethodPost {
		var req struct {
			Text     string `json:"text"`
			SenderID string `json:"senderId"` // "server" or client ID
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Check if sending is blocked
		if h.ClientStore != nil {
			clientIP := r.RemoteAddr
			if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
				clientIP = clientIP[:idx]
			}
			if h.ClientStore.IsSendingBlocked(clientIP) {
				http.Error(w, "Sending is blocked", http.StatusForbidden)
				return
			}
		}

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		// Create text transaction
		// Get client IP from RemoteAddr (strip port)
		clientIP := r.RemoteAddr
		if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
			clientIP = clientIP[:idx]
		}

		// Use IP as sender ID for client-sent transactions
		senderID := req.SenderID
		if senderID == "" {
			senderID = clientIP
		}
		if senderID == "" {
			senderID = "unknown_client"
		}

		txn := &Transaction{
			Type:               TransactionTypeText,
			SenderID:           senderID,
			TextContent:        req.Text,
			TransactionPercent: 0,
			Status:             "completed",
			ClientIP:           clientIP,
		}
		fmt.Printf("[API] Created text txn from client IP: %s\n", clientIP)

		id := h.TxStore.AddTransaction(txn)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"id":      id,
		})
		return
	}

	// API: Cancel download
	if strings.HasPrefix(r.URL.Path, "/api/cancel-download/") && r.Method == http.MethodPost {
		idStr := strings.TrimPrefix(r.URL.Path, "/api/cancel-download/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
			return
		}

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		// Try to get client IP from request body (for desktop-initiated cancellations)
		var req struct {
			ClientIP string `json:"clientIp"`
		}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&req)
		}

		// Use provided clientIp from body, or fall back to RemoteAddr (for client cancelling their own)
		clientIP := req.ClientIP
		if clientIP == "" {
			clientIP = r.RemoteAddr
			if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
				clientIP = clientIP[:idx]
			}
		}

		// Use client-specific cancellation
		success := h.TxStore.CancelClientDownload(id, clientIP)
		if !success {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Cancelled download for client %s on transaction %d (progress reset to 0%%)\n", clientIP, id)

		// Broadcast the reset transaction state via WebSocket
		if h.WSHub != nil {
			txn, exists := h.TxStore.GetTransactionCopy(id)
			if exists {
				h.WSHub.BroadcastTransactionUpdate(txn)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Update client name
	if r.URL.Path == "/api/update-client-name" && r.Method == http.MethodPost {
		var req struct {
			IP   string `json:"ip"`
			Name string `json:"name"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if h.ClientStore == nil {
			http.Error(w, "Client store not initialized", http.StatusInternalServerError)
			return
		}

		success := h.ClientStore.UpdateClientName(req.IP, req.Name)
		if !success {
			http.Error(w, "Client not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Updated name for client %s to: %s\n", req.IP, req.Name)

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Block client
	if r.URL.Path == "/api/block-client" && r.Method == http.MethodPost {
		var req struct {
			IP string `json:"ip"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if h.ClientStore == nil {
			http.Error(w, "Client store not initialized", http.StatusInternalServerError)
			return
		}

		success := h.ClientStore.BlockClient(req.IP)
		if !success {
			http.Error(w, "Client not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Blocked client with IP: %s\n", req.IP)

		fmt.Printf("[API] Blocked client with IP: %s\n", req.IP)

		// Note: We do NOT disconnect WebSocket completely anymore,
		// so the client can receive the update that it is blocked.
		// However, we still rely on the ServeHTTP blocked check to prevent actions.

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Block Sending
	if r.URL.Path == "/api/block-sending" && r.Method == http.MethodPost {
		var req struct {
			IP string `json:"ip"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if h.ClientStore == nil {
			http.Error(w, "Client store not initialized", http.StatusInternalServerError)
			return
		}

		success := h.ClientStore.BlockSending(req.IP)
		if !success {
			http.Error(w, "Client not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Blocked sending for client with IP: %s\n", req.IP)

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Unblock Sending
	if r.URL.Path == "/api/unblock-sending" && r.Method == http.MethodPost {
		var req struct {
			IP string `json:"ip"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if h.ClientStore == nil {
			http.Error(w, "Client store not initialized", http.StatusInternalServerError)
			return
		}

		success := h.ClientStore.UnblockSending(req.IP)
		if !success {
			http.Error(w, "Client not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Unblocked sending for client with IP: %s\n", req.IP)

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Unblock client
	if r.URL.Path == "/api/unblock-client" && r.Method == http.MethodPost {
		var req struct {
			IP string `json:"ip"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if h.ClientStore == nil {
			http.Error(w, "Client store not initialized", http.StatusInternalServerError)
			return
		}

		success := h.ClientStore.UnblockClient(req.IP)
		if !success {
			http.Error(w, "Client not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Unblocked client with IP: %s\n", req.IP)

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Cancel transaction (generic, e.g. stopping an incoming upload)
	if strings.HasPrefix(r.URL.Path, "/api/cancel-transaction/") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		idStr := strings.TrimPrefix(r.URL.Path, "/api/cancel-transaction/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
			return
		}

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		// Cancel the transaction globally
		success := h.TxStore.CancelTransaction(id)
		if !success {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}

		fmt.Printf("[API] Cancelled transaction %d\n", id)

		// Broadcast update
		if h.WSHub != nil {
			txn, exists := h.TxStore.GetTransactionCopy(id)
			if exists {
				h.WSHub.BroadcastTransactionUpdate(txn)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// API: Get transaction progress by ID
	if strings.HasPrefix(r.URL.Path, "/api/transaction/") {
		idStr := strings.TrimPrefix(r.URL.Path, "/api/transaction/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
			return
		}

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		txn, exists := h.TxStore.GetTransaction(id)
		if !exists {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(txn)
		return
	}

	// API: View file (preview for received files)
	if strings.HasPrefix(r.URL.Path, "/api/view/") {
		idStr := strings.TrimPrefix(r.URL.Path, "/api/view/")
		id, err := strconv.Atoi(idStr)
		if err == nil && h.TxStore != nil {
			txn, exists := h.TxStore.GetTransaction(id)
			if exists && txn.ServerFilePath != "" {
				h.serveFile(w, r, txn.ServerFilePath, -1)
				return
			}
		}
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Development mode: Proxy to Vite dev server
	if h.DevServerURL != "" {
		h.proxyToDevServer(w, r)
		return
	}

	// Serve Static Assets or Index
	fsys, _ := fs.Sub(distFS, "dist")

	// Add cache-control headers to prevent browser caching
	// This ensures mobile browsers always load the latest UI code
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// If path starts with /assets/, serve from fs
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		http.FileServer(http.FS(fsys)).ServeHTTP(w, r)
		return
	}

	// Otherwise serve index.html (SPA)
	index, err := fsys.Open("index.html")
	if err != nil {
		http.Error(w, "UI not found", http.StatusInternalServerError)
		return
	}
	defer index.Close()
	stat, _ := index.Stat()

	if seeker, ok := index.(io.ReadSeeker); ok {
		http.ServeContent(w, r, "index.html", stat.ModTime(), seeker)
	} else {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// proxyToDevServer proxies requests to the Vite dev server
func (h *UnifiedHandler) proxyToDevServer(w http.ResponseWriter, r *http.Request) {
	targetURL := h.DevServerURL + r.URL.Path
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, "Proxy error", http.StatusInternalServerError)
		return
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, "Dev server not available", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (h *UnifiedHandler) serveFile(w http.ResponseWriter, r *http.Request, filePath string, forceTxnID int) {
	f, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "Could not get file info", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", stat.Name()))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))

	// Find existing transaction to update progress
	var txnID int
	var txStore *TransactionStore

	if forceTxnID != -1 && h.TxStore != nil {
		if forceTxnID > 0 {
			// Use the explicitly requested transaction ID
			txnID = forceTxnID
			txStore = h.TxStore
		} else {
			// Fallback: Find latest transaction by filename
			id, found := h.TxStore.FindLatestTransactionByFilename(stat.Name())
			if found {
				txnID = id
				txStore = h.TxStore
			}
		}
	}

	// Check if this is a preview request (thumbnail)
	isPreview := r.URL.Query().Get("preview") == "true"

	// Create a custom writer that tracks progress (mainly for CLI progress bar if active)
	// We do NOT create a new Transaction here, because that would create a duplicate
	// "new message" in the UI chat for every download action.
	// Instead, we try to attach to the existing "File Available" transaction if it exists.
	var writer http.ResponseWriter
	if isPreview {
		// Just write directly without tracking progress
		writer = w
	} else {
		clientIP := r.RemoteAddr
		if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
			clientIP = clientIP[:idx]
		}
		pw := &transactionProgressWriter{
			ResponseWriter: w,
			ProgressBar:    h.Bar,
			TxStore:        txStore, // Use the store only if we found a valid transaction to update
			WSHub:          h.WSHub, // Pass WSHub for broadcasting updates
			ClientStore:    h.ClientStore,
			TxnID:          txnID,
			ClientIP:       clientIP, // Use IP for client-specific tracking
			TotalBytes:     stat.Size(),
			BytesWritten:   0,
		}
		writer = pw
	}

	http.ServeContent(writer, r, stat.Name(), stat.ModTime(), f)
}

func (h *UnifiedHandler) handleUpload(w http.ResponseWriter, r *http.Request) {
	// 50 GB limit max
	r.Body = http.MaxBytesReader(w, r.Body, 50<<30)

	// Use MultipartReader for streaming directly from network to disk
	// This avoids reading the whole file into RAM/TempFile before processing
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "Invalid multipart data", http.StatusBadRequest)
		return
	}

	var saved []string
	var transactionIDs []int
	var currentFileSize int64
	downloadsDir := getDownloadsDir()

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Printf("Error reading part: %v\n", err)
			break
		}

		// Check for file_size field
		if part.FormName() == "file_size" {
			data, _ := io.ReadAll(part)
			if size, err := strconv.ParseInt(string(data), 10, 64); err == nil {
				currentFileSize = size
			}
			continue
		}

		// Only process "file" field
		if part.FormName() != "file" {
			// Important: Must read the part to allow NextPart() to proceed
			io.Copy(io.Discard, part)
			continue
		}

		filename := part.FileName()
		if filename == "" {
			continue
		}

		// Handle filename collision
		filename = filepath.Base(filename)
		fullPath := filepath.Join(downloadsDir, filename)

		// Check for collision in Downloads folder
		if _, err := os.Stat(fullPath); err == nil {
			ext := filepath.Ext(filename)
			name := strings.TrimSuffix(filename, ext)
			filename = fmt.Sprintf("%s_%d%s", name, time.Now().Unix(), ext)
			fullPath = filepath.Join(downloadsDir, filename)
		}

		// Get absolute path
		absPath, _ := filepath.Abs(fullPath)

		// Get client IP from RemoteAddr
		uploadClientIP := r.RemoteAddr
		if idx := strings.LastIndex(uploadClientIP, ":"); idx != -1 {
			uploadClientIP = uploadClientIP[:idx]
		}

		// Create transaction for this file upload
		var txnID int
		if h.TxStore != nil {
			txn := &Transaction{
				Type:               TransactionTypeFile,
				SenderID:           uploadClientIP,
				Filename:           filename,
				FileSize:           currentFileSize, // Use strict file size from client
				UploadLink:         "/api/upload",
				SavedInLocation:    absPath,
				ServerFilePath:     absPath, // NEW
				TransactionPercent: 0,
				Status:             "in_progress",
				ClientIP:           uploadClientIP,
			}
			txnID = h.TxStore.AddTransaction(txn)
			h.TxStore.SetDownloadLink(txnID, fmt.Sprintf("/api/download-file/%d", txnID)) // Enable download with progress
			transactionIDs = append(transactionIDs, txnID)
			fmt.Printf("[Upload] Created transaction ID=%d for file: %s (Streaming)\n", txnID, filename)
		}

		dst, err := os.Create(fullPath)
		if err != nil {
			fmt.Printf("Error creating file %s: %v\n", fullPath, err)
			if h.TxStore != nil && txnID > 0 {
				h.TxStore.UpdateStatus(txnID, "failed")
			}
			http.Error(w, fmt.Sprintf("Error creating file: %v", err), http.StatusInternalServerError)
			return
		}

		// Copy with progress tracking
		written := int64(0)
		buf := make([]byte, 1024*1024) // 1MB buffer
		lastUpdate := time.Now()

		for {
			nr, er := part.Read(buf)
			if nr > 0 {
				nw, ew := dst.Write(buf[0:nr])
				if nw > 0 {
					written += int64(nw)

					// Throttle progress updates to avoid mutex locking on every chunk
					// Update max 5 times per second (200ms)
					if h.TxStore != nil && txnID > 0 {
						// Check for cancellation immediately (every chunk)
						if h.TxStore.IsCancelled(txnID) {
							fmt.Printf("[Upload] Cancellation detected for txn %d\n", txnID)
							if h.TxStore != nil && txnID > 0 {
								h.TxStore.UpdateStatus(txnID, "cancelled")
								// Force broadcast
								if txn, exists := h.TxStore.GetTransactionCopy(txnID); exists {
									h.WSHub.BroadcastTransactionUpdate(txn)
								}
							}
							// Remove partial file
							dst.Close()
							os.Remove(fullPath)

							// Error 499 Client Closed Request
							http.Error(w, "Upload cancelled", 499)
							return
						}

						// Throttle progress updates to avoid mutex locking on every chunk
						// Update max 5 times per second (200ms)
						if time.Since(lastUpdate) > 200*time.Millisecond {
							// Check if client is blocked
							clientIP := r.RemoteAddr
							if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
								clientIP = clientIP[:idx]
							}
							if h.ClientStore != nil && (h.ClientStore.IsBlocked(clientIP) || h.ClientStore.IsSendingBlocked(clientIP)) {
								// Cleanup and return
								dst.Close()
								os.Remove(fullPath)
								fmt.Printf("[Upload] Terminated upload from blocked client: %s\n", clientIP)
								http.Error(w, "Client blocked", http.StatusForbidden)
								return
							}

							h.TxStore.UpdateProgress(txnID, written, currentFileSize)
							// Broadcast update including speed info implicitly via BytesTransferred
							if txn, exists := h.TxStore.GetTransactionCopy(txnID); exists {
								h.WSHub.BroadcastTransactionUpdate(txn)
							}
							lastUpdate = time.Now()
						}
					}
				}
				if ew != nil {
					err = ew
					break
				}
				if nr != nw {
					err = io.ErrShortWrite
					break
				}
			}
			if er != nil {
				if er != io.EOF {
					err = er
				}
				break
			}
		}
		dst.Close() // Close explicitly to flush buffers

		if err != nil {
			// Check if error is due to cancellation (client disconnect or context cancel)
			isCancelled := strings.Contains(err.Error(), "unexpected EOF") ||
				strings.Contains(err.Error(), "context canceled") ||
				strings.Contains(err.Error(), "connection reset") ||
				strings.Contains(err.Error(), "multipart: NextPart: EOF")

			if isCancelled {
				fmt.Printf("Upload cancelled for file %s: %v\n", fullPath, err)
				// Delete the partial file
				os.Remove(fullPath)
			} else {
				fmt.Printf("Error saving file %s: %v\n", fullPath, err)
			}

			if h.TxStore != nil && txnID > 0 {
				status := "failed"
				if isCancelled {
					status = "cancelled"
				}
				h.TxStore.UpdateStatus(txnID, status)
				// Force broadcast of status so UI updates
				if txn, exists := h.TxStore.GetTransactionCopy(txnID); exists {
					h.TxStore.UpdateProgress(txnID, written, currentFileSize)
					h.WSHub.BroadcastTransactionUpdate(txn)
				}
			}

			if isCancelled {
				// Client closed connection, so writing response might fail, but try anyway
				http.Error(w, "Upload cancelled", 499)
			} else {
				http.Error(w, fmt.Sprintf("Error saving file: %v", err), http.StatusInternalServerError)
			}
			return
		}

		saved = append(saved, filename)
		fmt.Printf("\nReceived file: %s (%d bytes) -> %s\n", filename, written, absPath)

		// Mark transaction as completed
		if h.TxStore != nil && txnID > 0 {
			h.TxStore.UpdateProgress(txnID, written, written) // Force 100%
			h.TxStore.SetFileSize(txnID, written)             // Update final size
			h.TxStore.UpdateStatus(txnID, "completed")
		}

		// Reset file size for next file
		currentFileSize = 0
	}

	// Return JSON success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":        true,
		"files":          saved,
		"count":          len(saved),
		"transactionIds": transactionIDs,
	})

	// Add to uploaded files list
	h.mu.Lock()
	h.UploadedFiles = append(h.UploadedFiles, saved...)
	h.mu.Unlock()
}

// SetFilePath updates the file path for download mode
func (h *UnifiedHandler) SetFilePath(path string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.FilePath = path
}

// ClearFilePath clears the file path (back to upload mode)
func (h *UnifiedHandler) ClearFilePath() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.FilePath = ""
}

// Shutdown cleans up resources
func (h *UnifiedHandler) Shutdown() {
	if h.WSHub != nil {
		h.WSHub.Shutdown()
	}
}

// NewUnifiedHandler creates a new unified handler
// devServerURL: optional URL to proxy frontend requests in development (e.g., "http://localhost:5173")
func NewUnifiedHandler(devServerURL string) *UnifiedHandler {
	txStore := NewTransactionStore()
	clientStore := NewClientStore()
	wsHub := NewWebSocketHub(txStore, clientStore)

	// Start WebSocket monitoring in background
	wsHub.StartMonitoring()

	return &UnifiedHandler{
		DevServerURL: devServerURL,
		TxStore:      txStore,
		ClientStore:  clientStore,
		WSHub:        wsHub,
		IsDarkMode:   true, // Default to Dark Mode
	}
}
