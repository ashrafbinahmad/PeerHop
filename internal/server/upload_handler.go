package server

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// UploadHandler handles file uploads
type UploadHandler struct{}

func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		h.serveUploadForm(w)
		return
	}
	if r.Method == http.MethodPost {
		h.handleUpload(w, r)
		return
	}
	http.NotFound(w, r)
}

func (h *UploadHandler) serveUploadForm(w http.ResponseWriter) {
	html := `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Send File to Host</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 90%; width: 400px; }
        .icon { font-size: 48px; margin-bottom: 1rem; }
        .btn { display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border: none; border-radius: 6px; font-weight: 600; margin-top: 1rem; cursor: pointer; font-size: 1rem; transition: background 0.2s; width: 100%; }
        .btn:active { transform: scale(0.98); }
        input[type="file"] { margin: 1rem 0; width: 100%; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">📤</div>
        <h2>Send File to Computer</h2>
        <form action="/upload" method="post" enctype="multipart/form-data">
            <input type="file" name="file" multiple required>
            <button type="submit" class="btn">Send</button>
        </form>
    </div>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
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
