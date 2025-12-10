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

// UnifiedHandler handles both file downloads and uploads
type UnifiedHandler struct {
	mu       sync.RWMutex
	FilePath string
	Bar      *progressbar.ProgressBar
}

func (h *UnifiedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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
			})
		} else {
			// Upload mode
			json.NewEncoder(w).Encode(map[string]interface{}{
				"mode": "upload",
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
		h.serveFile(w, r, filePath)
		return
	}

	// API: Upload
	if r.URL.Path == "/api/upload" && r.Method == http.MethodPost {
		h.handleUpload(w, r)
		return
	}

	// Serve Static Assets or Index
	fsys, _ := fs.Sub(distFS, "dist")

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

func (h *UnifiedHandler) serveFile(w http.ResponseWriter, r *http.Request, filePath string) {
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

	pw := &ProgressResponseWriter{
		ResponseWriter: w,
		ProgressBar:    h.Bar,
	}

	http.ServeContent(pw, r, stat.Name(), stat.ModTime(), f)
}

func (h *UnifiedHandler) handleUpload(w http.ResponseWriter, r *http.Request) {
	// 10 GB limit max
	r.Body = http.MaxBytesReader(w, r.Body, 10<<30)
	if err := r.ParseMultipartForm(10 << 30); err != nil {
		http.Error(w, "File too big", http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		http.Error(w, "No files received", http.StatusBadRequest)
		return
	}

	var saved []string
	for _, header := range files {
		file, err := header.Open()
		if err != nil {
			continue
		}
		defer file.Close()

		// Handle filename collision
		filename := filepath.Base(header.Filename)
		if _, err := os.Stat(filename); err == nil {
			filename = fmt.Sprintf("%d_%s", time.Now().Unix(), filename)
		}

		dst, err := os.Create(filename)
		if err != nil {
			fmt.Printf("Error creating file %s: %v\n", filename, err)
			continue
		}
		defer dst.Close()

		if _, err := io.Copy(dst, file); err != nil {
			fmt.Printf("Error saving file %s: %v\n", filename, err)
			continue
		}
		saved = append(saved, filename)
		fmt.Printf("\nReceived file: %s (%d bytes)\n", filename, header.Size)
	}

	// Return JSON success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"files":   saved,
		"count":   len(saved),
	})
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
func NewUnifiedHandler() *UnifiedHandler {
	return &UnifiedHandler{}
}
