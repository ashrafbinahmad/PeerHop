package server

import (
	"fmt"
	"sort"
	"sync"
	"time"
)

// TransactionType represents the type of transaction
type TransactionType string

const (
	TransactionTypeFile TransactionType = "file"
	TransactionTypeText TransactionType = "text"
)

// SenderID constants
const (
	SenderServer = "server"
)

// ByteRange represents a range of bytes that have been downloaded
type ByteRange struct {
	Start int64
	End   int64
}

// Transaction represents a file or text transfer transaction
type Transaction struct {
	ID                 int             `json:"id"`
	ClientIP           string          `json:"clientIp,omitempty"` // IP of the client involved
	Type               TransactionType `json:"type"`
	SenderID           string          `json:"senderId"` // "server" or client ID
	TransactionPercent float64         `json:"transactionPercent"`
	DownloadLink       string          `json:"downloadLink,omitempty"`    // for from server files
	UploadLink         string          `json:"uploadLink,omitempty"`      // for from client files uploading
	SavedInLocation    string          `json:"savedInLocation,omitempty"` // for from client files
	Filename           string          `json:"filename,omitempty"`        // for file transactions
	FileSize           int64           `json:"fileSize,omitempty"`        // for file transactions
	ServerFilePath     string          `json:"serverFilePath,omitempty"`  // absolute path on server
	TextContent        string          `json:"textContent,omitempty"`     // for text transactions
	Timestamp          time.Time       `json:"timestamp"`
	BytesTransferred   int64           `json:"bytesTransferred,omitempty"` // for tracking progress
	Status             string          `json:"status"`                     // "pending", "in_progress", "completed", "failed"

	// Client-specific progress tracking for downloads (keyed by IP)
	ClientProgress map[string]float64     `json:"clientProgress,omitempty"` // clientIP -> progress percentage
	ClientStatus   map[string]string      `json:"clientStatus,omitempty"`   // clientIP -> status
	ClientBytes    map[string]int64       `json:"clientBytes,omitempty"`    // clientIP -> bytes transferred
	ClientRanges   map[string][]ByteRange `json:"clientRanges,omitempty"`   // clientIP -> list of downloaded ranges (for parallel requests)
}

// TransactionStore manages all transactions in memory
type TransactionStore struct {
	mu              sync.RWMutex
	transactions    map[int]*Transaction
	nextID          int
	cancelled       map[int]bool    // Track cancelled transactions (global)
	clientCancelled map[string]bool // Track cancelled client downloads (key: "txnID_clientIP")
}

// NewTransactionStore creates a new transaction store
func NewTransactionStore() *TransactionStore {
	return &TransactionStore{
		transactions:    make(map[int]*Transaction),
		nextID:          1,
		cancelled:       make(map[int]bool),
		clientCancelled: make(map[string]bool),
	}
}

// AddTransaction adds a new transaction and returns its ID
func (ts *TransactionStore) AddTransaction(txn *Transaction) int {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	txn.ID = ts.nextID
	txn.Timestamp = time.Now()
	txn.Status = "pending"
	ts.transactions[txn.ID] = txn
	ts.nextID++

	return txn.ID
}

// GetTransaction retrieves a transaction by ID
func (ts *TransactionStore) GetTransaction(id int) (*Transaction, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	txn, exists := ts.transactions[id]
	return txn, exists
}

// GetTransactionCopy returns a deep copy of a transaction to avoid race conditions during JSON marshaling
func (ts *TransactionStore) GetTransactionCopy(id int) (*Transaction, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	txn, exists := ts.transactions[id]
	if !exists {
		return nil, false
	}

	// Create a shallow copy first
	cpy := *txn

	// Deep copy maps to prevent concurrent read/write during JSON marshal
	if txn.ClientProgress != nil {
		cpy.ClientProgress = make(map[string]float64)
		for k, v := range txn.ClientProgress {
			cpy.ClientProgress[k] = v
		}
	}
	if txn.ClientStatus != nil {
		cpy.ClientStatus = make(map[string]string)
		for k, v := range txn.ClientStatus {
			cpy.ClientStatus[k] = v
		}
	}
	if txn.ClientBytes != nil {
		cpy.ClientBytes = make(map[string]int64)
		for k, v := range txn.ClientBytes {
			cpy.ClientBytes[k] = v
		}
	}
	if txn.ClientRanges != nil {
		cpy.ClientRanges = make(map[string][]ByteRange)
		for k, v := range txn.ClientRanges {
			// Deep copy the slice of ranges
			rangesCopy := make([]ByteRange, len(v))
			copy(rangesCopy, v)
			cpy.ClientRanges[k] = rangesCopy
		}
	}

	return &cpy, true
}

// GetAllTransactions returns all transactions sorted by timestamp
func (ts *TransactionStore) GetAllTransactions() []*Transaction {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	result := make([]*Transaction, 0, len(ts.transactions))
	for _, txn := range ts.transactions {
		result = append(result, txn)
	}

	// Sort by timestamp (oldest first)
	sort.Slice(result, func(i, j int) bool {
		return result[i].Timestamp.Before(result[j].Timestamp)
	})

	return result
}

// UpdateProgress updates the progress of a transaction
func (ts *TransactionStore) UpdateProgress(id int, bytesTransferred int64, totalBytes int64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		// Prevent overwriting cancelled status
		if txn.Status == "cancelled" || ts.cancelled[id] {
			return
		}

		txn.BytesTransferred = bytesTransferred
		if totalBytes > 0 {
			txn.TransactionPercent = (float64(bytesTransferred) / float64(totalBytes)) * 100
			if txn.TransactionPercent >= 100 {
				txn.TransactionPercent = 100 // Cap at 100
				txn.Status = "completed"
			} else {
				txn.Status = "in_progress"
			}
		}
	}
}

// UpdateClientProgress updates the progress for a specific client (by IP) downloading a file
func (ts *TransactionStore) UpdateClientProgress(id int, clientIP string, bytesTransferred int64, totalBytes int64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		// Check for cancellation
		if txn.ClientStatus != nil && txn.ClientStatus[clientIP] == "cancelled" {
			return
		}
		// Also check valid cancellation map
		cancelKey := fmt.Sprintf("%d_%s", id, clientIP)
		if ts.clientCancelled[cancelKey] {
			return
		}

		// Initialize maps if needed
		if txn.ClientProgress == nil {
			txn.ClientProgress = make(map[string]float64)
		}
		if txn.ClientStatus == nil {
			txn.ClientStatus = make(map[string]string)
		}
		if txn.ClientBytes == nil {
			txn.ClientBytes = make(map[string]int64)
		}

		// CRITICAL FIX: Ensure bytes and progress are monotonic (only increase)
		// This prevents progress from going backwards due to browser range requests or retries
		previousBytes := txn.ClientBytes[clientIP]
		previousProgress := txn.ClientProgress[clientIP]

		// Only update if we're making forward progress
		if bytesTransferred > previousBytes {
			txn.ClientBytes[clientIP] = bytesTransferred

			if totalBytes > 0 {
				progress := (float64(bytesTransferred) / float64(totalBytes)) * 100

				// Ensure progress only increases
				if progress > previousProgress {
					// Clamp to maximum of 100%
					if progress >= 100 {
						progress = 100
						txn.ClientStatus[clientIP] = "completed"
					} else {
						txn.ClientStatus[clientIP] = "in_progress"
					}
					txn.ClientProgress[clientIP] = progress
				}
			}
		} else if bytesTransferred == totalBytes && totalBytes > 0 {
			// Special case: download completed, always set to 100%
			txn.ClientBytes[clientIP] = bytesTransferred
			txn.ClientProgress[clientIP] = 100
			txn.ClientStatus[clientIP] = "completed"
		}
		// If bytesTransferred <= previousBytes, don't update (ignore backwards movement)
	}
}

// UpdateClientRangeProgress updates progress for a specific client using byte ranges
// This properly handles parallel range requests from Android browsers
func (ts *TransactionStore) UpdateClientRangeProgress(id int, clientIP string, rangeStart int64, rangeEnd int64, totalBytes int64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		// Check for cancellation
		if txn.ClientStatus != nil && txn.ClientStatus[clientIP] == "cancelled" {
			return
		}
		cancelKey := fmt.Sprintf("%d_%s", id, clientIP)
		if ts.clientCancelled[cancelKey] {
			return
		}

		// Initialize maps if needed
		if txn.ClientProgress == nil {
			txn.ClientProgress = make(map[string]float64)
		}
		if txn.ClientStatus == nil {
			txn.ClientStatus = make(map[string]string)
		}
		if txn.ClientBytes == nil {
			txn.ClientBytes = make(map[string]int64)
		}
		if txn.ClientRanges == nil {
			txn.ClientRanges = make(map[string][]ByteRange)
		}

		// Add or update the range
		ranges := txn.ClientRanges[clientIP]
		newRange := ByteRange{Start: rangeStart, End: rangeEnd}

		// Merge overlapping or adjacent ranges
		merged := false
		for i, r := range ranges {
			// Check if ranges overlap or are adjacent
			if newRange.Start <= r.End+1 && newRange.End+1 >= r.Start {
				// Merge ranges
				ranges[i].Start = min(r.Start, newRange.Start)
				ranges[i].End = max(r.End, newRange.End)
				merged = true

				// Check if we can merge with any other ranges now
				for j := len(ranges) - 1; j >= 0; j-- {
					if j != i && ranges[i].Start <= ranges[j].End+1 && ranges[i].End+1 >= ranges[j].Start {
						ranges[i].Start = min(ranges[i].Start, ranges[j].Start)
						ranges[i].End = max(ranges[i].End, ranges[j].End)
						// Remove the merged range
						ranges = append(ranges[:j], ranges[j+1:]...)
						if j < i {
							i--
						}
					}
				}
				break
			}
		}

		if !merged {
			ranges = append(ranges, newRange)
		}

		txn.ClientRanges[clientIP] = ranges

		// Calculate total bytes downloaded from all ranges
		totalDownloaded := int64(0)
		for _, r := range ranges {
			totalDownloaded += (r.End - r.Start + 1)
		}

		// Update client bytes and progress
		txn.ClientBytes[clientIP] = totalDownloaded

		if totalBytes > 0 {
			progress := (float64(totalDownloaded) / float64(totalBytes)) * 100
			if progress >= 100 {
				progress = 100
				txn.ClientStatus[clientIP] = "completed"
			} else {
				txn.ClientStatus[clientIP] = "in_progress"
			}
			txn.ClientProgress[clientIP] = progress

			// Clean debug logs with MB units
			downloadedMB := float64(totalDownloaded) / (1024 * 1024)
			totalMB := float64(totalBytes) / (1024 * 1024)

			// Show progress with visual indicator
			if progress >= 100 {
				fmt.Printf("[✅ COMPLETE] TxID=%d %.1fMB/%.1fMB (100%%)\n",
					id, downloadedMB, totalMB)
			} else if len(ranges) > 1 {
				fmt.Printf("[📊 PROGRESS] TxID=%d %.1fMB/%.1fMB (%.1f%%) - %d parallel ranges\n",
					id, downloadedMB, totalMB, progress, len(ranges))
			} else {
				fmt.Printf("[📊 PROGRESS] TxID=%d %.1fMB/%.1fMB (%.1f%%)\n",
					id, downloadedMB, totalMB, progress)
			}
		}
	}
}

// Helper functions for min/max
func min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// UpdateStatus updates the status of a transaction
func (ts *TransactionStore) UpdateStatus(id int, status string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		txn.Status = status
		// Don't reset transactionPercent - keep it for display
	}
}

// SetSavedLocation sets the saved location for a transaction
func (ts *TransactionStore) SetSavedLocation(id int, location string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		txn.SavedInLocation = location
	}
}

// SetDownloadLink sets the download link for a transaction
func (ts *TransactionStore) SetDownloadLink(id int, link string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		txn.DownloadLink = link
	}
}

// SetFileSize sets the file size for a transaction
func (ts *TransactionStore) SetFileSize(id int, size int64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		txn.FileSize = size
	}
}

// DeleteTransaction removes a transaction
func (ts *TransactionStore) DeleteTransaction(id int) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	delete(ts.transactions, id)
}

// ClearCompleted removes all completed transactions
func (ts *TransactionStore) ClearCompleted() {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	for id, txn := range ts.transactions {
		if txn.Status == "completed" {
			delete(ts.transactions, id)
		}
	}
}

// FindLatestTransactionByFilename finds the latest transaction for a given filename
// that corresponds to a server sent file.
// Returns ID and true if found, 0 and false if not.
func (ts *TransactionStore) FindLatestTransactionByFilename(filename string) (int, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	var latestID int
	var found bool
	var latestTime time.Time

	for _, txn := range ts.transactions {
		// We care about Server sent files
		if txn.Type == TransactionTypeFile && txn.SenderID == SenderServer && txn.Filename == filename {
			// Prefer pending or in_progress, but if we only have one, take it.
			// Logic: We want the one that represents the availability of the file.
			if !found || txn.Timestamp.After(latestTime) {
				latestID = txn.ID
				latestTime = txn.Timestamp
				found = true
			}
		}
	}

	return latestID, found
}

// FindTransactionByDownloadLink finds a transaction by its download link
func (ts *TransactionStore) FindTransactionByDownloadLink(downloadLink string) (*Transaction, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	for _, txn := range ts.transactions {
		if txn.DownloadLink == downloadLink {
			return txn, true
		}
	}

	return nil, false
}

// CancelTransaction cancels a transaction and resets it for retry
func (ts *TransactionStore) CancelTransaction(id int) bool {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		// First mark as cancelled to stop current transfer
		ts.cancelled[id] = true

		// Reset transaction state for cancellation
		txn.Status = "cancelled"

		// Remove from cancelled map after a brief moment to allow cleanup
		go func() {
			time.Sleep(1 * time.Second)
			ts.mu.Lock()
			delete(ts.cancelled, id)
			ts.mu.Unlock()
		}()

		return true
	}
	return false
}

// CancelClientDownload cancels a download for a specific client (by IP)
func (ts *TransactionStore) CancelClientDownload(id int, clientIP string) bool {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if txn, exists := ts.transactions[id]; exists {
		// Mark as cancelled for this specific client (by IP)
		// We use a specific map key to track client cancellations
		cancelKey := fmt.Sprintf("%d_%s", id, clientIP)
		if ts.clientCancelled == nil {
			ts.clientCancelled = make(map[string]bool)
		}
		ts.clientCancelled[cancelKey] = true

		// Reset client-specific progress
		if txn.ClientProgress != nil {
			txn.ClientProgress[clientIP] = 0
		}
		if txn.ClientStatus != nil {
			txn.ClientStatus[clientIP] = "cancelled"
		}
		if txn.ClientBytes != nil {
			txn.ClientBytes[clientIP] = 0
		}

		// Keep the cancellation flag active for 2 seconds to prevent browser auto-retry
		// from immediately restarting the download
		go func() {
			time.Sleep(2 * time.Second)
			ts.mu.Lock()
			if ts.clientCancelled != nil {
				delete(ts.clientCancelled, cancelKey)
			}
			ts.mu.Unlock()
		}()

		return true
	}
	return false
}

// IsClientCancelled checks if a specific client (by IP) download has been cancelled
func (ts *TransactionStore) IsClientCancelled(id int, clientIP string) bool {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	if ts.clientCancelled != nil {
		cancelKey := fmt.Sprintf("%d_%s", id, clientIP)
		if ts.clientCancelled[cancelKey] {
			return true
		}
	}

	return false
}

// IsCancelled checks if a transaction has been cancelled
func (ts *TransactionStore) IsCancelled(id int) bool {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	if ts.cancelled[id] {
		return true
	}

	if txn, exists := ts.transactions[id]; exists {
		return txn.Status == "cancelled"
	}

	return false
}
