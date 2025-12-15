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
	TxnID        int
	TotalBytes   int64
	BytesWritten int64
	LastUpdate   time.Time
}

func (w *transactionProgressWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	if n > 0 {
		w.BytesWritten += int64(n)

		// Update progress bar if available
		if w.ProgressBar != nil {
			w.ProgressBar.Add(n)
		}

		// Update transaction progress
		// Update transaction progress (Throttled)
		if w.TxStore != nil && w.TxnID > 0 {
			// Update if throttled interval passed OR if download completed
			if w.BytesWritten >= w.TotalBytes || time.Since(w.LastUpdate) > 200*time.Millisecond {
				w.TxStore.UpdateProgress(w.TxnID, w.BytesWritten, w.TotalBytes)
				w.LastUpdate = time.Now()
			}
		}
	}
	return n, err
}

// UnifiedHandler handles both file downloads and uploads
type UnifiedHandler struct {
	mu            sync.RWMutex
	FilePath      string
	Bar           *progressbar.ProgressBar
	DevServerURL  string            // If set, proxy frontend requests to this URL (e.g., "http://localhost:5173")
	UploadedFiles []string          // Track files uploaded from mobile
	TxStore       *TransactionStore // Transaction store for tracking all transfers
	ClientStore   *ClientStore      // Client store for tracking connected devices
}

func (h *UnifiedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Add CORS headers to allow requests from Wails desktop app
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-ID")

	// Track Client
	clientID := r.Header.Get("X-Client-ID")
	if clientID != "" && h.ClientStore != nil {
		ip := r.RemoteAddr
		if idx := strings.LastIndex(ip, ":"); idx != -1 {
			ip = ip[:idx] // Strip port
		}
		userAgent := r.UserAgent()
		h.ClientStore.AddOrUpdateClient(clientID, userAgent, ip)
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
		h.serveFile(w, r, filePath, false)
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
				h.serveFile(w, r, txn.ServerFilePath, false)
				return
			}
		}

		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// API: Upload
	if r.URL.Path == "/api/upload" && r.Method == http.MethodPost {
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

		if h.TxStore == nil {
			http.Error(w, "Transaction store not initialized", http.StatusInternalServerError)
			return
		}

		// Create text transaction
		senderID := req.SenderID
		if senderID == "" {
			// Fallback try header
			senderID = r.Header.Get("X-Client-ID")
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
			ClientID:           r.Header.Get("X-Client-ID"),
		}
		fmt.Printf("[API] Created text txn from client: %s, ID: %s\n", senderID, txn.ClientID)

		id := h.TxStore.AddTransaction(txn)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"id":      id,
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
				h.serveFile(w, r, txn.ServerFilePath, true)
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

func (h *UnifiedHandler) serveFile(w http.ResponseWriter, r *http.Request, filePath string, skipTxUpdate bool) {
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
	if !skipTxUpdate && h.TxStore != nil {
		id, found := h.TxStore.FindLatestTransactionByFilename(stat.Name())
		if found {
			txnID = id
			txStore = h.TxStore
			// Reset status to in_progress if it was pending
			h.TxStore.UpdateStatus(txnID, "in_progress")
		}
	}

	// Create a custom writer that tracks progress (mainly for CLI progress bar if active)
	// We do NOT create a new Transaction here, because that would create a duplicate
	// "new message" in the UI chat for every download action.
	// Instead, we try to attach to the existing "File Available" transaction if it exists.
	pw := &transactionProgressWriter{
		ResponseWriter: w,
		ProgressBar:    h.Bar,
		TxStore:        txStore, // Use the store only if we found a valid transaction to update
		TxnID:          txnID,
		TotalBytes:     stat.Size(),
		BytesWritten:   0,
	}

	http.ServeContent(pw, r, stat.Name(), stat.ModTime(), f)
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
			filename = fmt.Sprintf("%d_%s", time.Now().Unix(), filename)
			fullPath = filepath.Join(downloadsDir, filename)
		}

		// Get absolute path
		absPath, _ := filepath.Abs(fullPath)

		// Create transaction for this file upload
		var txnID int
		if h.TxStore != nil {
			txn := &Transaction{
				Type:               TransactionTypeFile,
				SenderID:           r.Header.Get("X-Client-ID"),
				Filename:           filename,
				FileSize:           0, // Unknown size when streaming
				UploadLink:         "/api/upload",
				SavedInLocation:    absPath,
				ServerFilePath:     absPath, // NEW
				TransactionPercent: 0,
				Status:             "in_progress",
				ClientID:           r.Header.Get("X-Client-ID"),
			}
			txnID = h.TxStore.AddTransaction(txn)
			h.TxStore.SetDownloadLink(txnID, fmt.Sprintf("/api/view/%d", txnID)) // Enable preview
			transactionIDs = append(transactionIDs, txnID)
			fmt.Printf("[Upload] Created transaction ID=%d for file: %s (Streaming)\n", txnID, filename)
		}

		dst, err := os.Create(fullPath)
		if err != nil {
			fmt.Printf("Error creating file %s: %v\n", fullPath, err)
			if h.TxStore != nil && txnID > 0 {
				h.TxStore.UpdateStatus(txnID, "failed")
			}
			continue
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
						if time.Since(lastUpdate) > 200*time.Millisecond {
							h.TxStore.UpdateProgress(txnID, written, 0)
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
			fmt.Printf("Error saving file %s: %v\n", fullPath, err)
			if h.TxStore != nil && txnID > 0 {
				h.TxStore.UpdateStatus(txnID, "failed")
			}
			continue
		}

		saved = append(saved, filename)
		fmt.Printf("\nReceived file: %s (%d bytes) -> %s\n", filename, written, absPath)

		// Mark transaction as completed
		if h.TxStore != nil && txnID > 0 {
			h.TxStore.UpdateProgress(txnID, written, written) // Force 100%
			h.TxStore.SetFileSize(txnID, written)             // Update final size
			h.TxStore.UpdateStatus(txnID, "completed")
		}
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

// NewUnifiedHandler creates a new unified handler
// devServerURL: optional URL to proxy frontend requests in development (e.g., "http://localhost:5173")
func NewUnifiedHandler(devServerURL string) *UnifiedHandler {
	return &UnifiedHandler{
		DevServerURL: devServerURL,
		TxStore:      NewTransactionStore(),
		ClientStore:  NewClientStore(),
	}
}
