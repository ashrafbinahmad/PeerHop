package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"peerhop/pkg/logger"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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

// generateSecurityToken generates a random security token
func generateSecurityToken() string {
	bytes := make([]byte, 16) // 16 bytes = 32 hex characters
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based token if crypto/rand fails
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
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
	BytesWritten int64 // Bytes written in THIS request
	BytesOffset  int64 // Starting offset for range requests
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

		// Calculate cumulative bytes (including offset for range requests)
		cumulativeBytes := w.BytesOffset + w.BytesWritten

		// Update progress bar if available
		if w.ProgressBar != nil {
			w.ProgressBar.Add(n)
		}

		// Update transaction progress (Throttled)
		if w.TxStore != nil && w.TxnID > 0 {
			// Update if throttled interval passed OR if download completed
			if cumulativeBytes >= w.TotalBytes || time.Since(w.LastUpdate) > 200*time.Millisecond {
				// Use client-specific range-based progress if we have a client IP
				// This properly handles parallel range requests from Android browsers
				if w.ClientIP != "" {
					// Calculate the range end (current position)
					rangeStart := w.BytesOffset
					rangeEnd := cumulativeBytes - 1 // End is inclusive

					// CRITICAL: Cap range end at file size to prevent extending beyond file boundaries
					// This fixes the issue where ranges continue beyond 100% completion
					if rangeEnd >= w.TotalBytes {
						rangeEnd = w.TotalBytes - 1
					}

					w.TxStore.UpdateClientRangeProgress(w.TxnID, w.ClientIP, rangeStart, rangeEnd, w.TotalBytes)
				} else {
					// Fallback to global progress (desktop downloads)
					w.TxStore.UpdateProgress(w.TxnID, cumulativeBytes, w.TotalBytes)
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

				// Stop processing if we've reached the total file size
				if cumulativeBytes >= w.TotalBytes {
					return n, err
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
	SecurityToken     string            // Random security token for client API authentication (file transfer, viewing)
	SecurityEnabled   bool              // Whether security token validation is enabled
	AdminToken        string            // Random admin token for desktop control operations (settings, theme, blocking)
	SettingsManager   *SettingsManager  // Settings manager for persisting settings
}

// SecuritySettings holds tokens and status
type SecuritySettings struct {
	SecurityToken   string `json:"securityToken"`
	AdminToken      string `json:"adminToken"`
	SecurityEnabled bool   `json:"securityEnabled"`
}

// GetSecuritySettings returns the current security tokens and status safely
func (h *UnifiedHandler) GetSecuritySettings() SecuritySettings {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return SecuritySettings{
		SecurityToken:   h.SecurityToken,
		AdminToken:      h.AdminToken,
		SecurityEnabled: h.SecurityEnabled,
	}
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

	// Security token validation - only when enabled
	h.mu.RLock()
	securityEnabled := h.SecurityEnabled
	securityToken := h.SecurityToken
	adminToken := h.AdminToken
	h.mu.RUnlock()

	// Only validate if security is enabled
	if securityEnabled {
		// Allow certain endpoints without token (for UI loading and initial connection)
		// - / and /assets/ for serving the web UI
		// - /src/ for Vite dev server source files
		// - /node_modules/ for Vite dev server dependencies
		// - /@vite/, /@react-refresh for Vite dev server
		// - /favicon.ico and other static assets
		// - /api/settings (GET only) for mobile to fetch the security token
		// - /api/theme (GET only) for mobile to get theme settings for UI
		// - /api/meta for initial connection check
		isPublicEndpoint := false
		if r.URL.Path == "/" ||
			strings.HasPrefix(r.URL.Path, "/assets/") ||
			strings.HasPrefix(r.URL.Path, "/src/") ||
			strings.HasPrefix(r.URL.Path, "/node_modules/") ||
			strings.HasPrefix(r.URL.Path, "/@vite/") ||
			strings.HasPrefix(r.URL.Path, "/@react-refresh") ||
			strings.HasPrefix(r.URL.Path, "/@id/") ||
			strings.HasPrefix(r.URL.Path, "/wailsjs/") || // Wails runtime files
			r.URL.Path == "/favicon.ico" ||
			strings.HasSuffix(r.URL.Path, ".js") ||
			strings.HasSuffix(r.URL.Path, ".mjs") ||
			strings.HasSuffix(r.URL.Path, ".css") ||
			strings.HasSuffix(r.URL.Path, ".tsx") ||
			strings.HasSuffix(r.URL.Path, ".ts") ||
			strings.HasSuffix(r.URL.Path, ".jsx") ||
			strings.HasSuffix(r.URL.Path, ".map") {
			isPublicEndpoint = true
		} else if r.URL.Path == "/api/settings" && r.Method == http.MethodGet {
			isPublicEndpoint = true
		} else if r.URL.Path == "/api/theme" && r.Method == http.MethodGet {
			isPublicEndpoint = true // Theme GET is public for UI rendering
		} else if r.URL.Path == "/api/meta" {
			isPublicEndpoint = true
		}

		// Admin-only endpoints (require admin token)
		// These endpoints allow desktop to control settings, theme, and client management
		isAdminEndpoint := false
		if r.URL.Path == "/api/settings" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/theme" && r.Method == http.MethodPost {
			isAdminEndpoint = true // Only theme POST requires admin token
		} else if r.URL.Path == "/api/desktop-name" {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/update-client-name" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/block-client" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/unblock-client" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/block-sending" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		} else if r.URL.Path == "/api/unblock-sending" && r.Method == http.MethodPost {
			isAdminEndpoint = true
		}

		// Validate tokens for ALL clients on protected endpoints (no desktop exemption)
		if !isPublicEndpoint {
			providedToken := r.URL.Query().Get("security")
			providedAdminToken := r.URL.Query().Get("admin")

			// Admin endpoints require admin token
			if isAdminEndpoint {
				if providedAdminToken != adminToken || adminToken == "" {
					http.Error(w, "Invalid or missing admin token", http.StatusForbidden)
					return
				}
			} else {
				// Regular endpoints accept either client token OR admin token
				// (admin token has higher privileges and can access everything)
				validClientToken := providedToken == securityToken && securityToken != ""
				validAdminToken := providedAdminToken == adminToken && adminToken != ""

				if !validClientToken && !validAdminToken {
					http.Error(w, "Invalid or missing security token", http.StatusUnauthorized)
					return
				}
			}
		} else {
		}
	} else {
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
			if h.ClientStore.IsBlocked(clientIP) || h.ClientStore.IsSendingBlocked(clientIP) {
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

			// Save settings to disk
			if h.SettingsManager != nil {
				settings := h.SettingsManager.LoadSettings()
				settings.IsDarkMode = req.IsDarkMode
				if req.ThemeID != "" {
					settings.ThemeID = req.ThemeID
				}
				if req.AccentID != "" {
					settings.AccentID = req.AccentID
				}
				h.SettingsManager.SaveSettings(settings)
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
				SecurityEnabled     bool `json:"securityEnabled"`
				MultiClientEnabled  bool `json:"multiClientEnabled"`
				StaticPortEnabled   bool   `json:"staticPortEnabled"`
				StaticPort          int    `json:"staticPort"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid body", http.StatusBadRequest)
				return
			}

			// Update text transfer in WebSocket hub and broadcast
			if h.WSHub != nil {
				h.WSHub.SetTextTransferEnabled(req.TextTransferEnabled)
			}

			// Update multi-client mode setting
			if h.WSHub != nil {
				h.WSHub.SetMultiClientEnabled(req.MultiClientEnabled)
			}

			// Update security enabled setting
			h.mu.Lock()
			h.SecurityEnabled = req.SecurityEnabled
			h.mu.Unlock()

			// Broadcast security settings update
			if h.WSHub != nil {
				h.WSHub.Broadcast("security_update", map[string]interface{}{
					"securityEnabled": req.SecurityEnabled,
					"securityToken":   h.SecurityToken,
				})
			}

			// Save settings to disk
			if h.SettingsManager != nil {
				settings := h.SettingsManager.LoadSettings()
				settings.TextTransferEnabled = req.TextTransferEnabled
				settings.SecurityEnabled = req.SecurityEnabled
				settings.MultiClientEnabled = req.MultiClientEnabled
				settings.StaticPortEnabled = req.StaticPortEnabled
				settings.StaticPort = req.StaticPort
				h.SettingsManager.SaveSettings(settings)
			}

			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}

		// GET
		enabled := false
		multiClientEnabled := false
		if h.WSHub != nil {
			enabled = h.WSHub.GetTextTransferEnabled()
			multiClientEnabled = h.WSHub.GetMultiClientEnabled()
		}

		h.mu.RLock()
		securityEnabled := h.SecurityEnabled
		// Tokens (Client/Admin) are NOT exposed here for security
		h.mu.RUnlock()

		// Check if this is a desktop client
		userAgent := r.UserAgent()
		clientType := r.Header.Get("X-Client-Type")
		isWailsDesktop := clientType == "desktop" ||
			strings.Contains(userAgent, "WebView2") ||
			strings.Contains(userAgent, "Wails") ||
			strings.Contains(r.Host, "wails.localhost")

		response := map[string]interface{}{
			"textTransferEnabled": enabled,
			"securityEnabled":     securityEnabled,
			"multiClientEnabled":  multiClientEnabled,
			"staticPortEnabled":   false, // Initial fallback
			"staticPort":          9090,  // Initial fallback
			"isDesktop":           isWailsDesktop, 
		}

		if h.SettingsManager != nil {
			settings := h.SettingsManager.LoadSettings()
			response["staticPortEnabled"] = settings.StaticPortEnabled
			response["staticPort"] = settings.StaticPort
		}
		// Security Token is NO LONGER returned here
		// Mobile clients MUST obtain token via QR Code URL

		json.NewEncoder(w).Encode(response)
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

			// Save settings to disk
			if h.SettingsManager != nil {
				settings := h.SettingsManager.LoadSettings()
				settings.DesktopDeviceName = req.Name
				h.SettingsManager.SaveSettings(settings)
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
			json.NewEncoder(w).Encode(map[string]interface{}{
				"transactions": []interface{}{},
			})
			return
		}

		transactions := h.TxStore.GetAllTransactions()
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
			if h.ClientStore.IsBlocked(clientIP) || h.ClientStore.IsSendingBlocked(clientIP) {
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

		id := h.TxStore.AddTransaction(txn)

		// Broadcast new text transaction
		if h.WSHub != nil {
			if txnCopy, exists := h.TxStore.GetTransactionCopy(id); exists {
				h.WSHub.BroadcastTransactionUpdate(txnCopy)
			}
		}

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

	// API: Delete transaction
	if strings.HasPrefix(r.URL.Path, "/api/delete-transaction/") && r.Method == http.MethodPost {
		idStr := strings.TrimPrefix(r.URL.Path, "/api/delete-transaction/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
			return
		}

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		var req struct {
			DeleteFile bool `json:"deleteFile"`
		}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&req)
		}

		txn, exists := h.TxStore.GetTransaction(id)
		if !exists {
			http.Error(w, "Transaction not found", http.StatusNotFound)
			return
		}

		// Delete file if requested and it's a file transaction
		if req.DeleteFile && txn.Type == TransactionTypeFile {
			filePath := ""
			if txn.SenderID == SenderServer {
				filePath = txn.ServerFilePath
			} else {
				// For files from client, use SavedInLocation
				filePath = txn.SavedInLocation
			}

			if filePath != "" {
				err := os.Remove(filePath)
				if err != nil {
					fmt.Printf("Failed to delete file from disk: %v\n", err)
				} else {
					fmt.Printf("Deleted file from disk: %s\n", filePath)
				}
			}
		}

		h.TxStore.DeleteTransaction(id)

		// Broadcast removal via WebSocket
		if h.WSHub != nil {
			h.WSHub.Broadcast("transaction_deleted", map[string]interface{}{
				"id": id,
			})
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

		// Cancel all active transfers for this client (uploads and downloads)
		if h.TxStore != nil {
			h.TxStore.CancelClientTransactions(req.IP)
		}

		// Note: We do NOT disconnect WebSocket completely anymore,
		// so the client can receive the update that it is blocked.
		// However, we still rely on the ServeHTTP blocked check to prevent actions.

		// Broadcast update (Devices and Transactions)
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
			// Also broadcast all transactions after bulk cancellation
			if h.TxStore != nil {
				txns := h.TxStore.GetAllTransactions()
				h.WSHub.Broadcast("transactions_update", map[string]interface{}{
					"transactions": txns,
				})
			}
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

		// Note: we can also cancel active uploads from this client specifically if needed
		if h.TxStore != nil {
			// Find and cancel transactions where SenderID == req.IP
			txns := h.TxStore.GetAllTransactions()
			for _, txn := range txns {
				if txn.SenderID == req.IP && txn.Status == "in_progress" {
					h.TxStore.CancelTransaction(txn.ID)
				}
			}
		}

		// Broadcast update
		if h.WSHub != nil {
			h.WSHub.BroadcastDevicesUpdate()
			// Also broadcast transaction updates
			if h.TxStore != nil {
				h.WSHub.Broadcast("transactions_update", map[string]interface{}{
					"transactions": h.TxStore.GetAllTransactions(),
				})
			}
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
		if h.proxyToDevServer(w, r) {
			return
		}
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
	if r.URL.Path == "/" || r.URL.Path == "/index.html" {
		logger.Info("[UI] Serving mobile UI from embedded dist")
	}

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

// proxyToDevServer proxies requests to the Vite dev server. Returns true if proxying was successful.
func (h *UnifiedHandler) proxyToDevServer(w http.ResponseWriter, r *http.Request) bool {
	// Handle WebSocket proxying for HMR
	if websocket.IsWebSocketUpgrade(r) {
		h.proxyWebSocket(w, r)
		return true
	}

	targetURL := h.DevServerURL + r.URL.Path
	if r.URL.Path == "/" || r.URL.Path == "/index.html" {
		logger.Info("[Proxy] Serving mobile UI from dev server at %s", h.DevServerURL)
	}

	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		logger.Error("[Proxy] Error creating request: %v", err)
		return false
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Important for Vite/HMR
	proxyReq.Header.Set("Host", "localhost:5173")

	client := &http.Client{
		Timeout: 5 * time.Second,
	}
	resp, err := client.Do(proxyReq)
	if err != nil {
		// Log once in a while to avoid spamming if server is down
		logger.Warn("[Proxy] Dev server %s not reachable: %v (Falling back to embedded UI)", h.DevServerURL, err)
		return false
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
	return true
}

func (h *UnifiedHandler) proxyWebSocket(w http.ResponseWriter, r *http.Request) {
	u, _ := url.Parse(h.DevServerURL)
	targetAddr := "ws://" + u.Host + r.URL.Path
	if r.URL.RawQuery != "" {
		targetAddr += "?" + r.URL.RawQuery
	}

	logger.Info("[Proxy] Proxying WebSocket: %s", targetAddr)

	// Connect to Backend WebSocket with custom dialer for faster timeout
	dialer := &websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 5 * time.Second,
	}

	confBody := r.Header.Clone()
	confBody.Del("Upgrade")
	confBody.Del("Connection")
	confBody.Del("Sec-Websocket-Key")
	confBody.Del("Sec-Websocket-Version")
	confBody.Del("Sec-Websocket-Extensions")
	confBody.Del("Sec-Websocket-Protocol")

	// Crucial for Vite HMR server to accept the connection without hanging or complaining
	confBody.Set("Host", "localhost:5173")
	confBody.Set("Origin", "http://localhost:5173")

	backendConn, _, err := dialer.Dial(targetAddr, confBody)
	if err != nil {
		logger.Error("[Proxy] WebSocket dial error: %v", err)
		http.Error(w, "WebSocket proxy error", http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	// Upgrade Client Connection
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("[Proxy] WebSocket upgrade error: %v", err)
		return
	}
	defer clientConn.Close()

	// Proxy data
	errChan := make(chan error, 2)
	go func() {
		for {
			mt, message, err := clientConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			err = backendConn.WriteMessage(mt, message)
			if err != nil {
				errChan <- err
				return
			}
		}
	}()

	go func() {
		for {
			mt, message, err := backendConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			err = clientConn.WriteMessage(mt, message)
			if err != nil {
				errChan <- err
				return
			}
		}
	}()

	<-errChan
}

func (h *UnifiedHandler) serveFile(w http.ResponseWriter, r *http.Request, filePath string, forceTxnID int) {
	// Redundant check for blocked status (extra safety)
	clientIP := r.RemoteAddr
	if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
		clientIP = clientIP[:idx]
	}
	if h.ClientStore != nil && h.ClientStore.IsBlocked(clientIP) {
		http.Error(w, "Access denied: Client blocked", http.StatusForbidden)
		return
	}

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

		// Parse Range header to get starting byte offset
		var bytesOffset int64 = 0
		rangeHeader := r.Header.Get("Range")
		if rangeHeader != "" {
			// Range header format: "bytes=start-end"
			// Example: "bytes=0-1023" or "bytes=1024-"
			if strings.HasPrefix(rangeHeader, "bytes=") {
				rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
				parts := strings.Split(rangeSpec, "-")
				if len(parts) > 0 && parts[0] != "" {
					if offset, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
						bytesOffset = offset
						// DEBUG: Log range requests (simplified, in MB)
					}
				}
			}
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
			BytesOffset:    bytesOffset, // Set offset from Range header
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
			link := fmt.Sprintf("/api/download-file/%d", txnID)
			h.TxStore.SetDownloadLink(txnID, link) // Enable download with progress
			txn.DownloadLink = link                // Update the local txn object with the download link

			// Broadcast new transaction
			if h.WSHub != nil {
				if txnCopy, exists := h.TxStore.GetTransactionCopy(txnID); exists {
					h.WSHub.BroadcastTransactionUpdate(txnCopy)
				}
			}

			transactionIDs = append(transactionIDs, txnID)
		}

		dst, err := os.Create(fullPath)
		if err != nil {
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
				// Delete the partial file
				os.Remove(fullPath)
			} else {
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


// Shutdown cleans up resources
func (h *UnifiedHandler) Shutdown() {
	// 1. Cancel all in-progress transactions
	if h.TxStore != nil {
		h.TxStore.CancelAllInProgress()

		// 2. Broadcast updates while WebSocket hub is still active
		if h.WSHub != nil {
			transactions := h.TxStore.GetAllTransactions()
			for _, txn := range transactions {
				if txn.Status == "cancelled" || txn.Status == "failed" {
					h.WSHub.BroadcastTransactionUpdate(txn)
				}
			}
			// Small delay to allow messages to be sent before closing connections
			time.Sleep(100 * time.Millisecond)
		}
	}

	// 3. Shutdown WebSocket Hub
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

	// Create settings manager and load persisted settings
	settingsManager := NewSettingsManager()
	savedSettings := settingsManager.LoadSettings()

	// Apply saved settings to WebSocket hub
	wsHub.SetTextTransferEnabled(savedSettings.TextTransferEnabled)
	wsHub.SetMultiClientEnabled(savedSettings.MultiClientEnabled)
	if savedSettings.ThemeID != "" && savedSettings.AccentID != "" {
		wsHub.SetTheme(savedSettings.ThemeID, savedSettings.AccentID)
	}
	if savedSettings.DesktopDeviceName != "" {
		wsHub.SetDesktopName(savedSettings.DesktopDeviceName)
	}

	return &UnifiedHandler{
		DevServerURL:      devServerURL,
		TxStore:           txStore,
		ClientStore:       clientStore,
		WSHub:             wsHub,
		IsDarkMode:        savedSettings.IsDarkMode,
		DesktopDeviceName: savedSettings.DesktopDeviceName,
		SecurityToken:     generateSecurityToken(),
		AdminToken:        generateSecurityToken(), // Separate token for admin operations
		SecurityEnabled:   savedSettings.SecurityEnabled,
		SettingsManager:   settingsManager,
	}
}
