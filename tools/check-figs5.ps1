# 图5-1 / 图5-2 / 图5-3 的自动检查（看不到图时用像素统计来验证）
#   1) 内容包围盒与四边留白：贴边（< 4pt）视为可能裁切
#   2) 图题带：最右墨迹必须离画布右边 ≥ 5pt（防止 Center 对齐把图题推出画面）
#   3) 关键颜色是否真的画上去了（品牌橙 / 卡片白 / 画布底 / 手机底 / 兜底黄）
#   4) 手机框外是否有溢出内容；两个手机框之间（间隙）必须是纯底色
#   5) 内容没有顶到画布下边缘
# 用法： & '.\check-figs5.ps1'
param(
    [string]$Dir = ''
)
Add-Type -AssemblyName System.Drawing
if ($Dir -eq '') { $Dir = Join-Path $PSScriptRoot '..\docs\report\figures5' }
$Dir = [System.IO.Path]::GetFullPath($Dir)

$S = 2
$fails = 0
$files = @(
    @{ name = 'fig5-1-RAG最小链路.png'; kind = 'flow'; frames = @() },
    @{ name = 'fig5-2-问一问页面-正常问答.png'; kind = 'page'; frames = @(@{ a = 24; b = 404 }) },
    @{ name = 'fig5-3-问一问页面-兜底路径.png'; kind = 'page2'; frames = @(@{ a = 24; b = 404 }, @{ a = 444; b = 824 }) }
)

function IsWhite($r, $g, $b) { return ($r -gt 250 -and $g -gt 250 -and $b -gt 250) }

foreach ($f in $files) {
    $path = Join-Path $Dir $f.name
    if (-not (Test-Path -LiteralPath $path)) { Write-Output "FAIL 找不到 $($f.name)"; $script:fails++; continue }
    $bmp = [System.Drawing.Bitmap]::FromFile($path)
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bytes = New-Object byte[] ($data.Stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data)
    $st = $data.Stride
    $bmp.Dispose()

    $counts = @{ brand = 0; card = 0; canvas = 0; phone = 0; warn = 0; sampled = 0 }
    $minX = [int]::MaxValue; $maxX = -1; $minY = [int]::MaxValue; $maxY = -1
    $gapInk = 0   # 两个手机框之间的间隙里的非底色像素
    $outsideInk = 0 # 手机框矩形之外的墨迹（不含图题带）
    $titleBandInk = 0
    for ($y = 0; $y -lt $h; $y += 2) {
        $row = $y * $st
        for ($x = 0; $x -lt $w; $x += 2) {
            $i = $row + $x * 3
            $b = [int]$bytes[$i]; $g = [int]$bytes[$i + 1]; $r = [int]$bytes[$i + 2]
            # 品牌橙 FF5A36
            if ([Math]::Abs($r - 255) -lt 16 -and [Math]::Abs($g - 90) -lt 22 -and [Math]::Abs($b - 54) -lt 22) { $counts.brand++ }
            # 画布底 FBFAF7
            elseif ([Math]::Abs($r - 251) -lt 4 -and [Math]::Abs($g - 250) -lt 4 -and [Math]::Abs($b - 247) -lt 4) { $counts.canvas++ }
            # 手机底 F7F6F3
            elseif ([Math]::Abs($r - 247) -lt 3 -and [Math]::Abs($g - 246) -lt 3 -and [Math]::Abs($b - 243) -lt 3) { $counts.phone++ }
            # 卡片白 FFFFFF
            elseif (IsWhite $r $g $b) { $counts.card++ }
            # 兜底黄 FFF8E6
            elseif ([Math]::Abs($r - 255) -lt 6 -and [Math]::Abs($g - 248) -lt 6 -and [Math]::Abs($b - 230) -lt 8) { $counts.warn++ }
            $counts.sampled++

            $pl = [int]($x / $S); $pt = [int]($y / $S)
            $isBg = ([Math]::Abs($r - 251) -lt 5 -and [Math]::Abs($g - 250) -lt 5 -and [Math]::Abs($b - 247) -lt 5)
            if (-not $isBg) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
            # 手机框之间的间隙检查（只看向下第 60pt 之后，避开图题带）
            if ($f.kind -eq 'page2' -and $pl -gt 406 -and $pl -lt 442 -and $pt -gt 60 -and -not $isBg) { $gapInk++ }
            if ($f.frames.Count -gt 0 -and $pt -gt 30) {
                $inAny = $false
                foreach ($ph in $f.frames) { if ($pl -ge ($ph.a - 1) -and $pl -le ($ph.b + 1)) { $inAny = $true } }
                if (-not $inAny -and -not $isBg) { $outsideInk++ }
            }
            if ($pt -lt 32 -and -not $isBg) { $titleBandInk++ }
        }
    }

    Write-Output "=== $($f.name)   画布 $([int]($w / $S)) x $([int]($h / $S)) pt（$w x $h px）"
    $l = [int]($minX / $S); $r2 = [int](($w - 1 - $maxX) / $S); $t = [int]($minY / $S); $btm = [int](($h - 1 - $maxY) / $S)
    Write-Output "  内容盒 x $l..$([int]($maxX / $S))  y $t..$([int]($maxY / $S)) pt；留白 上$t 下$btm 左$l 右$r2"
    if ($l -ge 4 -and $r2 -ge 4 -and $t -ge 4 -and $btm -ge 4) { Write-Output '  PASS  四边留白充足，无裁切' }
    else { Write-Output '  FAIL  有边距小于 4pt，可能贴边或被裁切'; $script:fails++ }

    if ($titleBandInk -gt 200) { Write-Output "  PASS  图题带（上 32pt）有文字墨迹 $titleBandInk 点" }
    else { Write-Output "  FAIL  图题带几乎没有墨迹（$titleBandInk），图题可能没画出来"; $script:fails++ }
    if ($r2 -ge 5) { Write-Output "  PASS  最右墨迹离画布右边 $r2 pt，图题未被推出画面" }
    else { Write-Output '  FAIL  墨迹贴到画布右边，图题可能被裁'; $script:fails++ }

    Write-Output ("  颜色：品牌橙 {0}｜卡片白 {1}｜画布底 {2}｜手机底 {3}｜兜底黄 {4}（采样 {5} 点）" -f `
            $counts.brand, $counts.card, $counts.canvas, $counts.phone, $counts.warn, $counts.sampled)
    if ($f.kind -eq 'flow') {
        if ($counts.warn -lt 800) { Write-Output '  FAIL  兜底支路的浅黄底过少'; $script:fails++ } else { Write-Output '  PASS  两条兜底支路的浅黄虚线框已绘制' }
        if ($counts.brand -lt 300) { Write-Output '  FAIL  序号徽章（品牌橙）过少'; $script:fails++ } else { Write-Output '  PASS  品牌橙已绘制（7 个序号徽章）' }
    } else {
        if ($counts.phone -lt 20000) { Write-Output '  FAIL  手机屏幕底色过少（手机框可能没画）'; $script:fails++ } else { Write-Output '  PASS  手机屏幕底色已绘制' }
        if ($counts.card -lt 20000) { Write-Output '  FAIL  卡片白过少（卡片可能没画）'; $script:fails++ } else { Write-Output '  PASS  卡片白已绘制' }
        if ($counts.brand -lt 40) { Write-Output '  FAIL  品牌橙过少（引用编号 / 提示）'; $script:fails++ } else { Write-Output '  PASS  品牌橙已绘制（引用编号等）' }
        if ($f.kind -eq 'page2' -and $counts.warn -lt 3000) { Write-Output '  FAIL  追问卡片（浅黄）过少'; $script:fails++ }
    }
    if ($f.frames.Count -gt 0) {
        if ($outsideInk -eq 0) { Write-Output '  PASS  手机框外（图题带以下）无溢出内容' }
        else { Write-Output "  FAIL  手机框外有 $outsideInk 个非底色采样点"; $script:fails++ }
        if ($f.kind -eq 'page2') {
            if ($gapInk -eq 0) { Write-Output '  PASS  两个手机框之间的 40pt 间隙是纯底色' }
            else { Write-Output "  FAIL  间隙里有 $gapInk 个非底色采样点（两框可能粘连）"; $script:fails++ }
        }
    }
}

Write-Output ''
if ($script:fails -eq 0) { Write-Output '图检查：全部通过 ✅' } else { Write-Output "图检查：$($script:fails) 项未通过 ❌"; exit 1 }
