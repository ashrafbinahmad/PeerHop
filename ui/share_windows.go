//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"

	"peerhop/pkg/logger"

	"github.com/Microsoft/go-winio"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ShareData struct {
	Files []string `json:"files"`
	Text  string   `json:"text"`
	URL   string   `json:"url"`
	Title string   `json:"title"`
}

var currentShareData *ShareData
var lastShareHash string
var lastShareTime time.Time

func hashShareData(data *ShareData) string {
	if data == nil {
		return ""
	}
	files := ""
	for _, f := range data.Files {
		files += f + "|"
	}
	return fmt.Sprintf("files:%s;text:%s;url:%s;title:%s", files, data.Text, data.URL, data.Title)
}

func setShareData(newData *ShareData) bool {
	if newData == nil {
		return false
	}
	hash := hashShareData(newData)
	if hash == "" {
		return false
	}
	if hash == lastShareHash && time.Since(lastShareTime) < 3*time.Second {
		return false
	}
	currentShareData = newData
	lastShareHash = hash
	lastShareTime = time.Now()
	return true
}

// GetSharedFiles returns the currently stored share data and clears it
func (a *App) GetSharedFiles() (*ShareData, error) {
	data := currentShareData
	currentShareData = nil
	if data == nil {
		return &ShareData{Files: []string{}}, nil
	}
	return data, nil
}

// CheckShareActivation is called from app.go startup
func (a *App) CheckShareActivation() {
	logger.Info("[ShareTarget] Starting 2-process listener (shim approach)")

	// 1. Check command-line file args (context menu verb activation: PeerHop.exe <file>)
	a.checkCommandLineFiles()

	// 2. Check for the temp file written by ShareShim (cold launch from Share Target)
	a.checkForTempFile()

	// 3. Start named pipe server for live events from ShareShim
	go a.startNamedPipeServer()
}

// checkCommandLineFiles detects when PeerHop.exe is launched directly with file paths
// as command-line arguments (e.g. from the "Send with PeerHop" context menu verb).
func (a *App) checkCommandLineFiles() {
	args := os.Args[1:]
	if len(args) == 0 {
		return
	}

	var files []string
	for _, arg := range args {
		// Only accept arguments that look like existing file paths
		if _, err := os.Stat(arg); err == nil {
			files = append(files, arg)
		}
	}

	if len(files) == 0 {
		return
	}

	logger.Info("[ShareTarget] Detected %d file(s) from command-line args (context menu activation)", len(files))
	data := &ShareData{
		Title: "Shared from Context Menu",
		Files: files,
	}
	if setShareData(data) {
		// If context is already live (warm re-launch), emit immediately
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "share:received", data)
		}
	}
}

func (a *App) checkForTempFile() {
	tempPath := filepath.Join(os.TempDir(), "peerhop_share.json")
	if _, err := os.Stat(tempPath); err == nil {
		logger.Info("[ShareTarget] Found share data in temp file: %s", tempPath)
		file, err := os.Open(tempPath)
		if err == nil {
			defer file.Close()
			var data ShareData
			if err := json.NewDecoder(file).Decode(&data); err == nil {
				if setShareData(&data) {
					logger.Info("[ShareTarget] Parsed cold-launch share: %s", data.Title)
					if a.ctx != nil {
						runtime.EventsEmit(a.ctx, "share:received", data)
					}
				} else {
					logger.Info("[ShareTarget] Duplicate cold-launch share ignored: %s", data.Title)
				}
			}
			file.Close()
			os.Remove(tempPath)
		}
	}
}

func (a *App) startNamedPipeServer() {
	pipeName := `\\.\pipe\peerhop-share`
	pc := &winio.PipeConfig{
		MessageMode:      false, // Byte stream
		InputBufferSize:  65536,
		OutputBufferSize: 65536,
	}

	listener, err := winio.ListenPipe(pipeName, pc)
	if err != nil {
		logger.Error("[ShareTarget] Failed to start named pipe server: %v", err)
		return
	}
	defer listener.Close()

	logger.Info("[ShareTarget] Listening on named pipe: %s", pipeName)

	for {
		conn, err := listener.Accept()
		if err != nil {
			logger.Error("[ShareTarget] Named pipe accept error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		logger.Info("[ShareTarget] Received connection from ShareShim")
		go a.handlePipeConnection(conn)
	}
}

func (a *App) handlePipeConnection(conn net.Conn) {
	defer conn.Close()

	decoder := json.NewDecoder(conn)
	var data ShareData
	if err := decoder.Decode(&data); err != nil {
		if err != io.EOF {
			logger.Error("[ShareTarget] Failed to decode pipe data: %v", err)
		}
		return
	}

	logger.Info("[ShareTarget] Received share via pipe: %s", data.Title)
	if setShareData(&data) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "share:received", data)
		}
	} else {
		logger.Info("[ShareTarget] Duplicate pipe share ignored: %s", data.Title)
	}
}
