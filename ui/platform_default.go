//go:build !windows

package main

import (
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
)

func handleSingleInstance(cmdFiles []string) (uintptr, func()) {
	// No-op for now. Single-instance implementation on Linux
	// could be added later (e.g., via DBus).
	return 0, func() {}
}

func getWindowsOptions() *winopts.Options {
    // Return nil for Windows-specific options on non-Windows platforms.
    return nil
}
