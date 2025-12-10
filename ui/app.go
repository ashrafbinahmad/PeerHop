package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"transend/pkg/network"
	"transend/pkg/server"
	"transend/pkg/utils"
)

// App struct
type App struct {
	ctx            context.Context
	unifiedHandler *server.UnifiedHandler
	serverInfo     *ServerInfo
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Start persistent server on startup
	if err := a.startPersistentServer(); err != nil {
		fmt.Printf("Failed to start server: %v\n", err)
	}
}

// startPersistentServer starts a server that runs throughout the app lifetime
func (a *App) startPersistentServer() error {
	// Get network info
	ip := network.GetLocalIP()
	port, err := network.GetFreePort()
	if err != nil {
		return err
	}

	// Create unified handler
	a.unifiedHandler = server.NewUnifiedHandler()

	// Create server
	mux := http.NewServeMux()
	mux.Handle("/", a.unifiedHandler)

	httpServer := &http.Server{
		Addr:    ":" + strconv.Itoa(port),
		Handler: mux,
	}

	// Store server info
	a.serverInfo = &ServerInfo{
		URL: fmt.Sprintf("http://%s:%d", ip, port),
	}

	// Run in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Server error: %v\n", err)
		}
	}()

	fmt.Printf("Server started at %s\n", a.serverInfo.URL)
	return nil
}

// GetServerInfo returns the current server information
func (a *App) GetServerInfo() (*ServerInfo, error) {
	if a.serverInfo == nil {
		return nil, fmt.Errorf("server not started")
	}
	return a.serverInfo, nil
}

// SelectFiles opens a dialog to select multiple files
func (a *App) SelectFiles() ([]string, error) {
	selection, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Files to Share",
	})
	return selection, err
}

type ServerInfo struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
}

// StartTransfer prepares files and makes them available for download
func (a *App) StartTransfer(paths []string) (*ServerInfo, error) {
	if len(paths) == 0 {
		return nil, fmt.Errorf("no files selected")
	}

	// 1. Prepare file/zip
	var filePath string
	if len(paths) > 1 || utils.IsDirectory(paths[0]) {
		zipPath, err := utils.CreateZip(paths)
		if err != nil {
			return nil, err
		}
		filePath = zipPath
	} else {
		filePath = paths[0]
	}

	stat, err := os.Stat(filePath)
	if err != nil {
		return nil, err
	}

	// 2. Update the unified handler with the new file
	if a.unifiedHandler != nil {
		a.unifiedHandler.SetFilePath(filePath)
	}

	// 3. Update server info
	if a.serverInfo != nil {
		a.serverInfo.Filename = filepath.Base(filePath)
		a.serverInfo.Size = stat.Size()
	}

	return a.serverInfo, nil
}

// ClearTransfer clears the current file transfer (back to upload mode)
func (a *App) ClearTransfer() error {
	if a.unifiedHandler != nil {
		a.unifiedHandler.ClearFilePath()
	}

	if a.serverInfo != nil {
		a.serverInfo.Filename = ""
		a.serverInfo.Size = 0
	}

	return nil
}
