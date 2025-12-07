package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/schollz/progressbar/v3"
)

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

	// Serve file if requested path matches filename
	// Serve file if requested path matches filename
	if r.URL.Path == "/"+fileName {
		h.serveFile(w, r)
		return
	}

	// Serve Landing Page otherwise (e.g. at root)
	if r.URL.Path == "/" {
		h.serveLandingPage(w, r, fileName)
		return
	}

	http.NotFound(w, r)
}

func (h *DownloadHandler) serveLandingPage(w http.ResponseWriter, r *http.Request, fileName string) {
	html := fmt.Sprintf(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Download %s</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 90%%; width: 400px; }
        .file-icon { font-size: 48px; margin-bottom: 1rem; }
        .file-name { font-weight: bold; margin-bottom: 0.5rem; word-break: break-all; }
        .btn { display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 1rem; transition: background 0.2s; }
        .btn:active { transform: scale(0.98); }
    </style>
</head>
<body>
    <div class="card">
        <div class="file-icon">📄</div>
        <div class="file-name">%s</div>
        <a href="/%s" class="btn" download>Download File</a>
    </div>
</body>
</html>`, fileName, fileName, fileName)

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
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

	// Use io.Copy instead of http.ServeContent to ensure we trigger the write wrapper
	// AND to allow explicit control.
	// Note: This bypasses Range requests support which is fine for basic transfer.
	// However, for mobile browsers resuming support, ServeContent is better.
	// If we want ServeContent AND Progress, we need to wrap the response writer properly.
	// Our ProgressResponseWriter already does that.

	http.ServeContent(pw, r, stat.Name(), stat.ModTime(), f)
}

// NewDownloadHandler creates the handler
func NewDownloadHandler(path string, bar *progressbar.ProgressBar) http.Handler {
	return &DownloadHandler{
		FilePath: path,
		Bar:      bar,
	}
}
