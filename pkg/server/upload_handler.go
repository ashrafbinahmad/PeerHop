package server

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// UploadHandler handles file uploads
type UploadHandler struct{}

func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// API: Metadata
	if r.URL.Path == "/api/meta" {
		json.NewEncoder(w).Encode(map[string]string{
			"mode": "upload",
		})
		return
	}

	// API: Upload
	if r.URL.Path == "/api/upload" && r.Method == http.MethodPost {
		h.handleUpload(w, r)
		return
	}

	// Legacy
	if r.URL.Path == "/upload" && r.Method == http.MethodPost {
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

	// Serve Index
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

func (h *UploadHandler) handleUpload(w http.ResponseWriter, r *http.Request) {
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

	// Success Page
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;}.card{background:white;padding:2rem;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);}</style>
    </head>
    <body>
        <div class="card">
            <h1 style="color:green">Success!</h1>
            <p>File sent successfully.</p>
            <a href="/">Send another</a>
        </div>
    </body>
    </html>
    `))
}

// NewUploadHandler creates a new upload handler
func NewUploadHandler() http.Handler {
	return &UploadHandler{}
}
