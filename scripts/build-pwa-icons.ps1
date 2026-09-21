param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$iconDirectory = Join-Path $projectRoot 'assets\icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = 2 * $radius
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Write-PwaIcon([int]$size, [string]$fileName, [bool]$maskable) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $red = [System.Drawing.Color]::FromArgb(205, 68, 51)
  $dark = [System.Drawing.Color]::FromArgb(13, 13, 14)
  $background = New-Object System.Drawing.SolidBrush($red)
  $foreground = New-Object System.Drawing.SolidBrush($dark)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font('Arial', ($size * 0.265), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  try {
    if ($maskable) {
      $graphics.Clear($red)
      $diameter = $size * 0.70
      $offset = ($size - $diameter) / 2
      $graphics.FillEllipse($foreground, $offset, $offset, $diameter, $diameter)
    } else {
      $graphics.Clear($dark)
      $offset = $size * 0.105
      $width = $size - 2 * $offset
      $path = New-RoundedPath $offset $offset $width $width ($size * 0.115)
      try { $graphics.FillPath($background, $path) } finally { $path.Dispose() }
    }
    $textBounds = New-Object System.Drawing.RectangleF(0, ($size * 0.01), $size, ($size * 0.98))
    $graphics.DrawString('CPS', $font, $white, $textBounds, $format)
    $target = Join-Path $iconDirectory $fileName
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host ("{0}: {1}x{1}" -f $target, $size)
  } finally {
    $format.Dispose()
    $font.Dispose()
    $white.Dispose()
    $foreground.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

Write-PwaIcon 180 'cps-180.png' $false
Write-PwaIcon 192 'cps-192.png' $false
Write-PwaIcon 512 'cps-512.png' $false
Write-PwaIcon 512 'cps-maskable-512.png' $true
