package server

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/schollz/progressbar/v3"
)

//go:embed dist
var distFS embed.FS

// ProgressResponseWriter wraps http.ResponseWriter to track bytes written
type ProgressResponseWriter struct {
	http.ResponseWriter
	ProgressBar *progressbar.ProgressBar
}

func (w *ProgressResponseWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	if w.ProgressBar != nil {
		w.ProgressBar.Add(n)
	}
	return n, err
}

// DownloadHandler handles serving the file or landing page
type DownloadHandler struct {
	FilePath string
	Bar      *progressbar.ProgressBar
}

func (h *DownloadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fileName := filepath.Base(h.FilePath)

	// API: Metadata
	if r.URL.Path == "/api/meta" {
		stat, err := os.Stat(h.FilePath)
		size := int64(0)
		if err == nil {
			size = stat.Size()
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"mode":     "download",
			"filename": fileName,
			"size":     size,
		})
		return
	}

	// API: Download
	if r.URL.Path == "/api/download" {
		h.serveFile(w, r)
		return
	}

	// Legacy/Direct Download link (if someone accesses /filename directly)
	if r.URL.Path == "/"+fileName {
		h.serveFile(w, r)
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

func (h *DownloadHandler) serveFile(w http.ResponseWriter, r *http.Request) {
	f, err := os.Open(h.FilePath)
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

// NewDownloadHandler creates the handler
func NewDownloadHandler(path string, bar *progressbar.ProgressBar) http.Handler {
	return &DownloadHandler{
		FilePath: path,
		Bar:      bar,
	}
}
