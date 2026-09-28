# 渲染 图3-1 软件与外部环境关系图、图3-2 软件总体架构与模块结构图 → PNG
# 使用 .NET GDI+，无需浏览器、无需联网。
# 用法： pwsh -File .\render-arch.ps1
# 重新生成：改下面的坐标或文字后再次运行即可。

param(
    [string]$OutDir = "$PSScriptRoot\..\docs\report"
)

Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$S = 2.0                     # 超采样倍数；300 dpi 下 1 逻辑像素 ≈ 0.0847 mm

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
    New-Object System.Drawing.Font("Microsoft YaHei", ($px * $S),
        [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel)
}
function Pen([string]$hex, [double]$w, [string]$dash = "Solid") {
    $p = New-Object System.Drawing.Pen(([System.Drawing.ColorTranslator]::FromHtml($hex)), ([float]($w * $S)))
    $p.DashStyle = [System.Drawing.Drawing2D.DashStyle]::$dash
    $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $p
}
function Br([string]$hex) { New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml($hex))) }

function Init-G($g) {
    $script:G = $g
}
function Ln($x1, $y1, $x2, $y2, $pen) {
    $G.DrawLine($pen, [float]($x1 * $S), [float]($y1 * $S), [float]($x2 * $S), [float]($y2 * $S))
}
# 居中/对齐文本；align: Center / Near / Far
function Txt([string]$text, [double]$x, [double]$y, [double]$w, [double]$h, $font, $brush, [string]$align = "Center") {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::$align
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float]($x * $S), [float]($y * $S), [float]($w * $S), [float]($h * $S))
    $G.DrawString($text, $font, $brush, $rect, $sf)
}
# 框内自动换行文本
function TextBox([string]$text, [double]$x, [double]$y, [double]$w, [double]$h, $font, $brush) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float](($x + 6) * $S), [float](($y + 4) * $S), [float](($w - 12) * $S), [float](($h - 8) * $S))
    $G.DrawString($text, $font, $brush, $rect, $sf)
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
# 圆角方框（自动换行文字）
function Box([double]$x, [double]$y, [double]$w, [double]$h, [string]$fill, [string]$stroke, [string]$text, $font, $tbrush, [double]$rad = 8) {
    $path = RoundRectPath $x $y $w $h $rad
    $G.FillPath((Br $fill), $path)
    $G.DrawPath((Pen $stroke 1.3), $path)
    TextBox $text $x $y $w $h $font $tbrush
}
# 直角方框（分区容器）
function Zone([double]$x, [double]$y, [double]$w, [double]$h, [string]$fill, [string]$stroke, [string]$title, $font, $tbrush) {
    $path = RoundRectPath $x $y $w $h 4
    $G.FillPath((Br $fill), $path)
    $G.DrawPath((Pen $stroke 1.5), $path)
    if ($title) { Txt $title ($x + 10) $y 400 22 $font $tbrush "Near" }
}
# 菱形（决策）
function Diamond([double]$cx, [double]$cy, [double]$w, [double]$h, [string]$text, $font, $tbrush) {
    $pts = @(
        (New-Object System.Drawing.PointF([float]($cx * $S), [float](($cy - $h / 2) * $S))),
        (New-Object System.Drawing.PointF([float](($cx + $w / 2) * $S), [float]($cy * $S))),
        (New-Object System.Drawing.PointF([float]($cx * $S), [float](($cy + $h / 2) * $S))),
        (New-Object System.Drawing.PointF([float](($cx - $w / 2) * $S), [float]($cy * $S)))
    )
    $G.FillPolygon((Br "#FFF7E6"), $pts)
    $G.DrawPolygon((Pen "#B45309" 1.3), $pts)
    Txt $text ($cx - $w / 2 + 8) ($cy - 26) ($w - 16) 52 $font $tbrush
}
# 箭头：dir = down / up / right / left
function Arrow([double]$x1, [double]$y1, [double]$x2, [double]$y2, [string]$color = "#374151", [double]$w = 1.3) {
    $pen = Pen $color $w
    Ln $x1 $y1 $x2 $y2 $pen
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
# 折线箭头（正交走线）
function ArrowPath([array]$pts, [string]$color = "#374151", [double]$w = 1.3) {
    for ($i = 0; $i -lt $pts.Count - 2; $i++) {
        Ln $pts[$i][0] $pts[$i][1] $pts[$i + 1][0] $pts[$i + 1][1] (Pen $color $w)
    }
    $a = $pts[$pts.Count - 2]; $b = $pts[$pts.Count - 1]
    Arrow $a[0] $a[1] $b[0] $b[1] $color $w
}
function Save-Canvas($canvas, [string]$out) {
    Init-G $canvas.g
    $canvas.g.Dispose()
    $canvas.bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.bmp.Dispose()
    "已生成: $out"
}

$cInk = "#111827"; $cText = "#1F2937"; $cGray = "#4B5563"; $cAmber = "#B45309"
$cRed = "#BE123C"; $cBlue = "#2B579A"; $cGreen = "#047857"; $cPurple = "#6D28D9"
$fTitle = F 19 "Bold"; $fH = F 14 "Bold"; $fB = F 12; $fS = F 11; $fT = F 10

# ══════════════════════════════════════════════════════════════════════
# 图3-1 软件与外部环境关系图（简化的系统上下文图）
# ══════════════════════════════════════════════════════════════════════
$cv = New-Canvas 1180 720; Init-G $cv.g

Txt "图3-1 知食校园 软件与外部环境关系图（系统上下文图）" 40 14 1100 30 $fTitle (Br $cText)

# 系统边界：本软件
Zone 300 70 470 560 "#F8FAFF" $cBlue "本软件（自行开发、个人可控制）" (F 13 "Bold") (Br $cBlue)
Box 330 104 410 44 "#EEF4FF" $cBlue "微信小程序（学生端界面 · 5 个页面）" $fB (Br $cText)
Box 330 164 410 44 "#EEF4FF" $cBlue "本地业务逻辑：规则推荐 / 降级 / 忌口校验 / 记录反馈" $fB (Br $cText)
Box 330 224 410 44 "#EEF4FF" $cBlue "本地数据存储：画像 / 菜单 / 记录（wx.setStorage）" $fB (Br $cText)
Box 330 284 410 44 "#EEF4FF" $cBlue "云函数（自己部署的轻量代理，中转与降级）" $fB (Br $cText)
Box 330 344 410 44 "#FFF7ED" $cAmber "降级路径：本地规则排序（不依赖网络）" $fB (Br $cText)
Box 330 420 410 60 "#F1F5F9" "#64748B" "本项目实现的程序侧校验`n（结构化校验 + 确定性表述拦截）" $fB (Br $cText)
Box 330 500 410 100 "#FFFFFF" "#94A3B8" "不保存的数据（明确声明）`n学号、姓名、位置、照片原图、`n人脸与环境照片 → 一律不入库" $fS (Br $cGray)

# 外部实体（左：用户）
Box 40 210 210 90 "#ECFDF5" $cGreen "学生用户（主要）`n在校本科生`n手机端 · 午间 30 秒决策" $fB (Br $cText)
Box 40 350 210 80 "#ECFDF5" $cGreen "食堂窗口从业者（次要）`n本期不为其开发功能`n仅作为菜单信息来源" $fS (Br $cText)

# 外部系统（右：模型服务与外部数据）
Box 850 120 300 96 "#FFF1F2" $cRed "LLM 模型服务（云端 API）`nDeepSeek / 通义等`n输入候选集合 + 画像`n输出受约束 JSON（Top3）" $fS (Br $cText)
Box 850 250 300 80 "#FFF1F2" $cRed "微信小程序运行环境`nwx.setStorage / 真机运行`n网络请求域名为 HTTPS 白名单" $fS (Br $cText)
Box 850 364 300 96 "#FFF7ED" $cAmber "食堂公示菜单（外部数据源）`n公众号 / 公示牌 / 窗口拍照`n→ 学生复制文本后粘贴录入`n自动抓取不可行（无接口）" $fS (Br $cText)
Box 850 494 300 80 "#F5F3FF" $cPurple "GitHub 仓库（工程化）`n设计文档与图示版本留痕`n不承载运行期数据" $fS (Br $cText)

# 关系箭头
Arrow 250 255 330 190 $cGreen      # 学生 → 小程序界面
Arrow 330 210 250 275 $cBlue
Txt "① 操作：设置画像 / 选菜 / 确认 / 反馈" 60 296 250 18 $fT (Br $cGreen) "Near"
Txt "② 展示：Top3 + 理由 + 风险提示" 60 318 250 18 $fT (Br $cBlue) "Near"

Arrow 250 380 330 260 "#64748B"
Txt "菜单信息（人工公示，只读）" 40 440 260 18 $fT (Br $cGray) "Near"

Arrow 740 300 850 168 $cRed
Txt "③ 请求：候选集合 + 画像摘要" 756 200 260 18 $fT (Br $cRed) "Near"
Arrow 850 132 740 262 $cRed
Txt "④ 返回：JSON（可能超时 / 报错 / 超额）" 756 280 260 18 $fT (Br $cRed) "Near"

Arrow 740 360 850 300 "#64748B"
Arrow 850 330 740 380 "#64748B"
Txt "⑤ 存储读写（本地）" 756 400 250 18 $fT (Br $cGray) "Near"

Arrow 740 460 850 410 $cAmber
Txt "⑥ 文本录入（复制粘贴，不自动抓取）" 700 470 330 18 $fT (Br $cAmber) "Near"

Arrow 850 534 740 520 $cPurple
Txt "⑦ 设计文件提交与推送" 756 548 250 18 $fT (Br $cPurple) "Near"

# 图例
Ln 40 660 120 660 (Pen $cBlue 1.5)
Txt "方框 = 实体 / 系统；蓝框 = 本软件内部；红框 = 云端外部依赖（模型服务）；橙框 = 降级与外部数据；箭头 = 数据或控制流（①—⑦ 见正文说明）。" 130 650 1000 20 $fS (Br $cGray) "Near"
Save-Canvas $cv "$OutDir\图3-1-软件与外部环境关系图.png"

# ══════════════════════════════════════════════════════════════════════
# 图3-2 软件总体架构图与模块结构图（分层 + 模块依赖）
# ══════════════════════════════════════════════════════════════════════
$cv = New-Canvas 1180 860; Init-G $cv.g
Txt "图3-2 知食校园 软件总体架构图与模块结构图（分层 + 树形包结构）" 40 14 1100 30 $fTitle (Br $cText)

# ── 左半：分层架构 ──
Zone 30 60 600 760 "#FFFFFF" "#94A3B8" "" $fS (Br $cGray)

Zone 50 84 560 128 "#F1F5F9" "#64748B" "表现层 UI（5 个页面 + 2 个复用组件）" (F 12 "Bold") (Br $cInk)
Box 62 112 130 44 "#FFFFFF" "#64748B" "P1 首页 / 入口" $fT (Br $cText)
Box 200 112 130 44 "#FFFFFF" "#64748B" "P2 菜单维护" $fT (Br $cText)
Box 338 112 130 44 "#FFFFFF" "#64748B" "P3 推荐（核心）" $fT (Br $cText)
Box 476 112 124 44 "#FFFFFF" "#64748B" "P4 记录 / 反馈" $fT (Br $cText)
Box 62 164 262 38 "#FFFFFF" "#94A3B8" "C1 忌口确认弹窗（强制，不可绕过）" $fT (Br $cText)
Box 338 164 262 38 "#FFFFFF" "#94A3B8" "C2 数据状态条（实时 / 规则降级 / 空）" $fT (Br $cText)

Arrow 330 224 330 250 "#64748B"

Zone 50 250 560 150 "#EEF4FF" $cBlue "业务层 Domain（纯本地逻辑，可离线运行）" (F 12 "Bold") (Br $cBlue)
Box 62 278 168 50 "#FFFFFF" $cBlue "M1 画像服务`n读取 / 保存 / 清空" $fT (Br $cText)
Box 240 278 168 50 "#FFFFFF" $cBlue "M2 菜单服务`n解析 / 修正 / 校验" $fT (Br $cText)
Box 418 278 180 50 "#FFFFFF" $cBlue "M3 推荐编排`n调用 / 超时 / 缓存" $fB (Br $cText)
Box 62 338 168 50 "#FFFFFF" $cBlue "M4 规则推荐（降级路径）`n标签匹配 + 反馈加权" $fT (Br $cText)
Box 240 338 168 50 "#FFFFFF" $cBlue "M5 风险与确认`n忌口命中 / 强制确认留痕" $fT (Br $cText)
Box 418 338 180 50 "#FFFFFF" $cBlue "M6 记录与反馈`n历史 / 权重更新" $fT (Br $cText)

Arrow 330 400 330 426 "#64748B"

Zone 50 426 560 128 "#F0FDF4" $cGreen "数据层 Data（本地持久化 + 访问封装）" (F 12 "Bold") (Br $cGreen)
Box 62 454 168 44 "#FFFFFF" $cGreen "D1 本地存储封装`nwx.setStorage 事务化" $fT (Br $cText)
Box 240 454 168 44 "#FFFFFF" $cGreen "D2 领域对象与校验`nDish / Profile / Record" $fT (Br $cText)
Box 418 454 180 44 "#FFFFFF" $cGreen "D3 缓存（推荐结果）`nTTL 24 小时" $fT (Br $cText)
Box 62 508 536 36 "#FFFFFF" $cGreen "D4 数据导出与一键清空（NFR-07）" $fT (Br $cText)

Arrow 330 554 330 580 "#64748B"

Zone 50 580 560 120 "#FFF1F2" $cRed "AI 接入层 AIClient（唯一允许接触网络的模块）" (F 12 "Bold") (Br $cRed)
Box 62 608 258 44 "#FFFFFF" $cRed "A1 云函数调用（HTTPS）" $fT (Br $cText)
Box 330 608 268 44 "#FFFFFF" $cRed "A2 结构化输出校验与安全表述拦截" $fT (Br $cText)
Box 62 660 536 32 "#FFFFFF" "#94A3B8" "A3 降级开关：超时 P95 > 5s、报错、超额 → 转 M4" $fT (Br $cText)

Txt "左侧：分层架构（上层只依赖相邻下层；AIClient 是唯一出网模块，失败即降级到 M4）" 50 716 560 40 $fS (Br $cGray)

# ── 右半：树形模块结构 ──
Zone 650 60 500 760 "#FFFFFF" "#94A3B8" "" $fS (Br $cGray)
Txt "模块结构（包 → 模块 → 关键文件）" 670 80 460 24 (F 13 "Bold") (Br $cInk)

Box 690 116 420 34 "#EEF4FF" $cBlue "zhishi-campus(miniprogram)" $fB (Br $cText)
$tree = @(
    @{ x = 710; y = 162; t = "pages/home（入口、今日概览、隐私声明入口）" },
    @{ x = 710; y = 200; t = "pages/menu（粘贴解析、逐条修正、空态提示）" },
    @{ x = 710; y = 238; t = "pages/recommend（核心任务页、数据状态条）" },
    @{ x = 710; y = 276; t = "pages/record（记录、反馈、历史）" },
    @{ x = 710; y = 314; t = "pages/privacy（清空数据、采集范围声明）" },
    @{ x = 710; y = 352; t = "components/confirm-guard（忌口强制确认）" },
    @{ x = 710; y = 390; t = "domain/profile、menu-parser、recommender" },
    @{ x = 710; y = 428; t = "domain/rule-rank（降级）、risk-guard" },
    @{ x = 710; y = 466; t = "domain/record-store、feedback-weights" },
    @{ x = 710; y = 504; t = "data/storage、models、cache" },
    @{ x = 710; y = 542; t = "ai/client、schema-validate、degrade" },
    @{ x = 710; y = 580; t = "shared/format、copy-text、logger" }
)
foreach ($n in $tree) { Box $n.x $n.y 400 30 "#F8FAFC" "#94A3B8" $n.t $fS (Br $cText) 5 }

Box 690 630 400 60 "#FFF7ED" $cAmber "依赖方向：pages → domain → data → storage；`npages/domain 不得直接调用 ai/*，只能经 M3 推荐编排" $fS (Br $cText)
Box 690 706 400 90 "#F1F5F9" "#64748B" "外部依赖边界（不在本仓库）：`n· 云端 LLM API（经自建云函数代理）`n· 微信小程序运行环境与云开发`n· GitHub 仓库（仅设计文件留痕）" $fS (Br $cGray)
Save-Canvas $cv "$OutDir\图3-2-软件总体架构图.png"
