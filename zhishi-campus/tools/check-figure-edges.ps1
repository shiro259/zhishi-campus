# 图示"贴边"检查：扫描每张图四边若干像素，检查是否还有非白色内容，避免内容被裁切或顶到画布边缘。
# 用法： powershell -File .\check-figure-edges.ps1
# 说明：即使无法肉眼看图，也能据此确认排版没有贴边/裁切问题（阈值 6 行）。

Add-Type -AssemblyName System.Drawing
$dir = 'E:\作业3\zhishi-campus\docs\report'
$band = 6          # 边缘带宽（像素）
$threshold = 245   # RGB 低于该值视为"有内容"

foreach ($file in (Get-ChildItem "$dir\*.png" | Sort-Object Name)) {
    $bmp = New-Object System.Drawing.Bitmap($file.FullName)
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data)

    $hits = @{ top = 0; bottom = 0; left = 0; right = 0 }
    # 上/下边：逐行统计该行内非白像素数
    for ($y = 0; $y -lt $band; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            $i = $y * $stride + $x * 3
            if ($bytes[$i] -lt $threshold -or $bytes[$i+1] -lt $threshold -or $bytes[$i+2] -lt $threshold) { $hits.top++; break }
        }
        $yy = $h - 1 - $y
        for ($x = 0; $x -lt $w; $x++) {
            $i = $yy * $stride + $x * 3
            if ($bytes[$i] -lt $threshold -or $bytes[$i+1] -lt $threshold -or $bytes[$i+2] -lt $threshold) { $hits.bottom++; break }
        }
    }
    for ($x = 0; $x -lt $band; $x++) {
        for ($y = 0; $y -lt $h; $y++) {
            $i = $y * $stride + $x * 3
            if ($bytes[$i] -lt $threshold -or $bytes[$i+1] -lt $threshold -or $bytes[$i+2] -lt $threshold) { $hits.left++; break }
        }
        $xx = $w - 1 - $x
        for ($y = 0; $y -lt $h; $y++) {
            $i = $y * $stride + $xx * 3
            if ($bytes[$i] -lt $threshold -or $bytes[$i+1] -lt $threshold -or $bytes[$i+2] -lt $threshold) { $hits.right++; break }
        }
    }
    $bmp.Dispose()
    $worst = ($hits.Values | Measure-Object -Maximum).Maximum
    $flag = if ($worst -gt 0) { "⚠ 贴边(边缘带内有 $worst 行/列有内容)" } else { "OK" }
    "{0,-46} {1,5}x{2,-5} 上{3} 下{4} 左{5} 右{6}  {7}" -f $file.Name, $w, $h, $hits.top, $hits.bottom, $hits.left, $hits.right, $flag
}
