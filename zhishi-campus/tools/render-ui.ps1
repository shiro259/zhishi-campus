# 渲染 图3-6—图3-10 关键界面原型 与 图3-5 页面导航关系图 → PNG
# 手绘风格线框（wireframe），使用 .NET GDI+，无需浏览器、无需联网。
# 用法： powershell -File .\render-ui.ps1
# （本文件必须以 UTF-8 BOM 保存，Windows PowerShell 5.1 才能正确读入中文）

param(
    [string]$OutDir = "$PSScriptRoot\..\docs\report"
)

Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$S = 2.0

function New-Canvas([double]$w, [double]$h) {
    $bmp = New-Object System.Drawing.Bitmap([int]($w * $S), [int]($h * $S))
    $bmp.SetResolution(300, 300)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::White)
    return @{ bmp = $bmp; g = $g }
}
function F([double]$px, [string]$style = "Regular") {
    New-Object System.Drawing.Font("Microsoft YaHei", ($px * $S), [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel)
}
function Pen([string]$hex, [double]$w, [string]$dash = "Solid") {
    $p = New-Object System.Drawing.Pen(([System.Drawing.ColorTranslator]::FromHtml($hex)), ([float]($w * $S)))
    $p.DashStyle = [System.Drawing.Drawing2D.DashStyle]::$dash
    $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $p
}
function Br([string]$hex) { New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml($hex))) }
function Init-G($g) { $script:G = $g }
function Ln($x1, $y1, $x2, $y2, $pen) { $G.DrawLine($pen, [float]($x1 * $S), [float]($y1 * $S), [float]($x2 * $S), [float]($y2 * $S)) }
function BoxR([double]$x, [double]$y, [double]$w, [double]$h, [string]$hex, [double]$pw = 1.2, [string]$dash = "Solid") {
    $G.DrawRectangle((Pen $hex $pw $dash), [float]($x * $S), [float]($y * $S), [float]($w * $S), [float]($h * $S))
}
function FillBox([double]$x, [double]$y, [double]$w, [double]$h, [string]$fill, [string]$stroke, [double]$pw = 1.2) {
    $G.FillRectangle((Br $fill), [float]($x * $S), [float]($y * $S), [float]($w * $S), [float]($h * $S))
    if ($stroke) { BoxR $x $y $w $h $stroke $pw }
}
function RoundRectPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
    $xx = $x * $S; $yy = $y * $S; $ww = $w * $S; $hh = $h * $S; $rr = $r * $S
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($xx, $yy, $rr, $rr, 180, 90)
    $p.AddArc(($xx + $ww - $rr), $yy, $rr, $rr, 270, 90)
    $p.AddArc(($xx + $ww - $rr), ($yy + $hh - $rr), $rr, $rr, 0, 90)
    $p.AddArc($xx, ($yy + $hh - $rr), $rr, $rr, 90, 90)
    $p.CloseFigure()
    return $p
}
function RBox([double]$x, [double]$y, [double]$w, [double]$h, [string]$fill, [string]$stroke, [string]$text, $font, $tbrush, [double]$rad = 6, [double]$pw = 1.2) {
    $path = RoundRectPath $x $y $w $h $rad
    if ($fill) { $G.FillPath((Br $fill), $path) }
    $G.DrawPath((Pen $stroke $pw), $path)
    if ($text) {
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF([float](($x + 3) * $S), [float](($y + 2) * $S), [float](($w - 6) * $S), [float](($h - 4) * $S))
        $G.DrawString($text, $font, $tbrush, $rect, $sf)
    }
}
function Txt([string]$text, [double]$x, [double]$y, [double]$w, [double]$h, $font, $brush, [string]$align = "Center", [string]$valign = "Center") {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::$align
    $sf.LineAlignment = [System.Drawing.StringAlignment]::$valign
    $rect = New-Object System.Drawing.RectangleF([float]($x * $S), [float]($y * $S), [float]($w * $S), [float]($h * $S))
    $G.DrawString($text, $font, $brush, $rect, $sf)
}
function Arrow([double]$x1, [double]$y1, [double]$x2, [double]$y2, [string]$color = "#374151", [double]$w = 1.3, [string]$dash = "Solid") {
    Ln $x1 $y1 $x2 $y2 (Pen $color $w $dash)
    $dx = $x2 - $x1; $dy = $y2 - $y1
    $len = [math]::Sqrt($dx * $dx + $dy * $dy)
    if ($len -lt 0.001) { return }
    $ux = $dx / $len; $uy = $dy / $len
    $px = -$uy; $py = $ux
    $tip = New-Object System.Drawing.PointF([float]($x2 * $S), [float]($y2 * $S))
    $l = New-Object System.Drawing.PointF([float](($x2 - $ux * 10 + $px * 5) * $S), [float](($y2 - $uy * 10 + $py * 5) * $S))
    $r = New-Object System.Drawing.PointF([float](($x2 - $ux * 10 - $px * 5) * $S), [float](($y2 - $uy * 10 - $py * 5) * $S))
    $G.FillPolygon((Br $color), @($tip, $l, $r))
}
function Save-Canvas($canvas, [string]$out) {
    Init-G $canvas.g
    $canvas.g.Dispose()
    $canvas.bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.bmp.Dispose()
    "已生成: $out"
}

$cInk = "#111827"; $cText = "#1F2937"; $cGray = "#4B5563"; $cLine = "#94A3B8"
$cBlue = "#2B579A"; $cGreen = "#047857"; $cRed = "#BE123C"; $cAmber = "#B45309"
$fTitle = F 18 "Bold"; $fH = F 12 "Bold"; $fB = F 11; $fS = F 10; $fT = F 9

# ── 手机线框容器：共 6 屏，每屏 5 个区域的绘制函数 ──
$phoneW = 360; $phoneH = 700
function Phone-Start($canvas, [double]$x, [double]$y, [string]$title, [string]$pageName) {
    Init-G $canvas.g
    FillBox $x $y $phoneW $phoneH "#FFFFFF" "#111827" 2
    RBox ($x + 130) ($y + 7) 100 16 "" $cLine "" $fS (Br $cGray) 8 1
    Txt "状态栏 9:41" ($x + 8) ($y + 7) 110 16 $fT (Br $cGray) "Near"
    FillBox $x ($y + 28) $phoneW 30 "#F1F5F9" $cLine 1
    Txt $title ($x + 60) ($y + 28) ($phoneW - 120) 30 $fH (Br $cInk)
    Txt "‹ 返回" ($x + 6) ($y + 28) 52 30 $fT (Br $cBlue) "Near"
    Txt "⋯" ($x + $phoneW - 26) ($y + 28) 20 30 $fB (Br $cGray)
    Txt $pageName ($x + 8) ($y + $phoneH - 16) 200 14 $fT (Br $cGray) "Near"
}
# 底部导航（4 项，核心流程在推荐页）
function Phone-TabBar($canvas, [double]$x, [double]$y, [int]$active) {
    Init-G $canvas.g
    $ty = $y + $phoneH - 52
    FillBox $x $ty $phoneW 52 "#F8FAFC" $cLine 1
    $tabs = @("首页", "菜单", "推荐", "记录")
    for ($i = 0; $i -lt 4; $i++) {
        $tx = $x + 8 + $i * 88
        $fill = if ($i -eq $active) { "#EEF4FF" } else { "" }
        $col = if ($i -eq $active) { $cBlue } else { $cGray }
        RBox $tx ($ty + 8) 76 34 $fill $col ("▢ " + $tabs[$i]) $fS (Br $col) 6 1
    }
}
# 标注：编号圆点 + 说明文字（右侧）
function Note([double]$nx, [double]$ny, [string]$text, [double]$maxW = 300) {
    Txt $text $nx $ny $maxW 40 $fT (Br $cAmber) "Near" "Near"
}
function TagNo([double]$cx, [double]$cy, [string]$n, [string]$color = "#B45309") {
    $G.FillEllipse((Br $color), [float](($cx - 8) * $S), [float](($cy - 8) * $S), [float](16 * $S), [float](16 * $S))
    Txt $n ($cx - 8) ($cy - 8) 16 16 $fT (Br "#FFFFFF")
}

# ══════════════════════════════════════════════════════════════
# 图3-6 首页 / 入口页 P1
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 900 760; Init-G $cv.g
Txt "图3-6 关键界面原型①：首页 / 入口页（P1：pages/home）" 30 14 840 28 $fTitle (Br $cText)
$px = 40; $py = 50
Phone-Start $cv $px $py "知食校园 · 首页" "P1 pages/home"
Init-G $cv.g
FillBox ($px + 12) ($py + 70) 336 66 "#EEF4FF" $cBlue 1
Txt "今天吃什么？" ($px + 24) ($py + 76) 200 22 $fH (Br $cBlue) "Near"
Txt "出发前 30 秒，先看清菜单再排队" ($px + 24) ($py + 100) 240 18 $fS (Br $cText) "Near"
RBox ($px + 230) ($py + 82) 106 42 "#2B579A" $cBlue "开始选餐 →" $fB (Br "#FFFFFF") 6 1
TagNo ($px + 224) ($py + 80) "1"
Note 420 96 "① 主行动按钮：进入核心任务的唯一入口，一键直达推荐页（≤1 次点击）。"

FillBox ($px + 12) ($py + 146) 336 96 "#FFFFFF" $cLine 1
Txt "今日菜单状态" ($px + 24) ($py + 152) 160 18 $fH (Br $cInk) "Near"
Txt "一食堂 · 一楼 2 号窗口" ($px + 24) ($py + 172) 240 16 $fS (Br $cGray) "Near"
RBox ($px + 24) ($py + 192) 90 26 "#F0FDF4" $cGreen "已维护 12 道" $fT (Br $cGreen) 5 1
RBox ($px + 120) ($py + 192) 110 26 "#FFF7ED" $cAmber "更新于 今天 10:20" $fT (Br $cAmber) 5 1
Txt "菜单维护入口：粘贴公示文本 / 手动修正" ($px + 24) ($py + 222) 300 16 $fT (Br $cGray) "Near"
TagNo ($px + 236) ($py + 192) "2"
Note 420 186 "② 数据状态条（C2 组件）：一眼判断菜单是否可靠；未维护时此框显示""暂无可靠菜单数据""（S5）。"

FillBox ($px + 12) ($py + 252) 336 96 "#FFFFFF" $cLine 1
Txt "我的画像" ($px + 24) ($py + 258) 160 18 $fH (Br $cInk) "Near"
RBox ($px + 24) ($py + 280) 70 24 "#F1F5F9" $cLine "微辣" $fT (Br $cText) 5 1
RBox ($px + 100) ($py + 280) 78 24 "#F1F5F9" $cLine "减脂" $fT (Br $cText) 5 1
RBox ($px + 184) ($py + 280) 78 24 "#F1F5F9" $cLine "≤15 元" $fT (Br $cText) 5 1
RBox ($px + 268) ($py + 280) 68 24 "#FFF1F2" $cRed "忌口 1 项" $fT (Br $cRed) 5 1
Txt "首次使用：设置画像 ≤ 60 秒、可跳过忌口项" ($px + 24) ($py + 310) 300 16 $fT (Br $cGray) "Near"
TagNo ($px + 236) ($py + 252) "3"
Note 420 276 "③ 空画像时此区域替换为引导卡片：三步设置、忌口可跳过，跳过时在首次推荐前再轻提示一次。"

FillBox ($px + 12) ($py + 358) 336 110 "#FFFFFF" $cLine 1
Txt "今天已记录" ($px + 24) ($py + 364) 160 18 $fH (Br $cInk) "Near"
Txt "· 香煎鸡胸饭（12 元）— 12:12 已确认花生风险" ($px + 24) ($py + 386) 310 16 $fS (Br $cText) "Near"
Txt "· 反馈：符合口味" ($px + 24) ($py + 406) 310 16 $fS (Br $cGreen) "Near"
RBox ($px + 24) ($py + 428) 150 26 "" $cBlue "改为其他菜品 / 补充反馈" $fT (Br $cBlue) 5 1
TagNo ($px + 236) ($py + 358) "4"
Note 420 366 "④ 空数据状态（动态元素）：未记录时显示""今天还没有记录，去选餐 →""，不放占位假数据。"

FillBox ($px + 12) ($py + 478) 336 92 "#F8FAFC" $cLine 1
Txt "数据与隐私" ($px + 24) ($py + 484) 160 18 $fH (Br $cInk) "Near"
Txt "仅存昵称与画像，不采集学号 / 姓名 / 位置 / 照片；" ($px + 24) ($py + 506) 310 16 $fS (Br $cGray) "Near"
Txt "所有记录仅保存在本机，可一键清空且不可恢复。" ($px + 24) ($py + 524) 310 16 $fS (Br $cGray) "Near"
RBox ($px + 24) ($py + 542) 110 24 "#FFF1F2" $cRed "清空我的数据" $fT (Br $cRed) 5 1
TagNo ($px + 236) ($py + 478) "5"
Note 420 486 "⑤ 命令元素：二次确认弹窗后删除（UC-08 / NFR-07），删除后 7 天内不可恢复。"

Note 420 566 "交互与状态：加载 → 骨架条（灰块）；菜单为空 → 状态条转橙并给""去维护菜单""按钮；" 420 560
Txt "AI 不可用 → 推荐页状态条显示""规则排序（AI 暂不可用）""，首页不报错。" 420 600 440 40 $fT (Br $cAmber) "Near" "Near"
Txt "P1 元素构成：静态元素（标题、说明文案、分段标题）；动态元素（菜单状态、今日记录）；" 420 640 440 40 $fT (Br $cGray) "Near" "Near"
Txt "用户输入元素（画像入口）；用户命令元素（开始选餐、维护菜单、清空数据）。" 420 680 440 40 $fT (Br $cGray) "Near" "Near"
Save-Canvas $cv "$OutDir\图3-6-界面原型-首页.png"

# ══════════════════════════════════════════════════════════════
# 图3-7 菜单维护页 P2
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 900 760; Init-G $cv.g
Txt "图3-7 关键界面原型②：当日菜单维护页（P2：pages/menu）" 30 14 840 28 $fTitle (Br $cText)
$px = 40; $py = 50
Phone-Start $cv $px $py "维护当日菜单" "P2 pages/menu"
Init-G $cv.g
Txt "① 选择食堂与窗口" ($px + 14) ($py + 66) 200 16 $fS (Br $cGray) "Near"
RBox ($px + 14) ($py + 84) 130 28 "#F1F5F9" $cLine "一食堂 ▾" $fS (Br $cText) 5 1
RBox ($px + 152) ($py + 84) 130 28 "#F1F5F9" $cLine "一楼 2 号窗口 ▾" $fS (Br $cText) 5 1

Txt "② 粘贴食堂公示菜单文本（可选拍照后手动抄录）" ($px + 14) ($py + 124) 330 16 $fS (Br $cGray) "Near"
FillBox ($px + 14) ($py + 142) 332 96 "#FFFFFF" $cLine 1
Txt "香煎鸡胸饭 12`n水煮鱼 15`n宫保鸡丁 11`n特色小炒 9`n清炒时蔬 5" ($px + 24) ($py + 148) 310 86 $fS (Br $cText) "Near" "Near"
TagNo ($px + 340) ($py + 142) "1"
Note 410 150 "① 输入元素：只接受学生自己复制的公示文本；不做自动抓取（无接口），也不做拍照 OCR（明确不做）。"

RBox ($px + 14) ($py + 248) 150 30 "#2B579A" $cBlue "解析为菜品列表" $fS (Br "#FFFFFF") 6 1
RBox ($px + 174) ($py + 248) 172 30 "" $cGray "清空重填" $fS (Br $cGray) 6 1

FillBox ($px + 14) ($py + 290) 332 150 "#FFFFFF" $cLine 1
Txt "③ 核对并修正（解析结果）" ($px + 24) ($py + 294) 260 18 $fH (Br $cInk) "Near"
Txt "菜名 / 价格 / 人工补充配料" ($px + 24) ($py + 314) 260 14 $fT (Br $cGray) "Near"
$rows = @("香煎鸡胸饭   12 元   ✔ 已确认", "水煮鱼   15 元   ✔ 已确认", "宫保鸡丁   11 元   ⚠ 可能含花生（待确认）", "特色小炒   9 元   ⚠ 配料未知（S6）", "清炒时蔬   5 元   ✔ 已确认")
for ($i = 0; $i -lt $rows.Count; $i++) {
    $ry = $py + 332 + $i * 22
    FillBox ($px + 22) $ry 316 20 "#F8FAFC" $cLine 0.8
    Txt $rows[$i] ($px + 28) $ry 300 20 $fT (Br $cText) "Near"
}
TagNo ($px + 340) ($py + 290) "2"
Note 420 300 "② 解析失败（文本为空或无法识别）时：提示""未能识别菜品，请逐条手动添加""，绝不用菜名猜测补全（V2 硬门槛）。"
Note 420 372 "③ 每行可点开编辑；缺配料的菜品自动置""配料未知""并标红三角，进入推荐时执行保守排序（S6）。"

RBox ($px + 14) ($py + 452) 150 30 "#047857" $cGreen "保存当日菜单（12 道）" $fS (Br "#FFFFFF") 6 1
RBox ($px + 174) ($py + 452) 172 30 "#FFF7ED" $cAmber "复用上周菜单" $fS (Br $cAmber) 6 1
TagNo ($px + 340) ($py + 452) "3"
Note 420 444 "③ 保存后进入候选集合；""复用上周菜单""针对最大风险（菜单维护疲劳）的预案，只改变化项。"

FillBox ($px + 14) ($py + 496) 332 74 "#FFF7ED" $cAmber 1
Txt "提示：菜单来自食堂公示，可能与窗口现场不一致。" ($px + 24) ($py + 502) 312 16 $fS (Br $cAmber) "Near"
Txt "以现场为准；本软件不保证菜品供应。" ($px + 24) ($py + 520) 312 16 $fS (Br $cAmber) "Near"
Txt "误报代价低，漏报代价高 —— 信息不确定时宁可提示核对。" ($px + 24) ($py + 538) 312 16 $fS (Br $cGray) "Near"

Note 420 520 "④ 错误状态：解析失败 / 保存冲突（同日同窗口重复导入）→ 覆盖前二次确认。" 420 514
Txt "⑤ 空数据状态：当日无菜单时本页显示""还没有今日菜单""＋主按钮""粘贴文本导入""，" 420 560 440 40 $fT (Br $cGray) "Near" "Near"
Txt "并把该状态同步到 P1 的状态条与 P3 的推荐前置校验（不进入 AI 调用）。" 420 596 440 40 $fT (Br $cGray) "Near" "Near"
Txt "⑥ 加载状态：解析中按钮变为""解析中…""且不可重复点击（防重复提交）。" 420 640 440 40 $fT (Br $cGray) "Near" "Near"
Save-Canvas $cv "$OutDir\图3-7-界面原型-菜单维护页.png"

# ══════════════════════════════════════════════════════════════
# 图3-8 核心任务页 P3（推荐 + 强制人工确认）
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 980 800; Init-G $cv.g
Txt "图3-8 关键界面原型③：核心任务页——推荐与忌口强制确认（P3：pages/recommend）" 30 14 920 28 $fTitle (Br $cText)
$px = 30; $py = 50
Phone-Start $cv $px $py "今日推荐 Top3" "P3 pages/recommend"
Init-G $cv.g
FillBox ($px + 12) ($py + 64) 336 26 "#F0FDF4" $cGreen 1
Txt "● 数据状态：实时推荐 · 菜单 12 道（今天 10:20 更新）" ($px + 22) ($py + 64) 320 26 $fS (Br $cGreen) "Near"
TagNo ($px + 340) ($py + 64) "1"
Note 430 84 "① 状态条（C2 组件）三态：实时推荐 / 规则排序（AI 暂不可用）/ 暂无可靠菜单数据。"

$cards = @(
    @{ t = "① 香煎鸡胸饭 · 12 元 · 一食堂 2 号窗"; r = "推荐分 0.92｜理由：高蛋白、少油，符合""减脂 + 微辣""，在预算内。"; risk = ""; c = $cGreen },
    @{ t = "② 清炒时蔬 + 米饭 · 8 元 · 一食堂 1 号窗"; r = "推荐分 0.81｜理由：清淡低油；你 7 天内没点过这道菜。"; risk = ""; c = $cGreen },
    @{ t = "③ 宫保鸡丁 · 11 元 · 一食堂 2 号窗"; r = "推荐分 0.66｜理由：口味匹配；但风险提示见下方弹窗。"; risk = "⚠ 可能含有花生，请向窗口确认"; c = $cRed }
)
for ($i = 0; $i -lt 3; $i++) {
    $cy = $py + 100 + $i * 118
    FillBox ($px + 12) $cy 336 108 "#FFFFFF" $cLine 1
    Txt $cards[$i].t ($px + 22) ($cy + 6) 316 20 $fB (Br $cInk) "Near"
    Txt $cards[$i].r ($px + 22) ($cy + 28) 316 40 $fS (Br $cText) "Near" "Near"
    if ($cards[$i].risk) {
        FillBox ($px + 20) ($cy + 70) 320 28 "#FFF1F2" $cRed 1
        Txt $cards[$i].risk ($px + 26) ($cy + 70) 308 28 $fS (Br $cRed) "Near"
    } else {
        Txt "· 未命中忌口清单" ($px + 22) ($cy + 70) 200 18 $fT (Br $cGray) "Near"
    }
    if ($i -lt 2) { TagNo ($px + 340) $cy "2" }
}
Note 430 196 "② 推荐卡（动态元素）：菜名、价格、窗口、推荐分、一句话理由；输出恰好 3 条（R4 / V1）。"
Note 430 314 "③ 风险行：只写""可能含有 X，请向窗口确认""，不出现""不含""""可以吃""等确定性表述（NFR-06 / V2）。"

FillBox ($px + 40) ($py + 456) 280 150 "#FFFFFF" "#111827" 2
Txt "请先确认" ($px + 52) ($py + 464) 256 24 $fB (Br $cRed) "Near"
Txt "宫保鸡丁 可能含有花生（你的忌口）。" ($px + 52) ($py + 490) 256 22 $fS (Br $cText) "Near"
Txt "请向窗口确认后再决定。" ($px + 52) ($py + 512) 256 22 $fS (Br $cText) "Near"
Txt "本软件不做安全判断，仅提示可能风险。" ($px + 52) ($py + 536) 256 18 $fT (Br $cGray) "Near"
RBox ($px + 52) ($py + 560) 118 32 "#BE123C" $cRed "已向窗口确认" $fS (Br "#FFFFFF") 6 1
RBox ($px + 182) ($py + 560) 126 32 "" $cGray "换一道菜" $fS (Br $cGray) 6 1
TagNo ($px + 320) ($py + 456) "4"
Note 430 470 "④ 强制人工确认（C1 组件，模态不可绕过）：未确认 → 无法记录该菜品（V3 硬门槛：确认后留痕）。"

RBox ($px + 12) ($py + 618) 336 34 "#2B579A" $cBlue "记录为今日就餐（选中：① 香煎鸡胸饭）" $fS (Br "#FFFFFF") 6 1
Txt "重新推荐（换一批）" ($px + 12) ($py + 658) 336 20 $fS (Br $cBlue)
Phone-TabBar $cv $px $py 2

Note 430 596 "命令元素：主按钮""记录为今日就餐""在确认完成前为禁用态（灰）；""换一批""重跑推荐，命中缓存 < 1 秒（NFR-01）。"
Note 430 654 "⑤ 加载状态：点击推荐后先显示 3 张骨架卡；超过 5 秒自动转规则排序并更新状态条文案。"
Txt "⑥ 空/错误状态：菜单未维护 → 整页替换为""暂无可靠菜单数据""＋""去维护菜单""按钮，不发 AI 请求；" 430 706 500 40 $fT (Br $cAmber) "Near" "Near"
Txt "模型超时/超额 → 顶部状态条转橙、卡片保留（来自降级结果），文案不出现技术术语（NFR-10）。" 430 742 500 40 $fT (Br $cAmber) "Near" "Near"
Save-Canvas $cv "$OutDir\图3-8-界面原型-推荐核心页.png"

# ══════════════════════════════════════════════════════════════
# 图3-9 记录与反馈页 P4（结果页）
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 980 800; Init-G $cv.g
Txt "图3-9 关键界面原型④：记录与反馈页 / 结果反馈（P4：pages/record）" 30 14 920 28 $fTitle (Br $cText)
$px = 30; $py = 50
Phone-Start $cv $px $py "今日记录与反馈" "P4 pages/record"
Init-G $cv.g
FillBox ($px + 12) ($py + 64) 336 118 "#FFFFFF" $cLine 1
Txt "今天吃的" ($px + 22) ($py + 68) 200 20 $fH (Br $cInk) "Near"
Txt "香煎鸡胸饭 · 12 元 · 一食堂 2 号窗" ($px + 22) ($py + 92) 316 18 $fS (Br $cText) "Near"
Txt "记录时间 12:12 · 来源：推荐第 1 条" ($px + 22) ($py + 112) 316 16 $fT (Br $cGray) "Near"
Txt "风险确认：已确认（12:12）" ($px + 22) ($py + 132) 200 18 $fT (Br $cGreen) "Near"
RBox ($px + 232) ($py + 128) 108 22 "" $cBlue "修改这条记录" $fT (Br $cBlue) 5 1
TagNo ($px + 340) ($py + 64) "1"
Note 430 96 "① 结果反馈区：显示所选菜品、时间、来源；保留""修改""入口（UC-06，记录可查可改）。"

FillBox ($px + 12) ($py + 192) 336 116 "#FFFFFF" $cLine 1
Txt "这道菜符合你的口味吗？" ($px + 22) ($py + 196) 300 20 $fB (Br $cText) "Near"
RBox ($px + 22) ($py + 224) 148 40 "#F0FDF4" $cGreen "👍 符合口味" $fB (Br $cGreen) 6 1
RBox ($px + 180) ($py + 224) 148 40 "#FFF1F2" $cRed "👎 不符合口味" $fB (Br $cRed) 6 1
Txt "选""不符合""后出现原因（可跳过）：太辣 / 太油 / 分量少 / 其他" ($px + 22) ($py + 272) 316 30 $fT (Br $cGray) "Near" "Near"
TagNo ($px + 340) ($py + 192) "2"
Note 430 210 "② 用户命令元素：一键反馈（US-07）。负反馈 → 同类口味权重下调，下次推荐中排序下降（V5）。"

FillBox ($px + 12) ($py + 318) 336 26 "#EEF4FF" $cBlue 1
Txt "反馈已记录，下次推荐会少推同类辣味菜品" ($px + 22) ($py + 318) 316 26 $fS (Br $cBlue) "Near"
TagNo ($px + 340) ($py + 318) "3"
Note 430 316 "③ 操作反馈（动态元素）：用可理解的语言说明反馈的作用，不暴露""权重""等术语（NFR-10）。"

FillBox ($px + 12) ($py + 356) 336 196 "#FFFFFF" $cLine 1
Txt "最近记录（可回看、可修改）" ($px + 22) ($py + 360) 260 20 $fH (Br $cInk) "Near"
$hist = @(
    "昨天 12:05   水煮鱼 15 元    👎 太辣",
    "前天 11:58   番茄炒蛋 8 元   👍 符合",
    "9-26  12:20  清炒时蔬 5 元   👍 符合",
    "9-25   ——     无记录（未使用软件）"
)
for ($i = 0; $i -lt $hist.Count; $i++) {
    $hy = $py + 388 + $i * 30
    FillBox ($px + 20) $hy 320 26 "#F8FAFC" $cLine 0.8
    Txt $hist[$i] ($px + 26) $hy 308 26 $fT (Br $cText) "Near"
}
Txt "只保留最近 30 天记录，控制本地存储（数据最小化）" ($px + 22) ($py + 516) 316 28 $fT (Br $cGray) "Near" "Near"
TagNo ($px + 340) ($py + 356) "4"
Note 430 384 "④ 历史列表：空数据状态显示""还没有记录""；只保留最近 30 天以控制本地存储。"

Phone-TabBar $cv $px $py 3
Note 430 566 "⑤ 错误状态：未记录就反馈 → 提示""先记录今天吃的，再反馈""并跳回 P3（UC-07 异常流程）。"
Note 430 630 "⑥ 重复记录：同一天已有记录时再记录 → 顶部提示""今天已记录，可修改""，不静默覆盖。"
Txt "⑦ 人工确认留痕只存在本机：风险确认时间戳属于敏感数据，不随任何请求上传。" 430 694 500 40 $fT (Br $cAmber) "Near" "Near"
Save-Canvas $cv "$OutDir\图3-9-界面原型-记录反馈页.png"

# ══════════════════════════════════════════════════════════════
# 图3-10 隐私与数据页 P5
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 920 760; Init-G $cv.g
Txt "图3-10 关键界面原型⑤：隐私与数据页（P5：pages/privacy）" 30 14 860 28 $fTitle (Br $cText)
$px = 40; $py = 50
Phone-Start $cv $px $py "隐私与我的数据" "P5 pages/privacy"
Init-G $cv.g
FillBox ($px + 12) ($py + 66) 336 132 "#F8FAFC" $cLine 1
Txt "本软件采集什么" ($px + 22) ($py + 70) 260 20 $fH (Br $cInk) "Near"
Txt "采集：口味标签、忌口清单、健康目标、预算区间、就餐记录与反馈。" ($px + 22) ($py + 94) 316 40 $fS (Br $cText) "Near" "Near"
Txt "不采集：学号、姓名、手机号、位置、照片原图、人脸。" ($px + 22) ($py + 138) 316 20 $fS (Br $cRed) "Near"
Txt "所有数据只保存在本机，不上传服务器。" ($px + 22) ($py + 162) 316 18 $fS (Br $cText) "Near"
TagNo ($px + 340) ($py + 66) "1"
Note 420 96 "① 采集范围声明（NFR-05）：与实现一一对应的可核对清单，避免""说不采集却在暗地上传""。"

FillBox ($px + 12) ($py + 214) 336 104 "#FFFFFF" $cLine 1
Txt "我上传给模型服务的内容" ($px + 22) ($py + 218) 300 20 $fB (Br $cInk) "Near"
Txt "· 候选菜品：菜名、价格、可能含有的配料" ($px + 22) ($py + 242) 316 20 $fS (Br $cText) "Near"
Txt "· 画像摘要：口味标签、健康目标、预算区间" ($px + 22) ($py + 262) 316 20 $fS (Br $cText) "Near"
Txt "（不含忌口清单全文、不含任何身份信息）" ($px + 22) ($py + 284) 316 20 $fS (Br $cGray) "Near"
TagNo ($px + 340) ($py + 214) "2"
Note 420 240 "② 透明说明：忌口清单只在本地做风险匹配，不外发完整清单；用户能判断""什么被发出去了""。"

RBox ($px + 12) ($py + 334) 336 36 "" $cBlue "导出我的数据（JSON，文本可读）" $fS (Br $cBlue) 6 1
RBox ($px + 12) ($py + 380) 336 36 "#FFF1F2" $cRed "清空全部数据（不可恢复）" $fS (Br $cRed) 6 1
TagNo ($px + 340) ($py + 334) "3"
Note 420 358 "③ 用户命令元素：导出用于自查；清空需二次确认（输入""确认清空""），执行后回到首次使用状态（UC-08）。"

FillBox ($px + 40) ($py + 440) 280 124 "#FFFFFF" "#111827" 2
Txt "确认清空？" ($px + 52) ($py + 448) 256 24 $fB (Br $cRed) "Near"
Txt "将删除画像、菜单、记录与反馈。" ($px + 52) ($py + 474) 256 22 $fS (Br $cText) "Near"
Txt "删除后 7 天内不可恢复。" ($px + 52) ($py + 496) 256 22 $fS (Br $cText) "Near"
RBox ($px + 52) ($py + 522) 112 30 "" $cGray "取消" $fS (Br $cGray) 6 1
RBox ($px + 176) ($py + 522) 132 30 "#BE123C" $cRed "确认清空" $fS (Br "#FFFFFF") 6 1
TagNo ($px + 320) ($py + 440) "4"
Note 420 472 "④ 二次确认弹窗：默认焦点在""取消""（防误触）；清空同时清除推荐缓存与反馈权重版本号。"

Note 420 566 "⑤ 错误状态：清空失败（存储异常）→ 提示""清空未完成，请重试""并保留原数据，不假装成功。"
Txt "⑥ 本页不提供任何""提高推荐准确度""式诱导：数据最小化优先于效果（NFR-05 / NFR-07）。" 420 624 460 40 $fT (Br $cGray) "Near" "Near"
Save-Canvas $cv "$OutDir\图3-10-界面原型-隐私与数据页.png"

# ══════════════════════════════════════════════════════════════
# 图3-5 页面结构图与导航关系图
# ══════════════════════════════════════════════════════════════
$cv = New-Canvas 1180 640; Init-G $cv.g
Txt "图3-5 页面结构图与导航关系图（入口 → 核心任务 → 结果 → 返回 / 重新操作）" 30 14 1120 28 $fTitle (Br $cText)
Init-G $cv.g

function Page([double]$x, [double]$y, [double]$w, [double]$h, [string]$t, [string]$fill, [string]$stroke, [string]$sub) {
    RBox $x $y $w $h $fill $stroke $t $fB (Br $cInk) 8 1.4
    if ($sub) { Txt $sub $x ($y + $h - 19) $w 17 $fT (Br $cGray) }
}
Page 470 56 240 56 "P1 首页 / 入口页" "#EEF4FF" $cBlue "pages/home · 导航枢纽"
Page 90 190 240 56 "P2 菜单维护页" "#F0FDF4" $cGreen "pages/menu"
Page 470 190 240 56 "P3 推荐核心页" "#FFF7ED" $cAmber "pages/recommend · 核心任务"
Page 850 190 240 56 "P4 记录与反馈页" "#EEF4FF" $cBlue "pages/record · 结果页"
Page 470 330 240 56 "P5 隐私与数据页" "#FFF1F2" $cRed "pages/privacy"
Page 850 330 240 56 "C1 忌口强制确认（模态）" "#FFF1F2" $cRed "components/confirm-guard"

Arrow 590 112 590 190 $cBlue 1.4
Txt "开始选餐 / 查看推荐" 596 142 260 18 $fT (Br $cBlue) "Near"
Arrow 470 218 330 218 $cGreen 1.4
Txt "去维护菜单" 340 198 160 18 $fT (Br $cGreen) "Near"
Arrow 330 246 470 246 "#64748B" 1.4
Txt "保存后返回" 355 258 130 18 $fT (Br $cGray) "Near"
Arrow 710 218 850 218 $cBlue 1.4
Txt "记录为今日就餐" 716 198 180 18 $fT (Br $cBlue) "Near"
Arrow 850 246 710 246 "#64748B" 1.4
Txt "修改记录 / 补反馈" 716 258 190 18 $fT (Br $cGray) "Near"
Arrow 590 246 590 330 "#64748B" 1.4
Txt "底部 tab 切到隐私页" 470 288 180 18 $fT (Br $cGray) "Far"
Arrow 710 330 850 246 $cRed 1.4 "Dash"
Txt "命中忌口 → 弹出强制确认（模态）" 716 348 300 18 $fT (Br $cRed) "Near"
Arrow 900 330 640 246 $cRed 1.4
Txt "确认后才可记录" 800 380 200 18 $fT (Br $cRed) "Far"
Arrow 850 330 850 390 "#64748B" 1.2

FillBox 40 410 1100 210 "#F8FAFC" $cLine 1
Txt "导航与返回规则（对应实验3 §2.5 要求）" 60 418 420 22 $fH (Br $cInk) "Near"
Txt "① 入口：小程序启动即 P1（首页），P1 是唯一入口与导航枢纽；从入口到核心任务 ≤ 1 次点击。" 60 448 1060 20 $fS (Br $cText) "Near"
Txt "② 前进：P1 →（开始选餐）P3；(P1/P3) →（去维护菜单）P2；P3 →（命中忌口）C1 模态；P3 →（记录成功）P4。" 60 476 1060 20 $fS (Br $cText) "Near"
Txt "③ 返回：P2—P5 左上角「‹ 返回」回到上一页；模态 C1 只能由""已向窗口确认""或""换一道菜""关闭，不可点空白关闭。" 60 504 1060 20 $fS (Br $cText) "Near"
Txt "④ 退出：P5 提供清空数据与退出说明；清空后回到 P1 的首次使用状态（相当于重置，不删除小程序）。" 60 532 1060 20 $fS (Br $cText) "Near"
Txt "⑤ 重新操作：P3 提供""重新推荐（换一批）""；P4 提供""修改这条记录""；P2 提供""清空重填""；任何失败状态都给出下一步按钮，不出现死胡同。" 60 560 1060 20 $fS (Br $cText) "Near"
Txt "⑥ 状态约束：菜单为空时 P3 不进入 AI 调用，直接显示空态并给出""去维护菜单""；模型不可用时 P3 以规则结果继续，由状态条说明。" 60 588 1060 20 $fS (Br $cText) "Near"
Save-Canvas $cv "$OutDir\图3-5-页面导航关系图.png"
