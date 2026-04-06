package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	cmdFiles := []string{}
	for _, arg := range os.Args[1:] {
		if info, err := os.Stat(arg); err == nil && !info.IsDir() {
			cmdFiles = append(cmdFiles, arg)
		}
	}

	// Platform-specific single-instance handling
	_, cleanup := handleSingleInstance(cmdFiles)
	defer cleanup()

	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	werr := wails.Run(&options.App{
		Title:     "PeerHop",
		Width:     768,
		Height:    740,
		MinWidth:  424,
		MinHeight: 500,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Frameless:        true,
		DisableResize:    false,
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 0},
		OnStartup:        app.startup,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		Windows: getWindowsOptions(),
		Mac: &mac.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
		Linux: &linux.Options{
			WindowIsTranslucent: true,
		},
		Bind: []interface{}{
			app,
		},
	})

	if werr != nil {
		println("Error:", werr.Error())
	}
}
