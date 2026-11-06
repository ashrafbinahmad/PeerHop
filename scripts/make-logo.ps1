# Draws the PeerHop logo (a white curved arrow on a blue tile) with GDI+ and writes every icon file the build uses:
#   ui/frontend/src/assets/images/appicon.png   window icon + in-app logo (include_bytes!)
#   ui/build/windows/icon.ico                   exe icon (build.rs)
#   ui/build/appicon.png and the appicon*/logo-universal tiles   MSIX (build-msix.js)
#   assets/header.png                           README banner
# and, when checked out next to this repo, the sites' copies:
#   ../PeerHop-landing/public (favicons, PWA icons, banner)   ../PeerHop-web/public (favicon, logo, PWA icons)
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
$blue = [System.Drawing.Color]::FromArgb(255, 37, 117, 186)    # wordmark
$top  = [System.Drawing.Color]::FromArgb(255, 64, 156, 250)    # tile gradient, top left
$deep = [System.Drawing.Color]::FromArgb(255, 26, 94, 214)     #   ... to bottom right
$mist = [System.Drawing.Color]::FromArgb(255, 235, 245, 251)   # banner background
function P($x, $y) { New-Object System.Drawing.PointF $x, $y }

# A white curved arrow sweeping up and out to the right on a blue gradient
# tile, drawn as round-capped strokes (feather-icon style).
# $r: tile corner radius; 0 = full-bleed square (MSIX tiles sit on a solid plate).
function New-Logo([int]$r) {
    $bmp = New-Object System.Drawing.Bitmap $N, $N
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.Clear([System.Drawing.Color]::Transparent)

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
    $g.FillPath((New-Object System.Drawing.Drawing2D.LinearGradientBrush (P 0 0), (P $N $N), $top, $deep), $tile)

    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 76
    $pen.StartCap = "Round"; $pen.EndCap = "Round"; $pen.LineJoin = "Round"

    # The hop: from lower left, along the bottom, then up to the top right.
    $p0 = P 260 720; $c1 = P 530 732; $c2 = P 610 470; $p3 = P 760 300
    $g.DrawBezier($pen, $p0, $c1, $c2, $p3)

    # Open chevron head on the end tangent.
    $dx = $p3.X - $c2.X; $dy = $p3.Y - $c2.Y
    $len = [Math]::Sqrt($dx*$dx + $dy*$dy); $ux = $dx/$len; $uy = $dy/$len
    $arm = 190; $a = 0.75
    foreach ($s in 1, -1) {
        $cs = [Math]::Cos($a); $sn = [Math]::Sin($a) * $s
        $bx = -($ux*$cs - $uy*$sn); $by = -($ux*$sn + $uy*$cs)
        $g.DrawLine($pen, $p3, (P ($p3.X + $bx*$arm) ($p3.Y + $by*$arm)))
    }

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
        ([System.Drawing.Color]::FromArgb(255, 248, 251, 254)), $mist
    $g.FillRectangle($bg, 0, 0, $W, $H)
    $g.DrawImage($rounded, 120, 110, 200, 200)
    $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 27, 75))
    $sub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 71, 85, 105))
    $word = New-Object System.Drawing.SolidBrush $blue
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
# App list / taskbar icon: rounded on transparent. With the "unplated"
# targetsize set (indexed by makepri in build-msix.js) Windows draws no
# accent-colour plate behind it.
Save-Png (Resize $rounded 44) "$img\appicon44x44.png"
foreach ($sz in 16, 24, 32, 44, 48, 256) {
    Save-Png (Resize $rounded $sz) "$img\appicon44x44.targetsize-${sz}_altform-unplated.png"
}
Save-Png (Resize $square 512) "$root\ui\build\appicon.png"
Save-Ico $rounded @(16, 24, 32, 48, 64, 128, 256) "$root\ui\build\windows\icon.ico"
Write-Host "Wrote PeerHop icons (appicon.png, icon.ico, MSIX tiles)"

$landing = Join-Path (Split-Path -Parent $root) "PeerHop-landing"
if (Test-Path $landing) {
    $pub = "$landing\public"
    Copy-Item "$root\assets\logo.svg" "$pub\favicon.svg"
    Save-Ico $rounded @(16, 32, 48) "$pub\favicon.ico"
    Save-Ico $rounded @(16, 32, 48) "$landing\src\app\favicon.ico"
    Save-Png (Resize $rounded 96) "$pub\favicon-96x96.png"
    Save-Png (Resize $square 180) "$pub\apple-touch-icon.png"   # iOS rounds it itself
    Save-Png (Resize $rounded 192) "$pub\web-app-manifest-192x192.png"
    Save-Png (Resize $rounded 512) "$pub\web-app-manifest-512x512.png"
    Save-Png (New-Header) "$pub\assets\header.png"
    Write-Host "Wrote PeerHop-landing icons"
}
$web = Join-Path (Split-Path -Parent $root) "PeerHop-web"
if (Test-Path $web) {
    $pub = "$web\public"
    Save-Ico $rounded @(16, 32, 48) "$pub\favicon.ico"
    Save-Png (Resize $rounded 512) "$pub\logo.png"
    Save-Png (Resize $rounded 192) "$pub\icon-192.png"
    Save-Png (Resize $rounded 512) "$pub\icon-512.png"
    Save-Png (Resize $square 512) "$pub\icon-maskable-512.png"   # full bleed: launchers crop it
    Write-Host "Wrote PeerHop-web icons"
}
