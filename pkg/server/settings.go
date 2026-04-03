package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// PersistentSettings holds all settings that should be saved across server restarts
type PersistentSettings struct {
	TextTransferEnabled bool   `json:"textTransferEnabled"`
	SecurityEnabled     bool   `json:"securityEnabled"`
	IsDarkMode          bool   `json:"isDarkMode"`
	ThemeID             string `json:"themeId"`
	AccentID            string `json:"accentId"`
	DesktopDeviceName   string `json:"desktopDeviceName"`
	StaticPortEnabled   bool   `json:"staticPortEnabled"`
	StaticPort          int    `json:"staticPort"`
}

// SettingsManager handles saving and loading settings
type SettingsManager struct {
	mu           sync.RWMutex
	settingsPath string
}

// NewSettingsManager creates a new settings manager
func NewSettingsManager() *SettingsManager {
	// Get app data directory
	appDataDir := os.Getenv("APPDATA")
	if appDataDir == "" {
		// Fallback for non-Windows or if APPDATA not set
		home, _ := os.UserHomeDir()
		appDataDir = filepath.Join(home, ".peerhop")
	} else {
		appDataDir = filepath.Join(appDataDir, "PeerHop")
	}

	// Create directory if it doesn't exist
	os.MkdirAll(appDataDir, 0755)

	settingsPath := filepath.Join(appDataDir, "settings.json")

	return &SettingsManager{
		settingsPath: settingsPath,
	}
}

// LoadSettings loads settings from disk, returns default settings if file doesn't exist
func (sm *SettingsManager) LoadSettings() PersistentSettings {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	// Default settings
	defaults := PersistentSettings{
		TextTransferEnabled: false,
		SecurityEnabled:     true,
		IsDarkMode:          true,
		ThemeID:             "night",
		AccentID:            "blue",
		DesktopDeviceName:   "",
		StaticPortEnabled:   false,
		StaticPort:          9090,
	}

	// Try to read from file
	data, err := os.ReadFile(sm.settingsPath)
	if err != nil {
		// File doesn't exist or can't be read, return defaults
		return defaults
	}

	var settings PersistentSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		// Invalid JSON, return defaults
		return defaults
	}

	return settings
}

// SaveSettings saves settings to disk
func (sm *SettingsManager) SaveSettings(settings PersistentSettings) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(sm.settingsPath, data, 0644)
}
