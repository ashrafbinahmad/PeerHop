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
			"app":  "cli",
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
	// 50 GB limit max
	r.Body = http.MaxBytesReader(w, r.Body, 50<<30)

	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "Invalid multipart data", http.StatusBadRequest)
		return
	}

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Printf("Error reading part: %v\n", err)
			continue
		}

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
		if _, err := os.Stat(filename); err == nil {
			filename = fmt.Sprintf("%d_%s", time.Now().Unix(), filename)
		}

		dst, err := os.Create(filename)
		if err != nil {
			fmt.Printf("Error creating file %s: %v\n", filename, err)
			continue
		}

		// Use 1MB buffer for faster copy
		buf := make([]byte, 1024*1024)
		written, err := io.CopyBuffer(dst, part, buf)
		dst.Close()

		if err != nil {
			fmt.Printf("Error saving file %s: %v\n", filename, err)
			continue
		}

		fmt.Printf("\nReceived file: %s (%d bytes)\n", filename, written)
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
