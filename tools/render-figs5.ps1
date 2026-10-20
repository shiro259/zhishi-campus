# 渲染实验5 图5-1 / 图5-2 / 图5-3 → PNG
# 用 .NET GDI+ 直接绘制，不依赖浏览器/联网（与实验4 同一套思路；本机无头浏览器被沙箱拒绝时的替代方案）
# 数据全部来自 docs/report/figures5/fig-data.json（由 lab5/build-fig5-data.mjs 从真实运行落盘生成）
# 用法： & '.\render-figs5.ps1'                                  （本机是 Windows PowerShell 5.1，脚本在 5.1 / 7 上都能跑）
#        & '.\render-figs5.ps1' -DataFile <path> -OutDir <dir>
#        & '.\render-figs5.ps1' -Trace                              （额外写 fig5.trace.txt 供自检）
# 注意：本文件必须保存为 UTF-8 with BOM —— 5.1 读无 BOM 的 .ps1 会按 ANSI 解码，中文全变乱码、直接语法错误。
#
# 排版约定（与实验4 一致）：所有坐标都是「逻辑像素」，$S=2 放大到真实像素；
# 文字一律用 MeasureString 测宽后自己算坐标（本机 StringFormat.Alignment 不生效，会把 Center 当 Near），
# 换行用 WrapLines/WrapTxt，画布高度按内容动态测量，不留半截文字。
param(
    [string]$DataFile = '',
    [string]$OutDir = '',
    [switch]$Trace
)

# 关于图5-3 左图的状态行：规格里写的是「未调用模型 · 资料不足」，但 fig-data.json 里 Q5 这次真实运行
# latencyMs=1037、totalTokens=813 —— 模型确实被调用了，是模型按提示声明"资料不足"。为不让图与 compare.md
# 自相矛盾，状态行改成按数据决定：token>0 写「已调用模型 · 资料不足」，token=0 才写「未调用模型 · 资料不足」。
# （真正"无检索、不发请求"的是 Q6：2ms / 0 token，它的分支画在图5-1 的框3 侧支路里。）
#
# 自检手段：脚本内部统计"文字被画布夹取次数/最右墨迹/最下墨迹"；-Trace 会把每段文字的坐标写成
# fig5.trace.txt 并做两两重叠检查（用于无法目视时确认没有压字）。
Add-Type -AssemblyName System.Drawing

$S = 2.0
$FAM = 'Microsoft YaHei'

$Here = $PSScriptRoot
if ($OutDir -eq '') { $OutDir = Join-Path $Here '..\docs\report\figures5' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if ($DataFile -eq '') { $DataFile = Join-Path $OutDir 'fig-data.json' }
if (-not (Test-Path -LiteralPath $DataFile)) { throw "缺少数据文件 $DataFile（先运行 node lab5/build-fig5-data.mjs）" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$script:TRACE_ON = $Trace.IsPresent
$script:TRACEFILE = Join-Path $OutDir 'fig5.trace.txt'
if ($script:TRACE_ON) { Set-Content -LiteralPath $script:TRACEFILE -Value '# fig5 render trace' -Encoding UTF8 }

# ============================================================ 配色（沿用实验4）
$C_BG = '#FBFAF7'   # 画布底色
$C_CARD = '#FFFFFF'   # 卡片
$C_LINE = '#EDEAE5'   # 描边
$C_INK = '#14110F'   # 正文 / 图题
$C_INK2 = '#8A8580'   # 次要文字
$C_BRAND = '#FF5A36'   # 品牌橙
$C_GREEN = '#1F9D63'
$C_RED = '#D9534F'
$C_WARN = '#FFF8E6'   # 警告黄（兜底支路）
$C_WARN_LINE = '#F0DFBA'
$C_WARN_INK = '#8A6A22'
$C_PHONE_BG = '#F7F6F3'  # 手机屏幕底色（实验4 同色）
$C_ARROW = '#B8B2AA'

# ============================================================ 基础工具（改写自 实验4/render-figs.ps1）
$script:DRAW = $true     # 测量两遍式布局：$false 时只算尺寸不落笔
$script:CANVAS_W = 0     # 由 NewCanvas 设置，用于把文字/方框夹在画布内（防算错坐标被裁）
$script:CLAMP = 0        # 被画布边界夹取的次数（>0 说明坐标算错、文字被挪位）
$script:RIGHT = 0        # 已落笔文字的最右墨迹（逻辑像素）
$script:BOTTOM = 0       # 已落笔文字的最下墨迹
$script:TEXTS = @()

function Col([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function F([double]$px, [string]$style = 'Regular') {
    New-Object System.Drawing.Font($FAM, ($px * $S), [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel)
}
# 行高：Microsoft YaHei 的实际墨高约 1.03×字号，1.58 留出舒服的行距
function Lh([double]$px) { [Math]::Round($px * 1.58) }
function Fill([string]$hex) { New-Object System.Drawing.SolidBrush((Col $hex)) }
function Strk([string]$hex, [double]$lw = 1) {
    $p = New-Object System.Drawing.Pen((Col $hex), ([float]($lw * $S)))
    $p.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    return $p
}
function DashStrk([string]$hex, [double]$lw = 1) {
    $p = Strk $hex $lw
    $p.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    return $p
}
function RoundPath($x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x = $x * $S; $y = $y * $S; $w = $w * $S; $h = $h * $S
    $r = [Math]::Min($r * $S, [Math]::Min($w, $h) / 2)
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}
function Box($g, $bx, $by, $bw, $bh, [string]$fillHex, [string]$strokeHex = '', $br = 12, [double]$bsw = 1, [bool]$dash = $false) {
    if (-not $script:DRAW) { return }
    if ($script:CANVAS_W -gt 0) {
        if ($bx -lt 4) { $bw = $bw - (4 - $bx); $bx = 4 }
        if (($bx + $bw) -gt ($script:CANVAS_W + 4)) { $bw = $script:CANVAS_W + 4 - $bx }
        if ($bw -lt 1) { $bw = 1 }
    }
    $p = RoundPath $bx $by $bw $bh $br
    if ($fillHex -ne '') { $g.FillPath((Fill $fillHex), $p) }
    if ($strokeHex -ne '') {
        if ($dash) { $g.DrawPath((DashStrk $strokeHex $bsw), $p) } else { $g.DrawPath((Strk $strokeHex $bsw), $p) }
    }
    $p.Dispose()
}
# 文字宽度：MeasureString 默认会多算 size/3 的空白（左右各 size/6），减掉才是真实墨宽
function MW($g, [string]$text, $font) {
    if ($text -eq '' -or $null -eq $text) { return [double]0 }
    return [double](($g.MeasureString($text, $font).Width / $S) - (($font.Size / $S) / 3))
}
# 注意：不要依赖 StringFormat.Alignment —— 本机 .NET/PowerShell 组合下 Center 会被当成 Near
function Txt($g, [string]$text, $x, $y, $font, [string]$hex, [string]$align = 'Near', [double]$boxW = 0) {
    if (-not $script:DRAW) { return }
    if ($text -eq '' -or $null -eq $text) { return }
    $tw = MW $g $text $font
    $dx = $x
    if ($align -eq 'Center') { $dx = $x - $tw / 2 }
    elseif ($align -eq 'Far') { $dx = $x + $boxW - $tw }
    if ($script:CANVAS_W -gt 0) {
        if ($dx -lt 4) { $dx = 4; $script:CLAMP++; Write-Host ("  [clamp] left: $text") }
        if (($dx + $tw) -gt ($script:CANVAS_W - 4)) { $dx = $script:CANVAS_W - 4 - $tw; $script:CLAMP++; Write-Host ("  [clamp] right: $text") }
        if ($dx -lt 4) { $dx = 4; $script:CLAMP++; Write-Host ("  [clamp] left2: $text") }
    }
    if (($dx + $tw) -gt $script:RIGHT) { $script:RIGHT = $dx + $tw }
    if (($y + $font.Size / $S) -gt $script:BOTTOM) { $script:BOTTOM = $y + $font.Size / $S }
    if ($script:TRACE_ON) { $script:TEXTS += ,@{ t = $text; x = [double]$dx; y = [double]$y; w = $tw; h = [double]($font.Size / $S) } }
    $b = Fill $hex
    $g.DrawString($text, $font, $b, [float]($dx * $S), [float]($y * $S))
    $b.Dispose()
}
function WrapLines($g, [string]$text, $font, [double]$maxW) {
    $out = @(); $cur = ''
    if ($null -eq $text) { $text = '' }
    foreach ($ch in $text.ToCharArray()) {
        $t = $cur + $ch
        if ((MW $g $t $font) -gt $maxW -and $cur -ne '') { $out += $cur; $cur = [string]$ch }
        else { $cur = $t }
    }
    if ($cur -ne '') { $out += $cur }
    if ($out.Count -eq 0) { $out += '' }
    return $out
}
function WrapTxt($g, [string]$text, $x, $y, $font, [string]$hex, [double]$maxW, [double]$lh) {
    $i = 0
    foreach ($ln in (WrapLines $g $text $font $maxW)) {
        Txt $g $ln $x ($y + $i * $lh) $font $hex
        $i++
    }
    return $i * $lh
}
function Chip($g, [string]$text, $x, $y, $font, [string]$fillHex, [string]$textHex, [string]$strokeHex = '') {
    $w = [Math]::Round((MW $g $text $font) + 20)
    Box $g $x $y $w 26 $fillHex $strokeHex 13
    Txt $g $text ($x + 10) ($y + 4) $font $textHex
    return $w
}
function ArrowDown($g, $x, $y1, $y2, [string]$hex = '#B8B2AA') {
    if (-not $script:DRAW) { return }
    $pen = New-Object System.Drawing.Pen((Col $hex), ([float](1.4 * $S)))
    $g.DrawLine($pen, [float]($x * $S), [float]($y1 * $S), [float]($x * $S), [float](($y2 - 5) * $S))
    $g.FillPolygon((Fill $hex), @(
            (New-Object System.Drawing.PointF([float]($x * $S), [float]($y2 * $S))),
            (New-Object System.Drawing.PointF([float](($x - 4.5) * $S), [float](($y2 - 6) * $S))),
            (New-Object System.Drawing.PointF([float](($x + 4.5) * $S), [float](($y2 - 6) * $S)))))
    $pen.Dispose()
}
function ArrowRight($g, $x1, $x2, $y, [string]$hex = '#C98A1B') {
    if (-not $script:DRAW) { return }
    $pen = New-Object System.Drawing.Pen((Col $hex), ([float](1.4 * $S)))
    $g.DrawLine($pen, [float]($x1 * $S), [float]($y * $S), [float](($x2 - 5) * $S), [float]($y * $S))
    $g.FillPolygon((Fill $hex), @(
            (New-Object System.Drawing.PointF([float]($x2 * $S), [float]($y * $S))),
            (New-Object System.Drawing.PointF([float](($x2 - 7) * $S), [float](($y - 4.5) * $S))),
            (New-Object System.Drawing.PointF([float](($x2 - 7) * $S), [float](($y + 4.5) * $S)))))
    $pen.Dispose()
}
function HLine($g, $x1, $x2, $y, [string]$hex = $C_LINE, [double]$lw = 1) {
    if (-not $script:DRAW) { return }
    $g.DrawLine((Strk $hex $lw), [float]($x1 * $S), [float]($y * $S), [float]($x2 * $S), [float]($y * $S))
}
# 居中图题：必须先在画布宽度内换行，否则 Center 会把文字推出去
function CenterTitle($g, [string]$text, [double]$canvasW, [double]$y, $font, [double]$lh = 23) {
    $maxW = $canvasW - 32
    $i = 0
    foreach ($ln in (WrapLines $g $text $font $maxW)) {
        Txt $g $ln ($canvasW / 2) ($y + $i * $lh) $font $C_INK 'Center' $maxW
        $i++
    }
    return $i * $lh
}
function Fmt([double]$v, [string]$fmt) {
    if ($null -eq $v) { return '' }
    return $v.ToString($fmt, [System.Globalization.CultureInfo]::InvariantCulture)
}
function NewCanvas([double]$W, [double]$H, [string]$bg = $C_BG, [double]$minX = 4) {
    $bmp = New-Object System.Drawing.Bitmap([int]($W * $S), [int]($H * $S))
    $bmp.SetResolution(288, 288)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear((Col $bg))
    $script:CANVAS_W = $W - 4
    if ($minX -gt 0) {
        $rect = New-Object System.Drawing.RectangleF([float]($minX * $S), 0, [float](($W - $minX - 4) * $S), [float]($H * $S))
        $g.SetClip($rect)
    }
    return @{ bmp = $bmp; g = $g }
}
function SavePng($bmp, [string]$path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $img = [System.Drawing.Image]::FromFile($path)
    $w = $img.Width; $h = $img.Height
    $img.Dispose()
    Write-Output ("  → {0}   {1} x {2} px   {3} KB" -f (Split-Path -Leaf $path), $w, $h, [math]::Round((Get-Item -LiteralPath $path).Length / 1KB, 1))
}
# 手机外壳：圆角、状态栏、返回箭头、标题栏。返回内容起始 y。
function DumpTrace([string]$figName) {
    if (-not $script:TRACE_ON) { return }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("### $figName  ($($script:TEXTS.Count) text runs)")
    foreach ($e in $script:TEXTS) {
        [void]$sb.AppendLine(("{0,7:N1} {1,7:N1} w={2,6:N1}  |{3}" -f $e.y, $e.x, $e.w, $e.t))
    }
    $bad = 0
    for ($i = 0; $i -lt $script:TEXTS.Count; $i++) {
        for ($j = $i + 1; $j -lt $script:TEXTS.Count; $j++) {
            $a = $script:TEXTS[$i]; $b = $script:TEXTS[$j]
            $ox = [Math]::Min($a.x + $a.w, $b.x + $b.w) - [Math]::Max($a.x, $b.x)
            $oy = [Math]::Min($a.y + $a.h * 0.85, $b.y + $b.h * 0.85) - [Math]::Max($a.y, $b.y)
            if ($ox -gt 2 -and $oy -gt 2) {
                $bad++
                [void]$sb.AppendLine(("  OVERLAP: [{0}] vs [{1}] ({2:N1} x {3:N1})" -f $a.t, $b.t, $ox, $oy))
            }
        }
    }
    [void]$sb.AppendLine("overlapping pairs: $bad")
    Add-Content -LiteralPath $script:TRACEFILE -Value $sb.ToString() -Encoding UTF8
    Write-Output ("  trace: $figName -> $($script:TEXTS.Count) text runs, $bad overlapping pairs")
    $script:TEXTS = @()
}
function Frame($g, [double]$px, [double]$py, [double]$W, [double]$H, [string]$navTitle) {
    Txt $g '9:41' ($px + 16) ($py + 9) (F 12 'Bold') $C_INK
    Txt $g '▮▮▮  ⌾  ▭' ($px + 12) ($py + 10) (F 11) $C_INK 'Far' ($W - 26)
    Txt $g '‹' ($px + 13) ($py + 24) (F 21 'Bold') $C_INK
    Txt $g $navTitle ($px + $W / 2) ($py + 30) (F 16 'Bold') $C_INK 'Center' $W
    HLine $g $px ($px + $W) ($py + 60) $C_LINE
    return $py + 62
}

# ============================================================ 读数据（缺字段直接报错，不填假数）
function Need($obj, [string]$name, [string]$where) {
    if ($null -eq $obj) { throw "$where 不存在，无法读取 $name" }
    $prop = $obj.PSObject.Properties[$name]
    if ($null -eq $prop) { throw "$where.$name 缺失（请重新运行 node lab5/build-fig5-data.mjs）" }
    if ($null -eq $prop.Value) { throw "$where.$name 为空" }
    return $prop.Value
}
$D = Get-Content -LiteralPath $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $D) { throw "$DataFile 解析失败" }

$KB = Need $D 'kb' 'fig-data'
$docCount = [int](Need $KB 'docCount' 'kb')
$chunkCount = [int](Need $KB 'chunkCount' 'kb')
$totalChars = [string](Need $KB 'totalChars' 'kb')
$avgChars = [string](Need $KB 'avgChunkChars' 'kb')

$Q1 = Need $D 'q1' 'fig-data'
$q1Question = [string](Need $Q1 'question' 'q1')
$q1Answer = [string](Need $Q1 'answer' 'q1')
$q1Lat = [string](Need $Q1 'latencyMs' 'q1')
$q1Tok = [string](Need (Need $Q1 'tokens' 'q1') 'totalTokens' 'q1.tokens')
$q1Insuff = [bool](Need $Q1 'insufficient' 'q1')
$q1Cites = @(Need $Q1 'citations' 'q1')
$q1Sources = @(Need $Q1 'sources' 'q1')

$Q5 = Need $D 'q5' 'fig-data'
$q5Question = [string](Need $Q5 'question' 'q5')
$q5Answer = [string](Need $Q5 'answer' 'q5')
$q5Follow = [string](Need $Q5 'followup' 'q5')
$q5Lat = [int](Need $Q5 'latencyMs' 'q5')
$q5Tok = [int](Need (Need $Q5 'tokens' 'q5') 'totalTokens' 'q5.tokens')
$q5Insuff = [bool](Need $Q5 'insufficient' 'q5')

$Q7 = Need $D 'q7' 'fig-data'
$q7Question = [string](Need $Q7 'question' 'q7')
$q7Answer = [string](Need $Q7 'answer' 'q7')
$q7Follow = [string](Need $Q7 'followup' 'q7')
$q7Tok = [int](Need (Need $Q7 'tokens' 'q7') 'totalTokens' 'q7.tokens')
$q7Insuff = [bool](Need $Q7 'insufficient' 'q7')
$q7Lat = [int]$Q7.latencyMs

$D1 = Need $D 'd1' 'fig-data'
$d1Question = [string](Need $D1 'question' 'd1')
$d1Ranked = @(Need $D1 'ranked' 'd1')
$d1CtxChars = [string](Need $D1 'contextChars' 'd1')
$d1TopK = [string](Need $D1 'topK' 'd1')
$d1Thr = [string](Need $D1 'threshold' 'd1')
if ($q1Sources.Count -eq 0) { throw 'q1.sources 为空，图5-2 的检索表格没有内容' }
if ($q1Cites.Count -eq 0) { throw 'q1.citations 为空，图5-2 的引用小节没有内容' }
if ($d1Ranked.Count -eq 0) { throw 'd1.ranked 为空，图5-2 的检索表格没有内容' }

# 图5-3 的状态行按真实数据写：Q5 这次真的调用了模型（token>0），不能写「未调用模型」
$q5CalledModel = ($q5Tok -gt 0)
$q5Status = if ($q5CalledModel) { '已调用模型 · 资料不足' } else { '未调用模型 · 资料不足' }
$q5StatusRight = "$q5Lat ms · $q5Tok token"
$q5Note = if ($q5CalledModel) { '检索片段不足以回答，模型按提示声明资料不足，未编造答案' } else { '知识库没有该问题的资料，未调用模型' }
$q7Status = '未调用模型 · 程序侧护栏'
$q7StatusRight = "$q7Lat ms · $q7Tok token"
$q7Note = '命中用药类规则，未调用模型'

# 测量用的离屏 Graphics（只用来 MeasureString）
$probeBmp = New-Object System.Drawing.Bitmap(1200, 200)
$pg = [System.Drawing.Graphics]::FromImage($probeBmp)
$pg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$kbLine = "知识库 $docCount 份资料 / $chunkCount 片段（共 $totalChars 字，平均 $avgChars 字/片段）"
Write-Output ("数据：kb = {0} 份 / {1} 片段 · Q1 {2}ms/{3}token · Q5 {4}ms/{5}token · Q7 {6}ms/{7}token" -f `
        $docCount, $chunkCount, $q1Lat, $q1Tok, $q5Lat, $q5Tok, $q7Lat, $q7Tok)

# ============================================================ 图5-1 RAG 最小链路（竖向流程图 + 两条兜底支路）
function DrawFlow {
    param($g)

    $ML = 32          # 主列左边距
    $BW = 460         # 主框宽
    $SX = 548         # 侧支路框起点
    $SW = 268         # 侧支路框宽
    $CW = 848         # 画布宽（右侧留白 848-816=32）
    $GAP = 26         # 框间距
    $fT = F 15 'Bold'; $fB = F 13; $fS = F 13
    $lhT = 22; $lhB = Lh 13; $lhS = Lh 13
    $padT = 14; $padB = 12
    $bodyX = 58               # 序号徽章右侧的文字起点
    $bodyW = $BW - $bodyX - 16

    # ---- 步骤定义（每行不超过 ~30 汉字，侧支路标注每行不超过 22 汉字）
    $steps = @(
        @{ n = '1'; t = '学生问题'; lines = @("示例：$d1Question"); side = $null },
        @{ n = '2'; t = '程序侧护栏  guard.js'; lines = @('空问题 / 超长 / 用药类问题 → 直接拦截', '不发模型请求，返回固定提示');
            side = @{ lines = @('固定提示（不调用模型）', '资料不足 / 无法处理'); tag = '拦截' } },
        @{ n = '3'; t = '混合检索  retriever.js'; lines = @('BM25 关键词 0.6 + 字符 n-gram 向量 0.4', '取前 k=4 条，相关阈值 0.2');
            side = @{ lines = @('无相关片段 → 资料不足提示', '（不发模型请求）'); tag = '无命中' } },
        @{ n = '4'; t = '上下文组装  prompt.js'; lines = @('每条片段带 [S1]…[S4] 编号与来源', '片段拼进 system / user 模板'); side = $null },
        @{ n = '5'; t = '模型网关  gateway.js'; lines = @('DeepSeek chat/completions（deepseek-chat）', 'temperature 0.3 · 20s 超时 · 失败重试 1 次'); side = $null },
        @{ n = '6'; t = '结构化校验与引用核对  validate.js'; lines = @('编号必须来自本次资料', 'quote 必须是原文连续片段且 ≥6 字', '资料不足不得带引用');
            side = @{ lines = @('校验不通过 → 丢弃并提示', '不返回错误答案'); tag = '不通过' } },
        @{ n = '7'; t = '带出处的回答'; lines = @('正文标 [S#]，下方「引用」小节列原文', '每个编号都能回溯到检索片段'); side = $null }
    )

    $TITLE = '图5-1  RAG 最小链路与两条兜底路径'

    # ---- 第一遍：算尺寸
    $script:DRAW = $false; $script:CANVAS_W = 0
    $titleH = CenterTitle $g $TITLE $CW 8 (F 15 'Bold')
    $y = 8 + $titleH + 16
    $geo = @()
    foreach ($st in $steps) {
        $ls = @()
        foreach ($ln in $st.lines) { $ls += (WrapLines $g $ln $fB $bodyW) }
        $h = $padT + $lhT + 6 + ($ls.Count * $lhB) + $padB
        $sideH = 0; $sideLines = @()
        if ($null -ne $st.side) {
            foreach ($ln in $st.side.lines) { $sideLines += (WrapLines $g $ln $fS ($SW - 24)) }
            $sideH = 12 + ($sideLines.Count * $lhS) + 12
        }
        $geo += @{ y = $y; h = $h; lines = $ls; sideH = $sideH; sideLines = $sideLines }
        $y += $h + $GAP
    }
    $noteY = $y - $GAP + 14
    $canvasH = $noteY + 20 + 14

    # ---- 第二遍：真正绘制
    $script:DRAW = $true
    $script:CLAMP = 0; $script:RIGHT = 0; $script:BOTTOM = 0
    $c = NewCanvas $CW $canvasH $C_BG
    $g2 = $c.g
    [void](CenterTitle $g2 $TITLE $CW 8 (F 15 'Bold'))

    for ($i = 0; $i -lt $steps.Count; $i++) {
        $st = $steps[$i]; $gy = $geo[$i]
        $bx = $ML; $by = $gy.y; $bh = $gy.h
        Box $g2 $bx $by $BW $bh $C_CARD '#DAD5CE' 12
        Box $g2 ($bx + 12) ($by + 14) 34 34 $C_BRAND '' 17
        Txt $g2 $st.n ($bx + 12 + 17) ($by + 20) (F 15 'Bold') '#FFFFFF' 'Center'
        Txt $g2 $st.t ($bx + $bodyX) ($by + 12) $fT $C_INK
        $ty = $by + $padT + $lhT + 6
        foreach ($ln in $gy.lines) { Txt $g2 $ln ($bx + $bodyX) $ty $fB $C_INK2; $ty += $lhB }

        # 向下的箭头
        if ($i -lt $steps.Count - 1) {
            ArrowDown $g2 ($bx + $BW / 2) ($by + $bh) ($by + $bh + $GAP) $C_ARROW
        }

        # 侧支路（虚线框 + 折线箭头）
        if ($null -ne $st.side) {
            $sy = $by + ($bh - $gy.sideH) / 2
            Box $g2 $SX $sy $SW $gy.sideH $C_WARN $C_WARN_LINE 12 1 $true
            $ly = $sy + 12
            foreach ($ln in $gy.sideLines) { Txt $g2 $ln ($SX + 12) $ly $fS $C_WARN_INK; $ly += $lhS }
            $cy = $by + $bh / 2
            ArrowRight $g2 ($bx + $BW) $SX $cy $C_WARN_LINE
            $tw = MW $g2 $st.side.tag $fS
            Box $g2 ($bx + $BW + 6) ($cy - 22) ($tw + 12) 18 $C_BG '' 4
            Txt $g2 $st.side.tag ($bx + $BW + 12) ($cy - 20) (F 12) $C_WARN_INK
        }
    }
    Txt $g2 $kbLine $ML $noteY (F 12) $C_INK2
    Write-Output ("  自检：文字夹取 $script:CLAMP 次；最右墨迹 $([Math]::Round($script:RIGHT))pt / 画布 $CW；最下墨迹 $([Math]::Round($script:BOTTOM))pt / 画布高 $canvasH")
    DumpTrace 'fig5-1-FLOW'
SavePng $c.bmp (Join-Path $OutDir 'fig5-1-RAG最小链路.png')
}

# ============================================================ 图5-2 问一问页面（正常问答）
# 布局说明：检索卡片用「表头 + 每条两行」的形式 —— 第一行是来源/片段/BM25/余弦/最终分/相关，
# 第二行用小字画「文档 · 小节」（过长时换行，超过两行截断加省略号），这样 380pt 宽的屏幕里不会挤成一团。
function DrawPageNormal {
    param($g, [double]$x0, [double]$y0, [double]$PW)

    $pad = 16
    $cw = $PW - 2 * $pad
    $cx = $x0 + $pad
    $y = $y0 + 14
    $fTitle = F 17 'Bold'; $fBody = F 16; $fLabel = F 13; $fSmall = F 12; $fMini = F 11
    $lhTitle = Lh 17; $lhBody = Lh 16; $lhLabel = Lh 13; $lhMini = Lh 11

    # ① 输入卡片
    $qLines = WrapLines $g $q1Question $fTitle ($cw - 28)
    $cardH = 10 + 26 + 8 + ($qLines.Count * $lhTitle) + 12
    Box $g $cx $y $cw $cardH $C_CARD $C_LINE 14
    [void](Chip $g '学生问' ($cx + 14) ($y + 10) $fLabel '#FFF0EA' $C_BRAND '#F3D9CF')
    $yy = $y + 10 + 26 + 8
    foreach ($ln in $qLines) { Txt $g $ln ($cx + 14) $yy $fTitle $C_INK; $yy += $lhTitle }
    $y += $cardH + 12

    # ② 回答卡片（状态行 → 整段回答 → 引用小节）
    $statusTxt = "deepseek-chat · $q1Lat ms · $q1Tok token"
    $statusChipTxt = if ($q1Insuff) { '资料不足' } else { '已作答' }
    $ansLines = WrapLines $g $q1Answer $fBody ($cw - 28)
    $citeBlocks = @()
    foreach ($ct in $q1Cites) {
        $quote = '「' + [string](Need $ct 'quote' 'q1.citations') + '」'
        $citeBlocks += @{ id = [string](Need $ct 'id' 'q1.citations'); lines = @(WrapLines $g $quote $fLabel ($cw - 28 - 46)) }
    }
    $citeH = 0
    foreach ($b in $citeBlocks) { $citeH += ($b.lines.Count * $lhLabel) + 6 }
    $cardH = 12 + 26 + 8 + ($ansLines.Count * $lhBody) + 14 + $lhLabel + 6 + $citeH + 10
    Box $g $cx $y $cw $cardH $C_CARD $C_LINE 14
    $yy = $y + 12
    Txt $g $statusTxt ($cx + 14) ($yy + 6) $fSmall $C_INK2
    $sw = MW $g $statusTxt $fSmall
    if ($q1Insuff) { [void](Chip $g $statusChipTxt ($cx + 14 + $sw + 8) ($yy + 1) $fMini '#FDECEC' $C_RED) }
    else { [void](Chip $g $statusChipTxt ($cx + 14 + $sw + 8) ($yy + 1) $fMini '#E8F5EE' $C_GREEN) }
    $yy += 26 + 8
    foreach ($ln in $ansLines) { Txt $g $ln ($cx + 14) $yy $fBody $C_INK; $yy += $lhBody }
    $yy += 14
    HLine $g ($cx + 14) ($cx + $cw - 14) ($yy - 6) $C_LINE
    Txt $g '引用' ($cx + 14) $yy $fLabel $C_INK
    $yy += $lhLabel + 2
    foreach ($b in $citeBlocks) {
        Txt $g ('[' + $b.id + ']') ($cx + 14) $yy $fLabel $C_BRAND
        $qy = $yy
        foreach ($ln in $b.lines) { Txt $g $ln ($cx + 14 + 46) $qy $fLabel $C_INK2; $qy += $lhLabel }
        $yy += ($b.lines.Count * $lhLabel) + 6
    }
    $y += $cardH + 12

    # ③ 检索卡片（表头 + 每条两行）
    $base = $cx + 12
    $colW = $cw - 24
    $cSrc = 0; $cChunk = 34
    $cBm = 188; $cCos = 242; $cFinal = 296; $cRel = $colW
    $docW = $colW - $cChunk
    $rows = @()
    foreach ($r in $d1Ranked) {
        $docTxt = ([string](Need $r 'title' 'd1.ranked')) + ' · ' + ([string](Need $r 'section' 'd1.ranked'))
        $docLines = @(WrapLines $g $docTxt $fMini $docW)
        if ($docLines.Count -gt 2) {
            $docLines = @($docLines[0], ($docLines[1].Substring(0, [Math]::Max(1, $docLines[1].Length - 1)) + '…'))
        }
        $rows += @{ r = $r; docLines = $docLines }
    }
    $rowsH = 0
    foreach ($row in $rows) { $rowsH += 20 + ($row.docLines.Count * $lhMini) + 8 }
    $cardH = 12 + $lhLabel + 4 + 16 + 6 + 16 + $rowsH + 10
    Box $g $cx $y $cw $cardH $C_CARD $C_LINE 14
    $yy = $y + 12
    Txt $g '检索结果（按相关性排序）' ($cx + 14) $yy (F 15 'Bold') $C_INK
    $yy += $lhLabel + 4
    Txt $g "k=$d1TopK · 阈值 $d1Thr · 上下文 $d1CtxChars 字" ($cx + 14) $yy $fSmall $C_INK2
    $yy += 16 + 6
    # 表头
    Txt $g '来源' ($base + $cSrc) $yy $fMini $C_INK2
    Txt $g '片段' ($base + $cChunk) $yy $fMini $C_INK2
    Txt $g 'BM25' $base $yy $fMini $C_INK2 'Far' $cBm
    Txt $g '余弦' $base $yy $fMini $C_INK2 'Far' $cCos
    Txt $g '最终分' $base $yy $fMini $C_INK2 'Far' $cFinal
    Txt $g '相关' $base $yy $fMini $C_INK2 'Far' $cRel
    $yy += 16
    HLine $g ($base) ($cx + $cw - 12) $yy $C_LINE
    $yy += 6
    foreach ($row in $rows) {
        $r = $row.r
        $rel = [bool](Need $r 'relevant' 'd1.ranked')
        Txt $g ([string]$r.sourceId) ($base + $cSrc) ($yy + 1) (F 12 'Bold') $C_INK
        Txt $g ([string]$r.chunkId) ($base + $cChunk) ($yy + 2) $fMini $C_INK2
        Txt $g (Fmt ([double]$r.bm25) '0.00') $base ($yy + 1) $fMini $C_INK 'Far' $cBm
        Txt $g (Fmt ([double]$r.cosine) '0.000') $base ($yy + 1) $fMini $C_INK 'Far' $cCos
        Txt $g (Fmt ([double]$r.finalScore) '0.000') $base ($yy + 1) $fMini $C_INK 'Far' $cFinal
        if ($rel) { Txt $g '是' $base ($yy + 1) $fMini $C_GREEN 'Far' $cRel }
        else { Txt $g '否' $base ($yy + 1) $fMini $C_RED 'Far' $cRel }
        $dy = $yy + 20
        foreach ($ln in $row.docLines) { Txt $g $ln ($base + $cChunk) $dy $fMini $C_INK2; $dy += $lhMini }
        $yy += 20 + ($row.docLines.Count * $lhMini) + 8
    }
    $y += $cardH + 12

    # ④ 底部小字
    Txt $g "知识库 $docCount 份资料 / $chunkCount 片段 · 两条兜底路径见图5-3" ($cx + 2) $y $fMini $C_INK2
    $y += $lhMini + 12

    return ($y - $y0)
}

$PW = 380
$CWP = 428           # 380 + 左右各 24

# ---- 图5-2
$TITLE2 = '图5-2  问一问页面（真实运行：正常问答）'
$script:DRAW = $false; $script:CANVAS_W = 0
$titleH2 = CenterTitle $pg $TITLE2 $CWP 8 (F 15 'Bold')
$pageH2 = DrawPageNormal $pg 24 0 $PW
$frameY2 = 8 + $titleH2 + 8
$frameH2 = 62 + $pageH2 + 8
$canvasH2 = $frameY2 + $frameH2 + 14
Write-Output ("图5-2 几何：titleH=$titleH2 pageH=$pageH2 frame=({0},{1}) 画布高 $canvasH2" -f $frameY2, $frameH2)

$script:DRAW = $true
$script:CLAMP = 0; $script:RIGHT = 0; $script:BOTTOM = 0
$c2 = NewCanvas $CWP $canvasH2 $C_BG
$g2 = $c2.g
[void](CenterTitle $g2 $TITLE2 $CWP 8 (F 15 'Bold'))
Box $g2 24 $frameY2 $PW $frameH2 $C_PHONE_BG '#E7E4DE' 22
$g2.SetClip((RoundPath 24 $frameY2 $PW $frameH2 22))
$innerY2 = Frame $g2 24 $frameY2 $PW $frameH2 '问一问 · 选餐助手'
[void](DrawPageNormal $g2 24 $innerY2 $PW)
$g2.ResetClip()
Write-Output ("  自检：文字夹取 $script:CLAMP 次；最右墨迹 $([Math]::Round($script:RIGHT))pt / 画布 $CWP；最下墨迹 $([Math]::Round($script:BOTTOM))pt / 框底 $($frameY2 + $frameH2)")
DumpTrace 'fig5-2-PAGE-NORMAL'
SavePng $c2.bmp (Join-Path $OutDir 'fig5-2-问一问页面-正常问答.png')

# ============================================================ 图5-3 问一问页面（两条兜底路径，左右并排）
function DrawPageFallback {
    param($g, [double]$x0, [double]$y0, [double]$PW, [string]$question, [string]$status, [string]$statusRight,
        [string]$answer, [string]$followup, [string]$note, [string]$statusHex, [string]$statusFill, [string]$statusStroke)

    $pad = 16
    $cw = $PW - 2 * $pad
    $cx = $x0 + $pad
    $y = $y0 + 14
    $fTitle = F 17 'Bold'; $fBody = F 16; $fLabel = F 13; $fSmall = F 12; $fMini = F 11
    $lhTitle = Lh 17; $lhBody = Lh 16; $lhLabel = Lh 13

    # ① 输入卡片
    $qLines = WrapLines $g $question $fTitle ($cw - 28)
    $cardH = 10 + 26 + 8 + ($qLines.Count * $lhTitle) + 12
    Box $g $cx $y $cw $cardH $C_CARD $C_LINE 14
    [void](Chip $g '学生问' ($cx + 14) ($y + 10) $fLabel '#FFF0EA' $C_BRAND '#F3D9CF')
    $yy = $y + 10 + 26 + 8
    foreach ($ln in $qLines) { Txt $g $ln ($cx + 14) $yy $fTitle $C_INK; $yy += $lhTitle }
    $y += $cardH + 12

    # ② 回答卡片（状态行用彩色底条，正文整段换行）
    $ansLines = WrapLines $g $answer $fBody ($cw - 28)
    $noteLines = WrapLines $g $note $fSmall ($cw - 28)
    # 状态行左文 + 右侧统计：先量宽，撞到一起就把统计信息下移一行（高度先算进来，避免框高和内容错位）
    $stW = MW $g $status (F 13 'Bold')
    $srW = MW $g $statusRight $fMini
    $collide = (($cx + 24 + $stW + 10) -gt ($cx + $cw - 14 - $srW))
    $statusH = if ($collide) { 28 + 15 } else { 28 }
    $cardH = 12 + $statusH + 8 + ($ansLines.Count * $lhBody) + 12 + ($noteLines.Count * (Lh 12)) + 12
    Box $g $cx $y $cw $cardH $C_CARD $C_LINE 14
    $yy = $y + 12
    Box $g ($cx + 14) $yy ($cw - 28) 28 $statusFill $statusStroke 8
    Txt $g $status ($cx + 24) ($yy + 6) (F 13 'Bold') $statusHex
    if ($collide) { Txt $g $statusRight ($cx + 24) ($yy + 32) $fMini $C_INK2 }
    else { Txt $g $statusRight ($cx + 14) ($yy + 9) $fMini $C_INK2 'Far' ($cw - 28) }
    $yy += $statusH + 8
    foreach ($ln in $ansLines) { Txt $g $ln ($cx + 14) $yy $fBody $C_INK; $yy += $lhBody }
    $yy += 12
    foreach ($ln in $noteLines) { Txt $g $ln ($cx + 14) $yy $fSmall $C_INK2; $yy += (Lh 12) }
    $y += $cardH + 12

    # ③ 追问卡片
    $fwLines = WrapLines $g $followup $fLabel ($cw - 28 - 46)
    $cardH = 12 + ($fwLines.Count * $lhLabel) + 12
    Box $g $cx $y $cw $cardH $C_WARN $C_WARN_LINE 12
    Txt $g '追问' ($cx + 14) ($y + 12) $fLabel $C_WARN_INK
    $fy = $y + 12
    foreach ($ln in $fwLines) { Txt $g $ln ($cx + 14 + 46) $fy $fLabel $C_WARN_INK; $fy += $lhLabel }
    $y += $cardH + 12

    # ④ 底部小字
    Txt $g "知识库 $docCount 份资料 / $chunkCount 片段" ($cx + 2) $y $fMini $C_INK2
    $y += (Lh 11) + 12

    return ($y - $y0)
}

$TITLE3 = '图5-3  问一问页面（真实运行：两条兜底路径）'
$CW3 = 24 + 380 + 40 + 380 + 24      # = 848，两个手机框之间留 40pt
$PX1 = 24
$PX2 = 24 + 380 + 40

$script:DRAW = $false; $script:CANVAS_W = 0
$titleH3 = CenterTitle $pg $TITLE3 $CW3 8 (F 15 'Bold')
$phA = DrawPageFallback $pg $PX1 0 $PW $q5Question $q5Status $q5StatusRight $q5Answer $q5Follow $q5Note $C_WARN_INK $C_WARN $C_WARN_LINE
$phB = DrawPageFallback $pg $PX2 0 $PW $q7Question $q7Status $q7StatusRight $q7Answer $q7Follow $q7Note $C_RED '#FDECEC' '#F3C9C6'
$pageH3 = [Math]::Max($phA, $phB)
$frameY3 = 8 + $titleH3 + 10
$frameH3 = 62 + $pageH3 + 10
$canvasH3 = $frameY3 + $frameH3 + 14
Write-Output ("图5-3 几何：左页高 $([Math]::Round($phA)) 右页高 $([Math]::Round($phB)) → 框高 $frameH3，画布 $CW3 x $canvasH3")

$script:DRAW = $true
$script:CLAMP = 0; $script:RIGHT = 0; $script:BOTTOM = 0
$c3 = NewCanvas $CW3 $canvasH3 $C_BG
$g3 = $c3.g
[void](CenterTitle $g3 $TITLE3 $CW3 8 (F 15 'Bold'))

# 左：Q5（资料不足）
Box $g3 $PX1 $frameY3 $PW $frameH3 $C_PHONE_BG '#E7E4DE' 22
$g3.SetClip((RoundPath $PX1 $frameY3 $PW $frameH3 22))
$innerY3 = Frame $g3 $PX1 $frameY3 $PW $frameH3 '问一问 · 选餐助手'
[void](DrawPageFallback $g3 $PX1 $innerY3 $PW $q5Question $q5Status $q5StatusRight $q5Answer $q5Follow $q5Note $C_WARN_INK $C_WARN $C_WARN_LINE)
$g3.ResetClip()

# 右：Q7（程序侧护栏）
Box $g3 $PX2 $frameY3 $PW $frameH3 $C_PHONE_BG '#E7E4DE' 22
$g3.SetClip((RoundPath $PX2 $frameY3 $PW $frameH3 22))
$innerY3b = Frame $g3 $PX2 $frameY3 $PW $frameH3 '问一问 · 选餐助手'
[void](DrawPageFallback $g3 $PX2 $innerY3b $PW $q7Question $q7Status $q7StatusRight $q7Answer $q7Follow $q7Note $C_RED '#FDECEC' '#F3C9C6')
$g3.ResetClip()

DumpTrace 'fig5-3-PAGE-FALLBACK'
SavePng $c3.bmp (Join-Path $OutDir 'fig5-3-问一问页面-兜底路径.png')
Write-Output ("  自检：文字夹取 $script:CLAMP 次；最右墨迹 $([Math]::Round($script:RIGHT))pt / 画布 $CW3（右手机框右沿 $($PX2 + $PW)）；最下墨迹 $([Math]::Round($script:BOTTOM))pt / 框底 $($frameY3 + $frameH3)")

# ============================================================ 图5-1 最后画（函数定义顺序无关，但流程图的测量要复用 probe）
DrawFlow -g $pg

$pg.Dispose(); $probeBmp.Dispose()
Write-Output "完成：$OutDir"
