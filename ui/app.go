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
	ctx             context.Context
	unifiedHandler  *server.UnifiedHandler
	serverInfo      *ServerInfo
	httpServer      *http.Server
	serverStartTime time.Time
	currentPort     int
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// GetSecureSettings allows the frontend to securely retrieve tokens
// This method is only accessible via Wails IPC, not via HTTP network
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

	// Check for Windows Share Target activation and context-menu file args.
	// Called synchronously so currentShareData is populated before the frontend
	// calls GetSharedFiles() on mount. The named pipe listener is started
	// inside a goroutine within CheckShareActivation itself.
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

	// Get a free port for the server
	port, err := network.GetFreePort()
	if err != nil {
		return err
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
	a.serverStartTime = time.Now()

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

	// Refresh SSID and IP in case they changed (e.g. WiFi switch)
	ssid := network.GetWiFiName()
	a.serverInfo.SSID = ssid

	ip, err := network.GetLocalIP()
	if err == nil && a.currentPort > 0 {
		a.serverInfo.URL = fmt.Sprintf("http://%s:%d", ip, a.currentPort)
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

// SelectFiles opens a dialog to select multiple files
func (a *App) SelectFiles() ([]string, error) {
	selection, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Files to Share",
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

// RequestReview triggers the native Windows Store rating dialog using WinRT StoreRequestHelper request type 16.
// If WinRT does not work, it falls back to opening the ms-windows-store review URI.
func (a *App) RequestReview() error {
	storeID := getWindowsStoreProductID()
	fws := "ms-windows-store://review/?ProductId=" + storeID
	psCmd := fmt.Sprintf(`try {
		$req = [Windows.Services.Store.StoreRequestHelper]::SendRequestAsync(16, '%s')
		$req.GetResults() | Out-Null
	} catch {
		Start-Process -FilePath '%s'
	}`, storeID, fws)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psCmd)
	utils.HideWindow(cmd)
	if err := cmd.Run(); err != nil {
		logger.Warn("RequestReview PowerShell failed: %v", err)
		if a.ctx != nil {
			runtime.BrowserOpenURL(a.ctx, fws)
		}
		return nil
	}
	return nil
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
			fmt.Printf("[Desktop] Created and broadcasted download transaction ID=%d for zip: %s\n", txnID, filepath.Base(zipPath))
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

	// Multiple files (no directories) - send each individually
	var totalSize int64
	var filenames []string

	for i, filePath := range paths {
		stat, err := os.Stat(filePath)
		if err != nil {
			fmt.Printf("[Desktop] Error stating file %s: %v\n", filePath, err)
			continue
		}

		totalSize += stat.Size()
		filenames = append(filenames, filepath.Base(filePath))

		// Create transaction for each file
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
			fmt.Printf("[Desktop] Created and broadcasted download transaction ID=%d for file [%d/%d]: %s\n", txnID, i+1, len(paths), filepath.Base(filePath))
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

func removeZoneIdentifier(filePath string) {
	zonePath := filePath + ":Zone.Identifier"
	os.Remove(zonePath)
}

// OpenSourceFile opens the file in default app
func (a *App) OpenSourceFile(filePath string) error {

	if !filepath.IsAbs(filePath) {
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)

		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}

	// Remove Windows Internet security flag
	removeZoneIdentifier(filePath)

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

// ShowOpenWithDialog opens the native Windows "Open With" dialog for a file
func (a *App) ShowOpenWithDialog(filePath string) error {
	if !filepath.IsAbs(filePath) {
		home, _ := os.UserHomeDir()
		dlPath := filepath.Join(home, "Downloads", filePath)
		if _, err := os.Stat(dlPath); err == nil {
			filePath = dlPath
		}
	}
	return utils.ShowOpenWithDialog(filePath)
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
