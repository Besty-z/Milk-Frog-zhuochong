# 从默认桌宠图片生成窗口图标：256x256 方形 PNG（居中裁剪，方便当窗口/任务栏图标）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/make-icon.ps1

$src = Join-Path $PSScriptRoot '..\src\renderer\src\assets\pet.jpg'
$out = Join-Path $PSScriptRoot '..\resources\icon.png'

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($src)
$side = [Math]::Min($img.Width, $img.Height)
$x = [int](($img.Width - $side) / 2)
$y = [int](($img.Height - $side) / 2)

$crop = New-Object System.Drawing.Bitmap($side, $side)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)), (New-Object System.Drawing.Rectangle($x, $y, $side, $side)), [System.Drawing.GraphicsUnit]::Pixel)

$target = 256
$resized = New-Object System.Drawing.Bitmap($target, $target)
$g2 = [System.Drawing.Graphics]::FromImage($resized)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($crop, 0, 0, $target, $target)

$resized.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $g2.Dispose(); $crop.Dispose(); $resized.Dispose(); $img.Dispose()
Write-Output "已生成 $out (${target}x${target})"
