package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"peerhop/pkg/logger"
	"peerhop/pkg/network"
	"peerhop/pkg/server"
	"peerhop/pkg/utils"

	_ "embed"
)

//go:embed frontend/src/assets/images/appicon44x44.png
var appIcon []byte

// App struct
type App struct {
	ctx             context.Context
	unifiedHandler  *server.UnifiedHandler
	serverInfo      *ServerInfo
	httpServer      *http.Server
	serverStartTime time.Time
	currentPort     int
	networks        []network.NetworkProfile
	networksMu      sync.RWMutex
	selectedIP      string
	selectedIPMu    sync.RWMutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// GetSecureSettings allows the frontend to securely retrieve tokens
func (a *App) GetSecureSettings() server.SecuritySettings {
	if a.unifiedHandler == nil {
		return server.SecuritySettings{}
	}
	return a.unifiedHandler.GetSecuritySettings()
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize logger
	appData := os.Getenv("APPDATA")
	var logDir string
	if appData != "" {
		logDir = filepath.Join(appData, "PeerHop", "logs")
	} else {
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

	// Check for Platform-specific Share Target activation and context-menu file args.
	a.CheckShareActivation()
}

// startPersistentServer starts a server that runs throughout the app lifetime
func (a *App) startPersistentServer() error {
	// Get network info
	ip, err := network.GetLocalIP()
	if err != nil {
		logger.Warn("Failed to get local IP: %v - falling back to loopback", err)
		ip = "127.0.0.1"
	}

	// Get settings manager to check for static port
	sm := server.NewSettingsManager()
	settings := sm.LoadSettings()

	port := 0
	if settings.StaticPortEnabled && settings.StaticPort > 0 {
		port = settings.StaticPort
		logger.Info("Using static port: %d", port)
	} else {
		// Get a free port for the server
		freePort, err := network.GetFreePort()
		if err != nil {
			return err
		}
		port = freePort
	}

	a.currentPort = port

	// Detect development mode by checking if PeerHop's Vite dev server is running
	devServerURL := ""
	env := runtime.Environment(a.ctx)
	if env.BuildType == "dev" {
		// Always try to use dev server in dev mode
		devServerURL = "http://localhost:5173"

		// Initial check for logging
		go func() {
			// Wait a few seconds for Vite to start if it hasn't already
			for i := 0; i < 5; i++ {
				if resp, err := http.Get(devServerURL); err == nil {
					resp.Body.Close()
					logger.Info("Development mode: Vite dev server is responsive at %s", devServerURL)
					return
				}
				time.Sleep(1 * time.Second)
			}
			logger.Warn("Development mode: Vite dev server not responding after 5 seconds, will retry on request")
		}()
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

	// Store server info
	env = runtime.Environment(a.ctx)
	a.serverInfo = &ServerInfo{
		URL:      fmt.Sprintf("http://%s:%d", ip, port),
		SSID:     "",
		Platform: env.Platform,
	}

	a.httpServer = httpServer

	// Run server in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Server error: %v", err)
		}
	}()

	logger.Info("Server started at %s", a.serverInfo.URL)
	a.serverStartTime = time.Now()

	// Asynchronously handle network discovery to avoid blocking startup
	go a.refreshNetworksBackground()

	return nil
}

// SelectNetworkIP sets the preferred IP for the QR code and URL and returns updated info
func (a *App) SelectNetworkIP(ip string) (*ServerInfo, error) {
	a.selectedIPMu.Lock()
	a.selectedIP = ip
	a.selectedIPMu.Unlock()
	logger.Info("User selected preferred IP: %s", ip)
	return a.GetServerInfo()
}

// refreshNetworksBackground periodically updates the list of available network interfaces
func (a *App) refreshNetworksBackground() {
	// Try to enable hotspot (Platform-specific dummy for non-Windows)
	network.TryEnableHotspot()

	for {
		profiles := network.GetNetworkProfiles()

		a.networksMu.Lock()
		a.networks = profiles
		if a.serverInfo != nil {
			a.serverInfo.Networks = profiles
			// Populate legacy SSID for backward compatibility if needed
			if len(profiles) > 0 {
				a.serverInfo.SSID = profiles[0].SSID
			}
		}
		a.networksMu.Unlock()

		// Refresh every 10 seconds to detect network changes without excessive CPU usage
		time.Sleep(10 * time.Second)

		// Check if context is cancelled (app shutting down)
		if a.ctx != nil && a.ctx.Err() != nil {
			return
		}
	}
}

// GetServerInfo returns the current server information
func (a *App) GetServerInfo() (*ServerInfo, error) {
	if a.serverInfo == nil {
		return nil, fmt.Errorf("server not started")
	}

	// Refresh primary SSID and IP for the main URL
	ssid := network.GetWiFiName()
	a.serverInfo.SSID = ssid

	// Use user-selected IP if available, otherwise fallback to auto-detection
	var ip string
	a.selectedIPMu.Lock()
	ip = a.selectedIP

	// Validate: If the selected IP is no longer in the list of networks, clear it
	if ip != "" {
		found := false
		a.networksMu.RLock()
		for _, netProf := range a.networks {
			if netProf.IP == ip {
				found = true
				break
			}
		}
		a.networksMu.RUnlock()

		if !found {
			logger.Info("Selected IP %s is no longer available (Hotspot disabled?), resetting to default", ip)
			a.selectedIP = ""
			ip = ""
		}
	}
	a.selectedIPMu.Unlock()

	if ip == "" {
		detectedIP, err := network.GetLocalIP()
		if err == nil {
			ip = detectedIP
		}
	}

	// Use cached networks
	a.networksMu.RLock()
	a.serverInfo.Networks = a.networks
	a.networksMu.RUnlock()

	if ip != "" && a.currentPort > 0 {
		a.serverInfo.URL = fmt.Sprintf("http://%s:%d", ip, a.currentPort)
	}

	// Add platform info
	env := runtime.Environment(a.ctx)
	a.serverInfo.Platform = env.Platform

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

// SelectFiles opens a dialog to select multiple files
func (a *App) SelectFiles() ([]string, error) {
	selection, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Files to Share",
	})
	return selection, err
}

// SelectDownloadPath opens a dialog to select a directory for downloads
func (a *App) SelectDownloadPath(currentPath string) (string, error) {
	// If current path is set but doesn't exist, create it so dialog can open there
	if currentPath != "" {
		os.MkdirAll(currentPath, 0755)
	}

	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select Folder for Received Files",
		DefaultDirectory: currentPath,
	})
	return selection, err
}

const (
	defaultWindowsStoreProductID = "9N5VVVHD710V"
)

func getWindowsStoreProductID() string {
	id := os.Getenv("PEERHOP_STORE_PRODUCT_ID")
	if id == "" {
		id = os.Getenv("VITE_STORE_PRODUCT_ID")
	}
	if id == "" {
		id = defaultWindowsStoreProductID
	}
	return id
}

type ServerInfo struct {
	URL             string                   `json:"url"`
	Filename        string                   `json:"filename"`
	Size            int64                    `json:"size"`
	SSID            string                   `json:"ssid"`
	HotspotSSID     string                   `json:"hotspotSsid"`
	HotspotPassword string                   `json:"hotspotPassword"`
	Networks        []network.NetworkProfile `json:"networks"`
	Platform        string                   `json:"platform"`
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
				DownloadLink:       "",
				ServerFilePath:     zipPath,
				TransactionPercent: 0,
				Status:             "pending",
			}
			txnID := a.unifiedHandler.TxStore.AddTransaction(txn)
			link := fmt.Sprintf("/api/download-file/%d", txnID)
			a.unifiedHandler.TxStore.SetDownloadLink(txnID, link)
			txn.DownloadLink = link

			if a.unifiedHandler.WSHub != nil {
				if txnCopy, exists := a.unifiedHandler.TxStore.GetTransactionCopy(txnID); exists {
					a.unifiedHandler.WSHub.BroadcastTransactionUpdate(txnCopy)
				}
			}
		}

		if a.serverInfo != nil {
			a.serverInfo.Filename = filepath.Base(zipPath)
			a.serverInfo.Size = stat.Size()
		}

		if a.unifiedHandler != nil {
			a.unifiedHandler.SetFilePath(zipPath)
		}

		return a.serverInfo, nil
	}

	// Multiple files
	var totalSize int64
	var filenames []string

	for i, filePath := range paths {
		stat, err := os.Stat(filePath)
		if err != nil {
			continue
		}

		totalSize += stat.Size()
		filenames = append(filenames, filepath.Base(filePath))

		// Create transaction
		if a.unifiedHandler != nil && a.unifiedHandler.TxStore != nil {
			txn := &server.Transaction{
				Type:               server.TransactionTypeFile,
				SenderID:           server.SenderServer,
				Filename:           filepath.Base(filePath),
				FileSize:           stat.Size(),
				DownloadLink:       "",
				ServerFilePath:     filePath,
				TransactionPercent: 0,
				Status:             "pending",
			}
			txnID := a.unifiedHandler.TxStore.AddTransaction(txn)
			link := fmt.Sprintf("/api/download-file/%d", txnID)
			a.unifiedHandler.TxStore.SetDownloadLink(txnID, link)
			txn.DownloadLink = link

			if a.unifiedHandler.WSHub != nil {
				if txnCopy, exists := a.unifiedHandler.TxStore.GetTransactionCopy(txnID); exists {
					a.unifiedHandler.WSHub.BroadcastTransactionUpdate(txnCopy)
				}
			}
		}

		if i == 0 && a.unifiedHandler != nil {
			a.unifiedHandler.SetFilePath(filePath)
		}
	}

	if a.serverInfo != nil {
		a.serverInfo.Filename = strings.Join(filenames, ", ")
		a.serverInfo.Size = totalSize
	}

	return a.serverInfo, nil
}

// OpenSourceFile opens the file in default app
func (a *App) OpenSourceFile(filePath string) error {
	if !filepath.IsAbs(filePath) {
		sm := server.NewSettingsManager()
		settings := sm.LoadSettings()
		dlPath := filepath.Join(settings.DownloadPath, filePath)

		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}

	// Handle platform-specific cleanup (e.g. Zone.Identifier on Windows)
	removeZoneIdentifier(filePath)

	return utils.OpenFileDefault(filePath)
}

// ShowInFolder opens the file manager and selects the file
func (a *App) ShowInFolder(filePath string) error {
	if !filepath.IsAbs(filePath) {
		sm := server.NewSettingsManager()
		settings := sm.LoadSettings()
		filePath = filepath.Join(settings.DownloadPath, filePath)
	}
	return utils.ShowInFolder(filePath)
}

// ShowOpenWithDialog opens the native system's "Open With" dialog
func (a *App) ShowOpenWithDialog(filePath string) error {
	if !filepath.IsAbs(filePath) {
		sm := server.NewSettingsManager()
		settings := sm.LoadSettings()
		dlPath := filepath.Join(settings.DownloadPath, filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.ShowOpenWithDialog(filePath)
}

// SaveTempFile saves base64 data to a temporary file and returns the path
func (a *App) SaveTempFile(filename string, dataB64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create temp file
	tempDir := os.TempDir()
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
