# 渲染 图3-1 核心用户流程图 → PNG（.NET GDI+，无需浏览器/联网）
# 用法： & '.\render-flowchart.ps1'

param(
    [string]$OutFile = "$PSScriptRoot\图3-1-核心用户流程图.png"
)

Add-Type -AssemblyName System.Drawing

$S = 2.0
$W = [int](1200 * $S)
$H = [int](1200 * $S)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$bmp.SetResolution(300, 300)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::White)

function F([double]$px, [string]$style = "Regular") {
    New-Object System.Drawing.Font("Microsoft YaHei", ($px * $S),
        [System.Drawing.FontStyle]::$style,
        [System.Drawing.GraphicsUnit]::Pixel)
}
function Pen([string]$hex, [double]$w, [string]$dash = "Solid") {
    $p = New-Object System.Drawing.Pen(([System.Drawing.ColorTranslator]::FromHtml($hex)), ([float]($w * $S)))
    $p.DashStyle = [System.Drawing.Drawing2D.DashStyle]::$dash
    return $p
}
function Brush([string]$hex) { New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml($hex))) }
function Ln($x1, $y1, $x2, $y2, $pen) { $g.DrawLine($pen, [float]($x1*$S), [float]($y1*$S), [float]($x2*$S), [float]($y2*$S)) }
function TxtC([string]$text, [double]$cx, [double]$cy, $font, $brush, [double]$boxW = 1120) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float](($cx-$boxW/2)*$S), [float](($cy-60)*$S), [float]($boxW*$S), [float](120*$S))
    $g.DrawString($text, $font, $brush, $rect, $sf)
}
# 圆角矩形
function RoundBox([double]$cx, [double]$cy, [double]$w, [double]$h, [string]$fill, [string]$stroke, [string]$text, $font, $tbrush) {
    $x = ($cx - $w/2) * $S; $y = ($cy - $h/2) * $S; $ww = $w * $S; $hh = $h * $S; $r = 16 * $S
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc(($x+$ww-$r), $y, $r, $r, 270, 90)
    $path.AddArc(($x+$ww-$r), ($y+$hh-$r), $r, $r, 0, 90)
    $path.AddArc($x, ($y+$hh-$r), $r, $r, 90, 90)
    $path.CloseFigure()
    $g.FillPath((Brush $fill), $path)
    $g.DrawPath((Pen $stroke 1.4), $path)
    TxtC $text $cx $cy $font $tbrush $w
}
# 菱形（决策）
function Diamond([double]$cx, [double]$cy, [double]$w, [double]$h, [string]$text, $font, $tbrush) {
    $pts = @(
        (New-Object System.Drawing.PointF([float]($cx*$S),        [float](($cy-$h/2)*$S))),
        (New-Object System.Drawing.PointF([float](($cx+$w/2)*$S), [float]($cy*$S))),
        (New-Object System.Drawing.PointF([float]($cx*$S),        [float](($cy+$h/2)*$S))),
        (New-Object System.Drawing.PointF([float](($cx-$w/2)*$S), [float]($cy*$S)))
    )
    $g.FillPolygon((Brush "#FFF7E6"), $pts)
    $g.DrawPolygon((Pen "#B45309" 1.4), $pts)
    TxtC $text $cx $cy $font $tbrush ($w - 40)
}
function ArrowDown([double]$x, [double]$y1, [double]$y2) {
    $pen = Pen "#374151" 1.4
    Ln $x $y1 $x ($y2-9) $pen
    $tip = New-Object System.Drawing.PointF([float]($x*$S), [float]($y2*$S))
    $l   = New-Object System.Drawing.PointF([float](($x-6)*$S), [float](($y2-11)*$S))
    $r   = New-Object System.Drawing.PointF([float](($x+6)*$S), [float](($y2-11)*$S))
    $g.FillPolygon((Brush "#374151"), @($tip, $l, $r))
}
function ArrowLeft([double]$x1, [double]$x2, [double]$y) {
    $pen = Pen "#374151" 1.4
    Ln $x1 $y ($x2+9) $y $pen
    $tip = New-Object System.Drawing.PointF([float]($x2*$S), [float]($y*$S))
    $l   = New-Object System.Drawing.PointF([float](($x2+11)*$S), [float](($y-6)*$S))
    $r   = New-Object System.Drawing.PointF([float](($x2+11)*$S), [float](($y+6)*$S))
    $g.FillPolygon((Brush "#374151"), @($tip, $l, $r))
}
function Tag([string]$text, [double]$cx, [double]$cy) { TxtC $text $cx $cy (F 11) (Brush "#4B5563") 120 }

$cText = Brush "#1F2937"
$fBox  = F 13
$fDia  = F 13

# 标题
TxtC "知食校园 核心用户流程图（图3-1）" 600 36 (F 19 "Bold") $cText

# 主流程
RoundBox 560 100 340 52 "#EEF4FF" "#2B579A" "打开小程序" $fBox $cText
Diamond  560 200 340 84 "是否已有口味 / 忌口画像" $fDia $cText
RoundBox 560 310 340 52 "#EEF4FF" "#2B579A" "选择今日食堂与窗口" $fBox $cText
RoundBox 560 400 340 52 "#EEF4FF" "#2B579A" "选择 / 录入当日候选菜品" $fBox $cText
Diamond  560 500 340 84 "菜品信息是否完整" $fDia $cText
RoundBox 560 610 340 52 "#EEF4FF" "#2B579A" "调用 AI 生成 Top3 推荐与理由" $fBox $cText
Diamond  560 710 340 84 "结果是否可能含忌口 / 过敏食材" $fDia $cText
RoundBox 560 810 340 52 "#EEF4FF" "#2B579A" "展示 Top3 与推荐理由" $fBox $cText
RoundBox 560 900 340 52 "#EEF4FF" "#2B579A" "用户选择并记录今日就餐" $fBox $cText
RoundBox 560 990 340 52 "#EEF4FF" "#2B579A" "就餐后反馈：符合 / 不符合口味" $fBox $cText
RoundBox 560 1080 340 52 "#EEF4FF" "#2B579A" "更新偏好权重，用于下次推荐" $fBox $cText

# 右侧支路（异常 / 人工确认）
RoundBox 980 200 360 52 "#FFF1F2" "#BE123C" "首次设置画像（口味/忌口/目标/预算）" $fBox $cText
RoundBox 980 500 360 52 "#FFF1F2" "#BE123C" "提示配料未知，请现场核对，仅做保守排序" $fBox $cText
RoundBox 980 710 360 52 "#FFF1F2" "#BE123C" "强制提示：可能含有 X，请向窗口确认" $fBox $cText

# 主流程纵向箭头
ArrowDown 560 126 158
ArrowDown 560 242 284
ArrowDown 560 336 374
ArrowDown 560 426 458
ArrowDown 560 542 584
ArrowDown 560 636 668
ArrowDown 560 752 784
ArrowDown 560 836 874
ArrowDown 560 926 964
ArrowDown 560 1016 1054

# 分支箭头（右）
$penA = Pen "#374151" 1.4
Ln 730 200 800 200 $penA
Ln 730 500 800 500 $penA
Ln 730 710 800 710 $penA
# 支路回流：下折再左折进入主流程
Ln 980 226 980 310 $penA;  ArrowLeft 980 730 310
Ln 980 526 980 610 $penA;  ArrowLeft 980 730 610
Ln 980 736 980 810 $penA;  ArrowLeft 980 730 810

# 分支标注
Tag "否" 765 186
Tag "是" 578 263
Tag "否（S6）" 762 486
Tag "是" 578 563
Tag "是（S3）" 762 696
Tag "否" 578 768

# 图例
$sfL = New-Object System.Drawing.StringFormat
$sfL.Alignment = [System.Drawing.StringAlignment]::Near
$rect = New-Object System.Drawing.RectangleF([float](40*$S), [float](1150*$S), [float](1120*$S), [float](24*$S))
$g.DrawString("图例：蓝框 = 处理步骤；菱形 = 决策点；红框 = 异常场景 / 强制人工确认支路（对应场景 S3、S6）。", (F 13), (Brush "#4B5563"), $rect, $sfL)

$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"已生成: $OutFile"
