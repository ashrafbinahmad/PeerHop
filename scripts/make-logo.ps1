# Draws the PeerHop logo (two white peers joined by a hopping arc on a
# teal-to-indigo tile) with GDI+ and writes every icon file the build uses:
#   ui/frontend/src/assets/images/appicon.png   window icon + in-app logo (include_bytes!)
#   ui/build/windows/icon.ico                   exe icon (build.rs)
#   ui/build/appicon.png and the appicon*/logo-universal tiles   MSIX (build-msix.js)
#   assets/header.png                           README banner
# The web UI imports appicon.png / logo-universal.png, so rebuild it
# (npm run build in ui/frontend) after re-running.
# Re-run after editing the drawing to re-brand everything.
#
# Usage: .\scripts\make-logo.ps1 [-OutDir <dir>]   (OutDir: write a preview set there instead)

param([string]$OutDir)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

$N = 1024
$light = [System.Drawing.Color]::FromArgb(255, 45, 212, 191)   # teal
$dark  = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)    # indigo
function P($x, $y) { New-Object System.Drawing.PointF $x, $y }

function New-Logo([int]$r) {
    $bmp = New-Object System.Drawing.Bitmap $N, $N
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded-square tile (or full-bleed square when r = 0) with a diagonal gradient.
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($r -gt 0) {
        $tile.AddArc(0, 0, 2*$r, 2*$r, 180, 90)
        $tile.AddArc($N - 2*$r, 0, 2*$r, 2*$r, 270, 90)
        $tile.AddArc($N - 2*$r, $N - 2*$r, 2*$r, 2*$r, 0, 90)
        $tile.AddArc(0, $N - 2*$r, 2*$r, 2*$r, 90, 90)
        $tile.CloseFigure()
    } else {
        $tile.AddRectangle((New-Object System.Drawing.Rectangle 0, 0, $N, $N))
    }
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (P 0 0), (P $N $N), $light, $dark
    $g.FillPath($grad, $tile)

    $white = [System.Drawing.Brushes]::White

    # Two peers: the sender a white ring, the receiver a solid dot.
    $pr = 96; $ly = 690; $lx = 262; $rx = 762
    $ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 54
    $g.DrawEllipse($ring, $lx - $pr + 27, $ly - $pr + 27, 2*$pr - 54, 2*$pr - 54)
    $g.FillEllipse($white, $rx - $pr, $ly - $pr, 2*$pr, 2*$pr)

    # The hop: an arc leaving the sender, peaking high, and landing on the receiver.
    $p0 = P $lx ($ly - $pr - 40)
    $c1 = P ($lx + 40) 170
    $c2 = P ($rx - 40) 170
    $p3 = P $rx ($ly - $pr - 150)
    $hop = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 72
    $hop.StartCap = "Round"; $hop.EndCap = "Flat"
    $g.DrawBezier($hop, $p0, $c1, $c2, $p3)

    # Arrowhead at the landing point, aligned with the curve's end tangent.
    $dx = $p3.X - $c2.X; $dy = $p3.Y - $c2.Y
    $len = [Math]::Sqrt($dx*$dx + $dy*$dy); $ux = $dx/$len; $uy = $dy/$len
    $nx = -$uy; $ny = $ux
    $head = 175; $half = 112
    $tip = P ($p3.X + $ux*($head - 20)) ($p3.Y + $uy*($head - 20))
    $b1 = P ($p3.X - $ux*20 + $nx*$half) ($p3.Y - $uy*20 + $ny*$half)
    $b2 = P ($p3.X - $ux*20 - $nx*$half) ($p3.Y - $uy*20 - $ny*$half)
    $g.FillPolygon($white, [System.Drawing.PointF[]]@($tip, $b1, $b2))

    $g.Dispose()
    return ,$bmp
}

function Resize($src, [int]$size) {
    $out = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = "HighQualityBicubic"
    $g.SmoothingMode = "AntiAlias"
    $g.PixelOffsetMode = "HighQuality"
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    return ,$out
}

function Save-Png($bmp, [string]$path) {
    New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# Multi-resolution .ico with PNG-compressed entries (supported since Vista).
function Save-Ico($src, [int[]]$sizes, [string]$path) {
    $pngs = foreach ($s in $sizes) {
        $ms = New-Object System.IO.MemoryStream
        (Resize $src $s).Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        ,$ms.ToArray()
    }
    $fs = [System.IO.File]::Create($path)
    $w = New-Object System.IO.BinaryWriter $fs
    $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $d = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
        $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0)
        $w.Write([UInt16]1); $w.Write([UInt16]32)
        $w.Write([UInt32]$pngs[$i].Length); $w.Write([UInt32]$offset)
        $offset += $pngs[$i].Length
    }
    foreach ($p in $pngs) { $w.Write($p) }
    $w.Close()
}

# README banner: logo, wordmark, tagline and feature line on a soft background.
function New-Header {
    $W = 1024; $H = 420
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAliasGridFit"
    $g.InterpolationMode = "HighQualityBicubic"
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (P 0 0), (P $W $H), `
        ([System.Drawing.Color]::FromArgb(255, 240, 253, 250)), ([System.Drawing.Color]::FromArgb(255, 238, 242, 255))
    $g.FillRectangle($bg, 0, 0, $W, $H)
    $g.DrawImage($rounded, 120, 110, 200, 200)
    $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 27, 75))
    $sub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
    $word = New-Object System.Drawing.Drawing2D.LinearGradientBrush (P 360 0), (P 860 0), `
        ([System.Drawing.Color]::FromArgb(255, 13, 148, 136)), $dark
    $g.DrawString("PeerHop", (New-Object System.Drawing.Font "Segoe UI", 76, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)), $word, 352, 112)
    $g.DrawString("Simple, fast, local file transfer.", (New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.GraphicsUnit]::Pixel)), $ink, 360, 214)
    $g.DrawString("Wi-Fi direct  ·  No cloud or login  ·  Cross-platform  ·  Open source", (New-Object System.Drawing.Font "Segoe UI", 20, ([System.Drawing.GraphicsUnit]::Pixel)), $sub, 362, 266)
    $g.Dispose()
    return ,$bmp
}

$rounded = New-Logo 230
# Full-bleed variant for MSIX tiles: Start and the installer draw tiles on a
# solid plate, so transparent rounded corners would show its colour.
$square = New-Logo 0

if ($OutDir) {
    Save-Png $rounded "$OutDir\logo.png"
    Save-Png (Resize $rounded 256) "$OutDir\logo-256.png"
    Save-Png $square "$OutDir\logo-square.png"
    Save-Png (Resize $rounded 44) "$OutDir\logo-44.png"
    Save-Png (New-Header) "$OutDir\header.png"
    Write-Host "Wrote preview to $OutDir"
    return
}

$img = "$root\ui\frontend\src\assets\images"
Save-Png (New-Header) "$root\assets\header.png"
Save-Png (Resize $rounded 512) "$img\appicon.png"
Save-Png (Resize $square 512) "$img\logo-universal.png"
Save-Png (Resize $square 150) "$img\appicon150x150.png"
Save-Png (Resize $square 44) "$img\appicon44x44.png"
Save-Png (Resize $rounded 44) "$img\appicon44x44.targetsize-44_altform-unplated.png"
Save-Png (Resize $rounded 48) "$img\appicon44x44.targetsize-48_altform-unplated.png"
Save-Png (Resize $rounded 256) "$img\appicon44x44.targetsize-256_altform-unplated.png"
Save-Ico $rounded @(16, 24, 32, 44, 48) "$img\appicon44x44.ico"
Save-Png (Resize $square 512) "$root\ui\build\appicon.png"
Save-Ico $rounded @(16, 24, 32, 48, 64, 128, 256) "$root\ui\build\windows\icon.ico"
Write-Host "Wrote PeerHop icons (appicon.png, icon.ico, MSIX tiles)"
