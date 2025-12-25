package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"peerhop/pkg/logger"
	"peerhop/pkg/network"
	"peerhop/pkg/server"
	"peerhop/pkg/utils"
)

// App struct
type App struct {
	ctx            context.Context
	unifiedHandler *server.UnifiedHandler
	serverInfo     *ServerInfo
	httpServer     *http.Server
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize logger
	logDir := filepath.Join(os.Getenv("APPDATA"), "PeerHop", "logs")
	if logDir == "" {
		// Fallback for non-Windows or if APPDATA not set
		home, _ := os.UserHomeDir()
		logDir = filepath.Join(home, ".peerhop", "logs")
	}

	loggerConfig := logger.Config{
		LogDir:        logDir,
		MinLevel:      logger.INFO,
		EnableConsole: true, // Enable console in dev mode
		MaxSizeMB:     10,   // Rotate after 10MB
	}

	if err := logger.Init(loggerConfig); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
	} else {
		logger.Info("PeerHop desktop application started")
		logger.Info("Log directory: %s", logDir)
	}

	// Start persistent server on startup
	if err := a.startPersistentServer(); err != nil {
		logger.Error("Failed to start server: %v", err)
	}

	// Start monitoring network changes
	go a.monitorNetwork()
}

// startPersistentServer starts a server that runs throughout the app lifetime
func (a *App) startPersistentServer() error {
	// Get network info
	ip, err := network.GetLocalIP()
	if err != nil {
		logger.Warn("Failed to get local IP: %v - falling back to loopback", err)
		ip = "127.0.0.1"
	}

	port, err := network.GetFreePort()
	if err != nil {
		return err
	}

	// Detect development mode by checking if Vite dev server is running
	devServerURL := ""
	if resp, err := http.Get("http://localhost:5173"); err == nil {
		resp.Body.Close()
		devServerURL = "http://localhost:5173"
		logger.Info("Development mode detected - proxying to Vite dev server")
	}

	// Create unified handler with optional dev server URL
	a.unifiedHandler = server.NewUnifiedHandler(devServerURL)

	// Create server
	mux := http.NewServeMux()
	mux.Handle("/", a.unifiedHandler)

	httpServer := &http.Server{
		Addr:    ":" + strconv.Itoa(port),
		Handler: mux,
	}

	// Store server info (start with empty SSID, will be populated asynchronously)
	a.serverInfo = &ServerInfo{
		URL:  fmt.Sprintf("http://%s:%d", ip, port),
		SSID: "",
	}

	a.httpServer = httpServer

	// Run server in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Server error: %v", err)
		}
	}()

	logger.Info("Server started at %s", a.serverInfo.URL)

	// Asynchronously fetch WiFi name to avoid blocking startup
	go func() {
		ssid := network.GetWiFiName()
		if a.serverInfo != nil {
			a.serverInfo.SSID = ssid
			logger.Info("WiFi SSID detected: %s", ssid)
		}
	}()

	return nil
}

// GetServerInfo returns the current server information
func (a *App) GetServerInfo() (*ServerInfo, error) {
	if a.serverInfo == nil {
		return nil, fmt.Errorf("server not started")
	}
	return a.serverInfo, nil
}

// RestartServer restarts the HTTP server
func (a *App) RestartServer() (*ServerInfo, error) {
	// Shutdown existing handlers
	if a.unifiedHandler != nil {
		a.unifiedHandler.Shutdown()
	}

	if a.httpServer != nil {
		// Shutdown with a short timeout
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := a.httpServer.Shutdown(ctx); err != nil {
			logger.Warn("Server forced to shutdown: %v", err)
		}
		a.serverInfo = nil
		a.httpServer = nil
	}

	// Restart
	if err := a.startPersistentServer(); err != nil {
		return nil, err
	}

	return a.serverInfo, nil
}

// monitorNetwork checks for network changes every few seconds
func (a *App) monitorNetwork() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			// Copy serverInfo to avoid race conditions
			if a.serverInfo == nil {
				continue
			}

			// Make local copies to avoid nil pointer dereference during restart
			savedURL := a.serverInfo.URL
			savedSSID := a.serverInfo.SSID

			// Early check if we have valid data
			if savedURL == "" {
				continue
			}

			currentIP, err := network.GetLocalIP()
			if err != nil {
				// If we can't get IP, assume network down or unchanged?
				// Just checking "127.0.0.1" vs saved might trigger unnecessary restarts.
				// Let's use loopback as currentIP if failed
				currentIP = "127.0.0.1"
			}
			currentSSID := network.GetWiFiName()

			// Check for changes
			// We extract the IP from the URL (http://192.168.1.10:1234 -> 192.168.1.10)
			savedIP := ""
			if strings.HasPrefix(savedURL, "http://") {
				parts := strings.Split(strings.TrimPrefix(savedURL, "http://"), ":")
				if len(parts) > 0 {
					savedIP = parts[0]
				}
			}

			if (currentIP != savedIP) || (currentSSID != savedSSID) {
				logger.Info("[Network] Change detected! IP: %s -> %s, SSID: %s -> %s", savedIP, currentIP, savedSSID, currentSSID)

				// Restart server
				newInfo, err := a.RestartServer()
				if err != nil {
					logger.Error("[Network] Failed to restart server: %v", err)
					continue
				}

				// Emit event to frontend
				runtime.EventsEmit(a.ctx, "network-changed", newInfo)
			}
		}
	}
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
	SSID     string `json:"ssid"`
}

// StartTransfer prepares files and makes them available for download
func (a *App) StartTransfer(paths []string) (*ServerInfo, error) {
	if len(paths) == 0 {
		return nil, fmt.Errorf("no files selected")
	}

	// Check if any path is a directory - if so, zip everything
	hasDirectory := false
	for _, p := range paths {
		if utils.IsDirectory(p) {
			hasDirectory = true
			break
		}
	}

	// If there's a directory, create a zip
	if hasDirectory {
		zipPath, err := utils.CreateZip(paths)
		if err != nil {
			return nil, err
		}

		stat, err := os.Stat(zipPath)
		if err != nil {
			return nil, err
		}

		// Create transaction for zip file
		if a.unifiedHandler != nil && a.unifiedHandler.TxStore != nil {
			txn := &server.Transaction{
				Type:               server.TransactionTypeFile,
				SenderID:           server.SenderServer,
				Filename:           filepath.Base(zipPath),
				FileSize:           stat.Size(),
				DownloadLink:       "", // Set after ID generation
				ServerFilePath:     zipPath,
				TransactionPercent: 0,
				Status:             "pending",
			}
			txnID := a.unifiedHandler.TxStore.AddTransaction(txn)
			a.unifiedHandler.TxStore.SetDownloadLink(txnID, fmt.Sprintf("/api/download-file/%d", txnID))
			fmt.Printf("[Desktop] Created download transaction ID=%d for zip: %s\n", txnID, filepath.Base(zipPath))
		}

		// Update server info
		if a.serverInfo != nil {
			a.serverInfo.Filename = filepath.Base(zipPath)
			a.serverInfo.Size = stat.Size()
		}

		// Set the first file for legacy download endpoint
		if a.unifiedHandler != nil {
			a.unifiedHandler.SetFilePath(zipPath)
		}

		return a.serverInfo, nil
	}

	// Multiple files (no directories) - send each individually
	for i, filePath := range paths {
		stat, err := os.Stat(filePath)
		if err != nil {
			fmt.Printf("[Desktop] Error stating file %s: %v\n", filePath, err)
			continue
		}

		// Create transaction for each file
		if a.unifiedHandler != nil && a.unifiedHandler.TxStore != nil {
			txn := &server.Transaction{
				Type:               server.TransactionTypeFile,
				SenderID:           server.SenderServer,
				Filename:           filepath.Base(filePath),
				FileSize:           stat.Size(),
				DownloadLink:       "", // Set after ID is generated
				ServerFilePath:     filePath,
				TransactionPercent: 0,
				Status:             "pending",
			}
			txnID := a.unifiedHandler.TxStore.AddTransaction(txn)
			// Update download link with correct ID
			a.unifiedHandler.TxStore.SetDownloadLink(txnID, fmt.Sprintf("/api/download-file/%d", txnID))
			fmt.Printf("[Desktop] Created download transaction ID=%d for file: %s\n", txnID, filepath.Base(filePath))
		}

		// Set the first file for legacy download endpoint
		if i == 0 && a.unifiedHandler != nil {
			a.unifiedHandler.SetFilePath(filePath)

			// Update server info with first file
			if a.serverInfo != nil {
				a.serverInfo.Filename = filepath.Base(filePath)
				a.serverInfo.Size = stat.Size()
			}
		}
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

// GetOpenableApps returns list of apps for a file
func (a *App) GetOpenableApps(filePath string) ([]utils.AppInfo, error) {
	// If filePath is relative (e.g. just filename), try to find it in Downloads or current dir
	if !filepath.IsAbs(filePath) {
		// Try Downloads first as that's where we save
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.GetOpenableApps(filePath)
}

// OpenFileWith opens the file with the selected app
func (a *App) OpenFileWith(filePath string, appCmd string) error {
	// Resolve path similar to GetOpenableApps
	if !filepath.IsAbs(filePath) {
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.OpenFileWithApp(filePath, appCmd)
}

// OpenSourceFile opens the file in default app
func (a *App) OpenSourceFile(filePath string) error {
	// Resolve path
	if !filepath.IsAbs(filePath) {
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.OpenFileDefault(filePath)
}

// ShowInFolder opens the file manager and selects the file
func (a *App) ShowInFolder(filePath string) error {
	// Resolve path
	if !filepath.IsAbs(filePath) {
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.ShowInFolder(filePath)
}

// SaveTempFile saves base64 data to a temporary file and returns the path
func (a *App) SaveTempFile(filename string, dataB64 string) (string, error) {
	// Decode base64
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create temp file
	tempDir := os.TempDir()
	// Add timestamp to ensure uniqueness
	name := filepath.Base(filename)
	ext := filepath.Ext(name)
	base := name[:len(name)-len(ext)]
	timestamp := time.Now().Format("20060102150405")
	finalName := fmt.Sprintf("%s_%s%s", base, timestamp, ext)

	filePath := filepath.Join(tempDir, finalName)

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to write temp file: %w", err)
	}

	return filePath, nil
}

// GetClipboardFiles returns a list of file paths currently in the clipboard (Windows only)
func (a *App) GetClipboardFiles() ([]string, error) {
	// Use PowerShell to get the file drop list
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Format FileDropList | Select-Object -ExpandProperty FullName")

	utils.HideWindow(cmd)

	output, err := cmd.Output()
	if err != nil {
		// It might error if clipboard is empty or not files
		return []string{}, nil
	}

	lines := strings.Split(string(output), "\r\n")
	var paths []string
	for _, line := range lines {
		val := strings.TrimSpace(line)
		if val != "" {
			paths = append(paths, val)
		}
	}

	return paths, nil
}
