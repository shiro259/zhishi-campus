# 渲染 图B-1 用例图 → PNG（使用 .NET GDI+，无需浏览器/联网）
# 用法： pwsh -File .\render-usecase.ps1
# 重新生成：改下面的坐标或文字后再次运行即可。

param(
    [string]$OutFile = "$PSScriptRoot\图B-1-用例图.png"
)

Add-Type -AssemblyName System.Drawing

$S = 2.0                     # 超采样倍数（2 → 2300×1880 像素）
$W = [int](1150 * $S)
$H = [int](940 * $S)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$bmp.SetResolution(300, 300) # 300dpi → 插入 Word 后约 19.5cm 宽
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
# 以中心点绘制居中文本
function TxtC([string]$text, [double]$cx, [double]$cy, $font, $brush) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float](($cx-560)*$S), [float](($cy-60)*$S), [float](1120*$S), [float](120*$S))
    $g.DrawString($text, $font, $brush, $rect, $sf)
}

$cInk   = Brush "#111827"
$cText  = Brush "#1F2937"
$cBox   = Brush "#374151"
$cGray  = Brush "#4B5563"
$cAmber = Brush "#B45309"
$cUCfill = Brush "#EEF4FF"

# ── 标题 ─────────────────────────────────────────────
TxtC "知食校园 用例图（图B-1）" 575 32 (F 19 "Bold") $cText

# ── 系统边界 ─────────────────────────────────────────
$penBox = Pen "#374151" 1.6
$g.DrawRectangle($penBox, [float](400*$S), [float](60*$S), [float](360*$S), [float](815*$S))
TxtC "知食校园（微信小程序）" 580 92 (F 15 "Bold") $cBox

# ── 用例（8 个） ─────────────────────────────────────
$penUC = Pen "#2B579A" 1.4
$fontUC = F 14
$cases = @(
    @{ y = 150; t = "UC-01 设置/修改个人画像" },
    @{ y = 245; t = "UC-02 维护当日菜单" },
    @{ y = 340; t = "UC-03 查看当日候选菜品" },
    @{ y = 435; t = "UC-04 获取 AI 推荐 Top3" },
    @{ y = 530; t = "UC-05 忌口/过敏提示并确认" },
    @{ y = 625; t = "UC-06 记录今日就餐" },
    @{ y = 720; t = "UC-07 提交就餐反馈" },
    @{ y = 815; t = "UC-08 清空个人数据" }
)
foreach ($c in $cases) {
    $g.FillEllipse($cUCfill, [float](440*$S), [float](($c.y-30)*$S), [float](280*$S), [float](60*$S))
    $g.DrawEllipse($penUC,  [float](440*$S), [float](($c.y-30)*$S), [float](280*$S), [float](60*$S))
    TxtC $c.t 580 $c.y $fontUC $cText
}

# ── 学生（主要参与者） ────────────────────────────────
$penActor = Pen "#111827" 2
$g.DrawEllipse($penActor, [float]((150-18)*$S), [float]((418-18)*$S), [float](36*$S), [float](36*$S))
Ln 150 436 150 492 $penActor
Ln 112 458 188 458 $penActor
Ln 150 492 118 532 $penActor
Ln 150 492 182 532 $penActor
TxtC "学生（主要参与者）" 150 572 (F 15 "Bold") $cInk

# ── 关联线：学生 → 各用例 ────────────────────────────
$penAssoc = Pen "#374151" 1.3
foreach ($c in $cases) { Ln 190 458 440 $c.y $penAssoc }

# ── LLM 服务（支撑参与者） ───────────────────────────
$g.DrawEllipse($penActor, [float]((1010-18)*$S), [float]((395-18)*$S), [float](36*$S), [float](36*$S))
Ln 1010 413 1010 469 $penActor
Ln 972 435 1048 435 $penActor
Ln 1010 469 978 509 $penActor
Ln 1010 469 1042 509 $penActor
TxtC "LLM 服务（支撑参与者）" 1010 549 (F 15 "Bold") $cInk
Ln 972 435 720 435 $penAssoc

# ── 用例之间的关系（include / extend） ───────────────
$penDep = Pen "#B45309" 1.5 "Dash"
$rels = @(
    @{ y1 = 310; y2 = 277; label = "«include»"; ly = 299 },
    @{ y1 = 500; y2 = 467; label = "«extend»";  ly = 489 },
    @{ y1 = 690; y2 = 657; label = "«include»"; ly = 679 }
)
$fontRel = F 12
foreach ($r in $rels) {
    Ln 580 $r.y1 580 $r.y2 $penDep
    # 箭头（朝上）
    $tip = New-Object System.Drawing.PointF([float](580*$S), [float]($r.y2*$S))
    $l   = New-Object System.Drawing.PointF([float]((580-6)*$S), [float](($r.y2+11)*$S))
    $rr  = New-Object System.Drawing.PointF([float]((580+6)*$S), [float](($r.y2+11)*$S))
    $g.FillPolygon($cAmber, @($tip, $l, $rr))
    $sfL = New-Object System.Drawing.StringFormat
    $sfL.Alignment = [System.Drawing.StringAlignment]::Near
    $sfL.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float](592*$S), [float](($r.ly-10)*$S), [float](150*$S), [float](20*$S))
    $g.DrawString($r.label, $fontRel, $cAmber, $rect, $sfL)
}

# ── 图例 ─────────────────────────────────────────────
$sfL2 = New-Object System.Drawing.StringFormat
$sfL2.Alignment = [System.Drawing.StringAlignment]::Near
$rect2 = New-Object System.Drawing.RectangleF([float](60*$S), [float](898*$S), [float](1060*$S), [float](24*$S))
$g.DrawString("图例：实线 = 参与者与用例的关联；虚线 = 用例之间的 include（包含）/ extend（扩展）关系；方框 = 系统边界。", (F 13), $cGray, $rect2, $sfL2)

$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"已生成: $OutFile"
