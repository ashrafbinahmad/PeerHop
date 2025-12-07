package ui

import (
	"fmt"

	"github.com/skip2/go-qrcode"
)

// PrintQRCode generates and prints a QR code to the terminal
func PrintQRCode(url string) {
	q, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		fmt.Printf("Could not generate QR code: %v\n", err)
		return
	}
	// Print the QR code as a string to the terminal
	// Ideally we use something that prints it small enough or use ansi blocks.
	// The library `skip2/go-qrcode` has `StartString` but that might be big.
	// Let's rely on the library's output to stdout via string representation.
	// However, the standard `Write` method writes a PNG. `ToString` returns a string representation.

	fmt.Println(q.ToSmallString(false))
}
