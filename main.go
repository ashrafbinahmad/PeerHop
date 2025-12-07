package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"transfer/internal/network"
	"transfer/internal/server"
	"transfer/internal/ui"

	"github.com/schollz/progressbar/v3"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: transfer <file-path>")
		os.Exit(1)
	}

	filePath := os.Args[1]
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	if fileInfo.IsDir() {
		log.Fatalf("Transferring directories is not supported yet. Please zip it first.")
	}

	// 1. Get Network Info
	ip := network.GetLocalIP()
	port, err := network.GetFreePort()
	if err != nil {
		// Fallback to a random port or let the OS decide later (but we need it for QR info)
		// Retry or just picking 8080?
		// Let's just fail if we can't get a TCP port which is rare.
		log.Fatalf("Failed to get a free port: %v", err)
	}

	// 2. Setup Progress Bar
	bar := progressbar.DefaultBytes(
		fileInfo.Size(),
		"sending",
	)

	// 3. Setup Server
	// Use our new DownloadHandler for better mobile support
	handler := server.NewDownloadHandler(filePath, bar)
	http.Handle("/", handler)

	// 4. UI: Print Info
	addr := fmt.Sprintf("http://%s:%d", ip, port)

	fmt.Printf("\nScanning this QR code to download '%s' (%s)\n", filepath.Base(filePath), formatBytes(fileInfo.Size()))
	ui.PrintQRCode(addr)
	fmt.Printf("\nOr visit: %s\n\n", addr)

	// 5. Start Server
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(port), nil))
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
