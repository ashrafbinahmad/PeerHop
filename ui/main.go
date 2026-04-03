package main

import (
	"embed"
	"encoding/json"
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/Microsoft/go-winio"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
	"golang.org/x/sys/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

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

func main() {
	cmdFiles := []string{}
	for _, arg := range os.Args[1:] {
		if info, err := os.Stat(arg); err == nil && !info.IsDir() {
			cmdFiles = append(cmdFiles, arg)
		}
	}

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
	if handle != 0 {
		defer windows.CloseHandle(handle)
	}

	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	werr := wails.Run(&options.App{
		Title:     "PeerHop",
		Width:     768,
		Height:    680,
		MinWidth:  424,
		MinHeight: 500,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Frameless:        true,
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		Windows: &winopts.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Bind: []interface{}{
			app,
		},
	})

	if werr != nil {
		println("Error:", werr.Error())
	}
}
