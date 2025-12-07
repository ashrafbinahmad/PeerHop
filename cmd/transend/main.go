package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"transend/internal/network"
	"transend/internal/server"
	"transend/internal/ui"
	"transend/internal/utils"

	"github.com/schollz/progressbar/v3"
)

type ServerInfo struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
}

func main() {
	jsonMode := flag.Bool("json", false, "Output JSON for UI integration")
	receiveMode := flag.Bool("r", false, "Receive mode: allow uploading files from phone")
	flag.BoolVar(receiveMode, "receive", false, "Receive mode (long flag)")
	flag.Parse()

	args := flag.Args()

	// 1. Get Network Info
	ip := network.GetLocalIP()
	port, err := network.GetFreePort()
	if err != nil {
		log.Fatalf("Failed to get a free port: %v", err)
	}

	addr := fmt.Sprintf("http://%s:%d", ip, port)

	// MODE: RECEIVE
	if *receiveMode {
		handler := server.NewUploadHandler()
		http.Handle("/", handler)
		http.Handle("/upload", handler)

		fmt.Printf("\nReceive Mode Enabled.\nScan this QR code to upload files to this computer:\n")
		ui.PrintQRCode(addr)
		fmt.Printf("\nOr visit: %s\n", addr)
		fmt.Printf("Files will be saved to: %s\n\n", utils.GetCwd())

		log.Fatal(http.ListenAndServe(":"+strconv.Itoa(port), nil))
		return
	}

	// MODE: SEND
	if len(args) < 1 {
		fmt.Println("Usage: transfer <file-path> [more-files...]")
		fmt.Println("       transfer -r  (to receive files)")
		os.Exit(1)
	}

	var filePath string
	// If multiple files or directory, create a zip
	if len(args) > 1 || utils.IsDirectory(args[0]) {
		fmt.Println("Multiple files detected. Creating ZIP archive...")
		zipPath, err := utils.CreateZip(args)
		if err != nil {
			log.Fatalf("Failed to create zip: %v", err)
		}
		filePath = zipPath
	} else {
		filePath = args[0]
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	// 2. Setup Progress Bar (Only if not in JSON mode)
	var bar *progressbar.ProgressBar
	if !*jsonMode {
		bar = progressbar.DefaultBytes(
			fileInfo.Size(),
			"sending",
		)
	}

	// 3. Setup Server
	handler := server.NewDownloadHandler(filePath, bar)
	http.Handle("/", handler)

	if *jsonMode {
		info := ServerInfo{
			URL:      addr,
			Filename: filepath.Base(filePath),
			Size:     fileInfo.Size(),
		}
		data, _ := json.Marshal(info)
		fmt.Println(string(data))
		// Flush stdout to ensure UI gets it immediately
		os.Stdout.Sync()
	} else {
		fmt.Printf("\nScanning this QR code to download '%s' (%s)\n", filepath.Base(filePath), utils.FormatBytes(fileInfo.Size()))
		ui.PrintQRCode(addr)
		fmt.Printf("\nOr visit: %s\n\n", addr)
	}

	// 5. Start Server
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(port), nil))
}
