//go:build windows

package main

import (
	"encoding/json"
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/Microsoft/go-winio"
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
	"golang.org/x/sys/windows"
)

var (
	moduser32         = syscall.NewLazyDLL("user32.dll")
	procFindWindowW   = moduser32.NewProc("FindWindowW")
	procShowWindow    = moduser32.NewProc("ShowWindow")
	procSetForeground = moduser32.NewProc("SetForegroundWindow")
)

func findAndFocusExistingWindow(title string) {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	if hwnd != 0 {
		procShowWindow.Call(hwnd, 9) // SW_RESTORE = 9
		procSetForeground.Call(hwnd)
	}
}

func sendShareToExistingInstance(files []string) bool {
	if len(files) == 0 {
		return false
	}

	data := struct {
		Title string   `json:"title"`
		Files []string `json:"files"`
	}{
		Title: "Shared from command-line",
		Files: files,
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return false
	}

	pipeName := `\\.\pipe\peerhop-share`
	for i := 0; i < 5; i++ {
		conn, err := winio.DialPipe(pipeName, nil)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		_, err = conn.Write(payload)
		conn.Close()
		return err == nil
	}
	return false
}

func handleSingleInstance(cmdFiles []string) (uintptr, func()) {
	// Single-instance guard: create a named mutex so only one window can run.
	mutexName, _ := windows.UTF16PtrFromString("Local\\PeerHopSingleInstance")
	handle, err := windows.CreateMutex(nil, true, mutexName)
	if err != nil && err != windows.ERROR_ALREADY_EXISTS {
		panic(err)
	}
	if err == windows.ERROR_ALREADY_EXISTS {
		if len(cmdFiles) > 0 {
			sendShareToExistingInstance(cmdFiles)
		}
		findAndFocusExistingWindow("PeerHop")
		os.Exit(0)
	}
	
	cleanup := func() {
		if handle != 0 {
			windows.CloseHandle(handle)
		}
	}
	
	return uintptr(handle), cleanup
}

func getWindowsOptions() *winopts.Options {
	return &winopts.Options{
		WebviewIsTransparent: true,
		WindowIsTranslucent:  true,
	}
}
