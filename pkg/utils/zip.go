package utils

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

func CreateZip(paths []string) (string, error) {
	// simple: bundle_timestamp.zip
	zipName := fmt.Sprintf("bundle_%d.zip", time.Now().Unix())

	outFile, err := os.Create(zipName)
	if err != nil {
		return "", err
	}
	defer outFile.Close()

	w := zip.NewWriter(outFile)
	defer w.Close()

	for _, path := range paths {
		// Walk through dirs if path is dir, or add file
		err := addFileToZip(w, path)
		if err != nil {
			return "", err
		}
	}

	return zipName, nil
}

func addFileToZip(w *zip.Writer, src string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	// If directory, walk it
	if info.IsDir() {
		return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				return nil
			}
			// Relative path for zip
			relPath, err := filepath.Rel(filepath.Dir(src), path)

			if err != nil {
				return err
			}
			return addZipEntry(w, path, relPath)
		})
	}

	// Single file
	return addZipEntry(w, src, filepath.Base(src))
}

func addZipEntry(w *zip.Writer, srcPath, zipPath string) error {
	file, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer file.Close()

	f, err := w.Create(zipPath)
	if err != nil {
		return err
	}

	_, err = io.Copy(f, file)
	return err
}
