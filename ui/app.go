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
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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

var currentServer *http.Server

// StartTransfer starts the file server for the given files
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

	// 2. Network Info
	ip := network.GetLocalIP()
	port, err := network.GetFreePort()
	if err != nil {
		return nil, err
	}
	addr := fmt.Sprintf("http://%s:%d", ip, port)

	// 3. Stop existing server if any
	if currentServer != nil {
		currentServer.Close()
	}

	// 4. Start Server
	handler := server.NewDownloadHandler(filePath, nil) // No progress bar for Wails backend yet

	mux := http.NewServeMux()
	mux.Handle("/", handler)

	currentServer = &http.Server{
		Addr:    ":" + strconv.Itoa(port),
		Handler: mux,
	}

	// Run in goroutine
	go func() {
		if err := currentServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Server error: %v\n", err)
		}
	}()

	return &ServerInfo{
		URL:      addr,
		Filename: filepath.Base(filePath),
		Size:     stat.Size(),
	}, nil
}
