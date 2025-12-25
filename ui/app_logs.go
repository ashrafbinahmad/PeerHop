package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"peerhop/pkg/logger"
	"peerhop/pkg/utils"
)

// GetLogPath returns the path to the current log file
func (a *App) GetLogPath() string {
	return logger.GetLogPath()
}

// GetRecentLogs returns the last N lines from the log file
func (a *App) GetRecentLogs(lines int) ([]string, error) {
	return logger.GetRecentLogs(lines)
}

// OpenLogFolder opens the folder containing log files
func (a *App) OpenLogFolder() error {
	logPath := logger.GetLogPath()
	if logPath == "" {
		return fmt.Errorf("logger not initialized")
	}

	return utils.ShowInFolder(logPath)
}

// ExportLogs creates a zip file of all log files and returns the path
func (a *App) ExportLogs() (string, error) {
	logFiles, err := logger.GetLogFiles()
	if err != nil {
		return "", err
	}

	if len(logFiles) == 0 {
		return "", fmt.Errorf("no log files found")
	}

	// Create zip in temp directory
	tempDir := os.TempDir()
	timestamp := time.Now().Format("20060102_150405")
	zipPath := filepath.Join(tempDir, fmt.Sprintf("peerhop_logs_%s.zip", timestamp))

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	for _, logFile := range logFiles {
		if err := addFileToZip(zipWriter, logFile); err != nil {
			logger.Warn("Failed to add %s to zip: %v", logFile, err)
			continue
		}
	}

	logger.Info("Exported logs to: %s", zipPath)
	return zipPath, nil
}

// Helper function to add a file to a zip archive
func addFileToZip(zipWriter *zip.Writer, filename string) error {
	fileToZip, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer fileToZip.Close()

	info, err := fileToZip.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}

	header.Name = filepath.Base(filename)
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, fileToZip)
	return err
}
