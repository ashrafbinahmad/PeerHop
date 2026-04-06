//go:build !windows

package main

import (
	"peerhop/pkg/logger"
)

type ShareData struct {
	Files []string `json:"files"`
	Text  string   `json:"text"`
	URL   string   `json:"url"`
	Title string   `json:"title"`
}

// GetSharedFiles returns the currently stored share data and clears it
func (a *App) GetSharedFiles() (*ShareData, error) {
	return &ShareData{Files: []string{}}, nil
}

// CheckShareActivation is called from app.go startup.
// On non-Windows platforms, this is a no-op as we handle files via command-line directly if needed,
// but for now, Share Target functionality is primary for Windows via the Shim.
func (a *App) CheckShareActivation() {
	logger.Info("[ShareTarget] No-op for non-Windows platforms")
}
