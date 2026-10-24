param(
  [string]$OutputDir = "$PSScriptRoot\..\extension\public\icons",
  [string]$InstallerDir = "$PSScriptRoot\..\installer"
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null

function New-RoundedPath {
  param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $R * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-BrowserXrayBitmap {
  param([int]$Size)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(0.5, $Size * 0.03)
    $radius = $Size * 0.24
    $bgPath = New-RoundedPath $pad $pad ($Size - 2 * $pad) ($Size - 2 * $pad) $radius
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Point(0, 0)),
      (New-Object System.Drawing.Point($Size, $Size)),
      [System.Drawing.Color]::FromArgb(255, 15, 23, 35),
      [System.Drawing.Color]::FromArgb(255, 8, 13, 21)
    )
    $g.FillPath($bgBrush, $bgPath)

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 94, 234, 212), [Math]::Max(0.5, $Size * 0.02))
    $g.DrawPath($borderPen, $bgPath)

    $inset = $Size * 0.28
    $accentBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Point($inset, $inset)),
      (New-Object System.Drawing.Point(($Size - $inset), ($Size - $inset))),
      [System.Drawing.Color]::FromArgb(255, 127, 247, 223),
      [System.Drawing.Color]::FromArgb(255, 67, 207, 224)
    )
    $xPen = New-Object System.Drawing.Pen($accentBrush, [Math]::Max(1.4, $Size * 0.085))
    $xPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $xPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($xPen, $inset, $inset, ($Size - $inset), ($Size - $inset))
    $g.DrawLine($xPen, ($Size - $inset), $inset, $inset, ($Size - $inset))

    $xPen.Dispose()
    $accentBrush.Dispose()
    $borderPen.Dispose()
    $bgBrush.Dispose()
    $bgPath.Dispose()
  } finally {
    $g.Dispose()
  }

  return $bmp
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "Wrote $Path"
}

$sizes = 16, 32, 48, 128, 256
$pngData = @{}

foreach ($size in $sizes) {
  $bmp = New-BrowserXrayBitmap $size
  try {
    $stream = New-Object System.IO.MemoryStream
    try {
      $bmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $pngData[$size] = $stream.ToArray()
    } finally {
      $stream.Dispose()
    }

    if ($size -le 128) {
      Save-Png -Bitmap $bmp -Path (Join-Path $OutputDir "icon$size.png")
    }
  } finally {
    $bmp.Dispose()
  }
}

# Build a multi-resolution PNG-compressed ICO for Windows and Inno Setup.
$icoPath = Join-Path $InstallerDir "BrowserXray.ico"
$file = [System.IO.File]::Create($icoPath)
$writer = New-Object System.IO.BinaryWriter($file)
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$sizes.Count)

  $offset = 6 + (16 * $sizes.Count)
  foreach ($size in $sizes) {
    $data = $pngData[$size]
    $dimension = if ($size -ge 256) { [byte]0 } else { [byte]$size }
    $writer.Write([byte]$dimension)   # width
    $writer.Write([byte]$dimension)   # height
    $writer.Write([byte]0)            # palette count
    $writer.Write([byte]0)            # reserved
    $writer.Write([UInt16]1)          # color planes
    $writer.Write([UInt16]32)         # bits per pixel
    $writer.Write([UInt32]$data.Length)
    $writer.Write([UInt32]$offset)
    $offset += $data.Length
  }

  foreach ($size in $sizes) {
    $writer.Write($pngData[$size])
  }
} finally {
  $writer.Dispose()
  $file.Dispose()
}
Write-Output "Wrote $icoPath"

# Small wizard image: the app icon on transparency.
$smallPath = Join-Path $InstallerDir "WizardSmallImage.png"
$small = New-BrowserXrayBitmap 192
try {
  Save-Png -Bitmap $small -Path $smallPath
} finally {
  $small.Dispose()
}

# Large wizard image: a branded 404x772 panel for the welcome/finish pages.
$wizardWidth = 404
$wizardHeight = 772
$wizard = New-Object System.Drawing.Bitmap($wizardWidth, $wizardHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($wizard)
try {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, $wizardHeight)),
    [System.Drawing.Color]::FromArgb(255, 15, 23, 35),
    [System.Drawing.Color]::FromArgb(255, 8, 13, 21)
  )
  $g.FillRectangle($background, 0, 0, $wizardWidth, $wizardHeight)

  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glowPath.AddEllipse(-140, 30, 684, 520)
  $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
  $glow.CenterColor = [System.Drawing.Color]::FromArgb(38, 67, 207, 224)
  $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 67, 207, 224))
  $g.FillPath($glow, $glowPath)

  $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(12, 255, 255, 255), 1)
  for ($x = 0; $x -lt $wizardWidth; $x += 32) {
    $g.DrawLine($gridPen, $x, 0, $x, $wizardHeight)
  }
  for ($y = 0; $y -lt $wizardHeight; $y += 32) {
    $g.DrawLine($gridPen, 0, $y, $wizardWidth, $y)
  }

  $logo = New-BrowserXrayBitmap 192
  try {
    $g.DrawImage($logo, [int](($wizardWidth - 192) / 2), 116, 192, 192)
  } finally {
    $logo.Dispose()
  }

  $titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", 26, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
  $subtitleFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
  $smallFont = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 127, 247, 223))
  $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
  $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 67, 207, 224), 1)

  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center

  $g.DrawString("BROWSER XRAY", $titleFont, $titleBrush, (New-Object System.Drawing.RectangleF(0, 356, $wizardWidth, 48)), $format)
  $g.DrawString("PRIVATE BROWSER TUNNEL", $subtitleFont, $accentBrush, (New-Object System.Drawing.RectangleF(0, 410, $wizardWidth, 28)), $format)
  $g.DrawLine($accentPen, 132, 454, 272, 454)
  $g.DrawString("VLESS  /  VMESS  /  TROJAN  /  SHADOWSOCKS", $smallFont, $mutedBrush, (New-Object System.Drawing.RectangleF(0, 474, $wizardWidth, 24)), $format)
  $g.DrawString("WINDOWS 10 / 11   -   CHROMIUM", $smallFont, $mutedBrush, (New-Object System.Drawing.RectangleF(0, 706, $wizardWidth, 24)), $format)

  Save-Png -Bitmap $wizard -Path (Join-Path $InstallerDir "WizardImage.png")

  $format.Dispose()
  $accentPen.Dispose()
  $mutedBrush.Dispose()
  $accentBrush.Dispose()
  $titleBrush.Dispose()
  $smallFont.Dispose()
  $subtitleFont.Dispose()
  $titleFont.Dispose()
  $gridPen.Dispose()
  $glow.Dispose()
  $glowPath.Dispose()
  $background.Dispose()
} finally {
  $g.Dispose()
  $wizard.Dispose()
}
