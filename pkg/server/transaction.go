package server

import (
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

// Transaction represents a file or text transfer transaction
type Transaction struct {
	ID                 int             `json:"id"`
	ClientID           string          `json:"clientId,omitempty"` // ID of the client involved
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
}

// TransactionStore manages all transactions in memory
type TransactionStore struct {
	mu           sync.RWMutex
	transactions map[int]*Transaction
	nextID       int
	cancelled    map[int]bool // Track cancelled transactions
}

// NewTransactionStore creates a new transaction store
func NewTransactionStore() *TransactionStore {
	return &TransactionStore{
		transactions: make(map[int]*Transaction),
		nextID:       1,
		cancelled:    make(map[int]bool),
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

		// Reset transaction state for retry
		txn.TransactionPercent = 0
		txn.BytesTransferred = 0
		txn.Status = "pending"

		// Remove from cancelled map after a brief moment to allow new download
		// The current transfer will already be stopped by the cancelled flag
		go func() {
			time.Sleep(100 * time.Millisecond)
			ts.mu.Lock()
			delete(ts.cancelled, id)
			ts.mu.Unlock()
		}()

		return true
	}
	return false
}

// IsCancelled checks if a transaction has been cancelled
func (ts *TransactionStore) IsCancelled(id int) bool {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	return ts.cancelled[id]
}
