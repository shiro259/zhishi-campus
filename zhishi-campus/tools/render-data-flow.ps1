# 渲染 图3-3 数据模型类图、图3-4 核心流程顺序图 → PNG
# 使用 .NET GDI+，无需浏览器、无需联网。
# 用法： powershell -File .\render-data-flow.ps1
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
function Txt([string]$text, [double]$x, [double]$y, [double]$w, [double]$h, $font, $brush, [string]$align = "Center") {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::$align
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float]($x * $S), [float]($y * $S), [float]($w * $S), [float]($h * $S))
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
function Box([double]$x, [double]$y, [double]$w, [double]$h, [string]$fill, [string]$stroke, [string]$text, $font, $tbrush, [double]$rad = 8) {
    $path = RoundRectPath $x $y $w $h $rad
    $G.FillPath((Br $fill), $path)
    $G.DrawPath((Pen $stroke 1.3), $path)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF([float](($x + 6) * $S), [float](($y + 4) * $S), [float](($w - 12) * $S), [float](($h - 8) * $S))
    $G.DrawString($text, $font, $tbrush, $rect, $sf)
}
function Arrow([double]$x1, [double]$y1, [double]$x2, [double]$y2, [string]$color = "#374151", [double]$w = 1.3, [string]$dash = "Solid") {
    $pen = Pen $color $w $dash
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
function Msg([double]$x, [double]$y, [double]$w, [double]$h, [string]$text, [string]$fill, [string]$stroke, $font, $tbrush) {
    Box $x $y $w $h $fill $stroke $text $font $tbrush 6
}
function Save-Canvas($canvas, [string]$out) {
    Init-G $canvas.g
    $canvas.g.Dispose()
    $canvas.bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.bmp.Dispose()
    "已生成: $out"
}

$cInk = "#111827"; $cText = "#1F2937"; $cGray = "#4B5563"
$cBlue = "#2B579A"; $cGreen = "#047857"; $cRed = "#BE123C"; $cAmber = "#B45309"; $cPurple = "#6D28D9"
$fTitle = F 19 "Bold"; $fH = F 13 "Bold"; $fB = F 12; $fS = F 11; $fT = F 10

# ══════════════════════════════════════════════════════════════════════
# 图3-3 数据模型类图
# ══════════════════════════════════════════════════════════════════════
$cv = New-Canvas 1180 1000; Init-G $cv.g
Txt "图3-3 知食校园 数据模型类图（含保存位置与敏感数据标记）" 40 14 1100 30 $fTitle (Br $cText)

function Class-Card([double]$x, [double]$y, [double]$w, [double]$titleH, [double]$bodyH, [string]$name, [string]$stereo, [string]$body, [string]$stroke, [string]$fill, [string]$foot) {
    $path = RoundRectPath $x $y $w ($titleH + $bodyH) 8
    $G.FillPath((Br $fill), $path)
    $G.DrawPath((Pen $stroke 1.4), $path)
    Ln $x ($y + $titleH) ($x + $w) ($y + $titleH) (Pen $stroke 1.2)
    Txt $stereo ($x + 8) ($y + 2) ($w - 16) 16 (F 10) (Br $cGray)
    Txt $name ($x + 8) ($y + 16) ($w - 16) 26 $fH (Br $cInk)
    $sf = New-Object System.Drawing.StringFormat
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
    $sf.Alignment = [System.Drawing.StringAlignment]::Near
    $rect = New-Object System.Drawing.RectangleF([float](($x + 10) * $S), [float](($y + $titleH + 8) * $S), [float](($w - 20) * $S), [float](($bodyH - 12) * $S))
    $G.DrawString($body, $fS, (Br $cText), $rect, $sf)
    if ($foot) { Txt $foot ($x + 8) ($y + $titleH + $bodyH - 22) ($w - 16) 18 $fT (Br $cGray) }
}

$bProfile = @"
- profileId : string (本地生成)
- tasteTags : string[]  口味标签
- avoidList : string[]  忌口/过敏清单 ★敏感
- healthGoal : enum(减脂/均衡/增肌/无)
- budget : { min, max }  元
- updatedAt : datetime
──────────────
约束：avoidList 可为空但保存时二次提示；
画像整体可一键清空，清空后不可恢复。
"@
$bMenu = @"
- menuId : string
- date : date  (唯一)
- canteen : string
- windowName : string
- source : enum(公示文本/手动/历史复用)
- parseStatus : enum(成功/部分/失败)
- rawText : string  原始文本（可追溯）
- createdAt : datetime
──────────────
约束：同一 date+canteen+window 唯一，
重复导入 → 覆盖前需确认。
"@
$bDish = @"
- dishId : string
- menuId : string  (FK)
- name : string
- price : number  元
- ingredients : string[] | null  配料
- allergenTags : string[]  可能含有 ★安全相关
- tasteTags : string[]  辣/清淡/油
- infoComplete : bool  (对应 S6)
- manualFixed : bool  是否人工修正过
──────────────
约束：name 非空；ingredients 为 null 时
infoComplete=false，禁止补全猜测。
"@
$bRec = @"
- recId : string
- profileId : string (FK)
- menuId : string (FK)
- items[1..3] : { dishId, score 0—1,
    reason 一句话理由, riskTags[] }
- engine : enum(AI / 规则降级)
- degraded : bool
- latencyMs : number
- createdAt : datetime
──────────────
约束：items 长度恰为 3（候选不足时如实
说明）；整份结果缓存 TTL 24 小时。
"@
$bRecord = @"
- recordId : string
- profileId : string (FK)
- dishId : string  (FK)
- date : date
- riskConfirmedAt : datetime | null  ★留痕
- source : enum(推荐/手动)
──────────────
约束：同一 date 允许 1 条主记录，
重复记录 → 提示并允许修改。
"@
$bFeedback = @"
- feedbackId : string
- recordId : string (FK, 唯一)
- result : enum(符合/不符合)
- reason : string | null  (如"太辣")
- weightDelta : { tasteTag, delta }
- createdAt : datetime
──────────────
约束：一条记录只允许 1 条反馈；
负反馈仅下调同类口味权重。
"@

Class-Card 40 90 340 44 250 "UserProfile 用户画像" "«entity» 保存位置：本地 wx.setStorage" $bProfile $cBlue "#EEF4FF" ""
Class-Card 40 360 340 44 250 "MenuDay 当日菜单（按窗口）" "«entity» 保存位置：本地 + 可导出备份" $bMenu $cGreen "#F0FDF4" ""
Class-Card 40 630 340 44 250 "Dish 菜品" "«entity» 保存位置：随 MenuDay 一并保存" $bDish $cGreen "#F0FDF4" ""
Class-Card 800 90 340 44 250 "Recommendation 推荐结果" "«entity» 保存位置：本地缓存（TTL 24h）" $bRec $cAmber "#FFF7ED" ""
Class-Card 800 360 340 44 250 "MealRecord 就餐记录" "«entity» 保存位置：本地" $bRecord $cBlue "#EEF4FF" ""
Class-Card 800 630 340 44 250 "Feedback 就餐反馈" "«entity» 保存位置：本地" $bRecord $cBlue "#EEF4FF" ""

Class-Card 415 90 340 44 215 "LLMService（外部类）" "«external» 云端模型服务，非本软件" @"
+ recommend(profile, dishes) : RecommResult
──────────────
输入：候选集合 + 画像摘要（≤1k tokens）
输出：受约束 JSON，禁止安全结论
失败：Timeout / 4xx / 5xx / 超预算
──────────────
由 AIClient 统一封装，超时即降级。
"@ $cRed "#FFF1F2" ""

Class-Card 415 340 340 44 175 "RuleRanker（内部类）" "«service» 降级路径，可离线运行" @"
+ rank(profile, dishes, weights) : RecommResult
──────────────
规则：① 忌口硬过滤（仅标记，不剔除）
     ② 口味标签匹配 + 预算过滤
     ③ 历史负反馈降权
     ④ 信息缺失菜品保守降权（S6）
输出结构与 AI 结果完全一致（同一 Schema）
"@ $cPurple "#F5F3FF" ""

Class-Card 415 550 340 44 175 "RiskGuard（内部类）" "«service» 安全边界执行者" @"
+ check(dish, avoidList) : RiskHint
+ validate(output) : { ok, violations[] }
──────────────
职责：① 命中忌口 → 返回"可能含有 X，
  请向窗口确认"，不返回安全结论；
② 扫描模型输出中的确定性表述
  （"不含""可以吃""放心吃"）→ 拦截并降级
③ 确认动作写入 MealRecord 留痕
"@ $cRed "#FFF1F2" ""

Class-Card 415 760 340 44 120 "RecommendCache（内部类）" "«service» 结构" @"
+ key(profileId, menuId, weightsVersion)
+ get(key) / set(key, result)
──────────────
TTL 24 小时；命中直接返回，不进 AI。
反馈改变权重 → weightsVersion+1 → 缓存失效。
"@ $cGray "#F1F5F9" ""

# 关系连线
Arrow 380 300 415 250 $cBlue 1.4
Txt "1 : N（一个画像多次推荐）" 300 292 220 18 $fT (Br $cBlue) "Far"

Ln 210 340 210 380 (Pen $cGreen 1.4)
Txt "1 : N  一个菜单日包含多道菜" 226 348 300 18 $fT (Br $cGreen) "Near"
Arrow 210 610 210 660 $cGreen 1.4

Ln 755 235 800 235 (Pen $cAmber 1.4)
Txt "N : N（推荐结果引用菜品）" 662 218 300 18 $fT (Br $cAmber) "Far"

Ln 970 340 970 380 (Pen $cBlue 1.4)
Txt "1 : N  记录引用推荐/菜品" 788 348 300 18 $fT (Br $cBlue) "Near"
Ln 970 610 970 660 (Pen $cBlue 1.4)
Txt "1 : 0..1  一条记录至多一条反馈" 776 618 320 18 $fT (Br $cBlue) "Near"
Arrow 585 305 585 340 $cRed 1.4 "Dash"
Txt "超时即改由 RuleRanker 产出同结构结果" 600 310 400 18 $fT (Br $cRed) "Near"

# 图例
Box 40 730 340 160 "#FFFFFF" "#94A3B8" "保存与敏感数据说明`n① 全部业务数据仅存本地，不上传服务器；`n② ★ = 敏感数据（忌口/过敏、风险确认留痕），`n     不参与任何第三方分析，可一键清空；`n③ 只有候选集合与画像标签摘要会经云函数`n     转发给模型服务，不含身份信息。" $fT (Br $cGray)
Save-Canvas $cv "$OutDir\图3-3-数据模型类图.png"

# ══════════════════════════════════════════════════════════════════════
# 图3-4 核心流程顺序图（正常路径 + 降级 + 人工确认）
# ══════════════════════════════════════════════════════════════════════
$cv = New-Canvas 1180 900; Init-G $cv.g
Txt "图3-4 知食校园 核心用户流程顺序图（正常路径 / 降级路径 / 强制人工确认）" 40 14 1100 30 $fTitle (Br $cText)

$lanes = @(
    @{ x = 90;  t = "学生`n(用户)" ; fill = "#ECFDF5"; stroke = $cGreen },
    @{ x = 245; t = "P3 推荐页`n(表现层UI)"; fill = "#F1F5F9"; stroke = "#64748B" },
    @{ x = 400; t = "M3 推荐编排`n(业务层)"; fill = "#EEF4FF"; stroke = $cBlue },
    @{ x = 555; t = "M4 规则推荐`n(降级路径)"; fill = "#F5F3FF"; stroke = $cPurple },
    @{ x = 710; t = "AIClient`n(云函数+校验)"; fill = "#FFF1F2"; stroke = $cRed },
    @{ x = 865; t = "LLM 服务`n(云端外部)"; fill = "#FFF1F2"; stroke = $cRed },
    @{ x = 1020; t = "D1 本地存储`n(数据层)"; fill = "#F0FDF4"; stroke = $cGreen }
)
foreach ($l in $lanes) {
    Box ($l.x - 70) 60 140 52 $l.fill $l.stroke $l.t $fS (Br $cText)
    Ln $l.x 112 $l.x 840 (Pen "#CBD5E1" 1 "Dash")
}

# 顺序消息（y 从 130 起，步长 30）
function M([double]$from, [double]$to, [double]$y, [string]$text, [string]$color, [double]$off = 0) {
    $x1 = $lanes[$from].x; $x2 = $lanes[$to].x
    Arrow $x1 ($y + $off) $x2 ($y + $off) $color
    $cx = ($x1 + $x2) / 2
    $w = [math]::Max(220, [math]::Abs($x2 - $x1) + 120)
    Txt $text ($cx - $w / 2) ($y - 26 + $off) $w 20 $fT (Br $color)
}
function Self([double]$lane, [double]$y, [string]$text, [string]$color) {
    $x = $lanes[$lane].x
    Ln $x $y ($x + 34) $y (Pen $color 1.2)
    Ln ($x + 34) $y ($x + 34) ($y + 14) (Pen $color 1.2)
    Arrow ($x + 34) ($y + 14) $x ($y + 14) $color
    Txt $text ($x + 42) ($y - 8) 420 20 $fT (Br $color) "Near"
}

# 正常路径
M 0 1 140 "① 打开小程序，进入推荐页" $cGreen
M 1 2 168 "② requestRecommend(profileId, menuId)" $cBlue
M 2 6 196 "③ 读取画像 / 当日菜单 / 反馈权重" $cGreen
M 6 2 224 "④ 返回 Dish[] + UserProfile + weights" $cGreen
M 2 6 252 "⑤ 查缓存 Recommendation(TTL 24h)" $cAmber
Txt "缓存未命中 → 继续" 900 254 250 18 $fT (Br $cAmber) "Near"
M 2 4 280 "⑥ 先算规则基线（始终执行，作兜底）" $cPurple
M 4 2 308 "⑦ baseResult（结构同 AI 结果）" $cPurple
M 2 3 336 "⑧ recommend(候选集合, 画像摘要)" $cRed
M 3 5 364 "⑨ HTTPS 请求（HTTPS 域名白名单）" $cRed
M 5 3 392 "⑩ 受约束 JSON：items[3]{dishId,score,reason,risk}" $cRed
M 3 2 420 "⑪ 解析 + Schema 校验 + RiskGuard 扫描" $cRed
M 2 0 448 "⑫ 展示 Top3 + 理由 + 数据状态条（实时/降级）" $cBlue
M 0 2 476 "⑬ 点选某道菜 → 请求记录" $cGreen
M 2 4 504 "⑭ check(dish, avoidList)" $cPurple
M 4 0 532 "⑮ 弹窗：可能含有花生，请向窗口确认（必须确认）" $cRed
M 0 1 560 "⑯ 确认后 → 允许记录" $cGreen
M 1 2 588 "⑰ confirmAndRecord(dishId)" $cBlue
M 2 6 616 "⑱ 写入 MealRecord（含风险确认时间戳）" $cGreen
M 0 1 644 "⑲ 就餐后反馈：符合 / 不符合口味" $cGreen
M 1 6 672 "⑳ 写入 Feedback → 下调同类口味权重 → weightsVersion+1 → 缓存失效" $cGreen

# 降级路径（虚线框 + 左侧标注）
$penDash = Pen $cAmber 1.6 "Dash"
$rect = New-Object System.Drawing.RectangleF([float](330 * $S), [float](348 * $S), [float](700 * $S), [float](90 * $S))
$G.DrawRectangle($penDash, $rect.X, $rect.Y, $rect.Width, $rect.Height)
Txt "降级路径（NFR-03 / V4）：模型超时、报错或超额 → 直接采用 ⑥⑦ 的 baseResult，页面提示""AI 暂不可用，以下为按口味标签排序的结果""，核心流程不中断。" 40 442 1100 34 $fT (Br $cAmber) "Near"

Box 40 500 200 60 "#FFF7ED" $cAmber "异常分支：`n菜单为空 → 提示暂无可靠菜单数据（S5）" $fT (Br $cText)
Box 40 580 200 60 "#FFF7ED" $cAmber "信息缺失：`n配料未知 → 保守排序 + 现场核对（S6）" $fT (Br $cText)
Box 40 660 200 60 "#FFF1F2" $cRed "安全红线：`n模型输出确定性表述 → 拦截并降级" $fT (Br $cText)

Txt "说明：⑥⑦ 先算规则基线是本设计的关键决策——降级不是出错后的补救，而是每次请求都算好的兜底结果（ADR-005）。" 40 790 1100 22 $fS (Br $cGray) "Near"
Save-Canvas $cv "$OutDir\图3-4-核心流程顺序图.png"
