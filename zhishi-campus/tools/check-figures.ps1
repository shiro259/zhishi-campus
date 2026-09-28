# 图示文本溢出检查：对每张图中的关键文本按其可用宽度测量，报告超宽项。
# 用法： powershell -File .\check-figures.ps1
# 说明：PowerShell 的 text 度量与 GDI+ DrawString 行为一致，可在不读图的情况下发现"文字超出方框"。

Add-Type -AssemblyName System.Drawing
$S = 2.0
$fontCache = @{}
function F([double]$px, [string]$style = "Regular") {
    $k = "$px|$style"
    if (-not $fontCache.ContainsKey($k)) {
        $fontCache[$k] = New-Object System.Drawing.Font("Microsoft YaHei", ($px * $S), [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel)
    }
    return $fontCache[$k]
}
$bmp = New-Object System.Drawing.Bitmap(10, 10)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$bad = 0
$checked = 0

function Check([string]$fig, [string]$text, [double]$boxW, [double]$px, [string]$style = "Regular", [double]$pad = 8, [int]$lines = 1) {
    $script:checked++
    $f = F $px $style
    $avail = ($boxW - $pad) * $S
    $maxW = 0
    foreach ($seg in ($text -split "`n")) {
        $m = $g.MeasureString($seg, $f)
        # 单行时按总量比较；多行时取最长行
        if ($m.Width -gt $maxW) { $maxW = $m.Width }
        if ($lines -gt 1 -and $m.Width -gt $maxW) { $maxW = $m.Width }
    }
    if ($lines -gt 1) {
        # 允许换行：按字符数估算需要的行数是否放得下（用平均字宽粗略判断）
        $need = [math]::Ceiling(($text -replace "`n",' ').Length * ($px * $S * 1.0)) / $avail
        $maxW = [math]::Min($maxW, $avail)
        if ($need -gt $lines * 1.35) { $bad++; "溢出[行数不足?] $fig | $text" }
        return
    }
    if ($maxW -gt $avail) {
        $script:bad++
        "溢出 $fig | 可用 {0:N0}px 实际 {1:N0}px | {2}" -f $avail, $maxW, $text
    }
}

# 抽样检查各图中"最容易被撑破"的文本（方框宽度与字号取自渲染脚本）
$cases = @(
    @('图3-1', '微信小程序（学生端界面 · 5 个页面）', 410, 12),
    @('图3-1', '本地业务逻辑：规则推荐 / 降级 / 忌口校验 / 记录反馈', 410, 12),
    @('图3-1', '本项目实现的程序侧校验（结构化校验 + 确定性表述拦截）', 410, 12),
    @('图3-1', '不保存的数据（明确声明）', 410, 11),
    @('图3-1', 'LLM 模型服务（云端 API）', 300, 11),
    @('图3-1', '食堂公示菜单（外部数据源）', 300, 11),
    @('图3-1', '① 操作：设置画像 / 选菜 / 确认 / 反馈', 250, 10),
    @('图3-2', '表现层 UI（5 个页面 + 2 个复用组件）', 560, 12),
    @('图3-2', '业务层 Domain（纯本地逻辑，可离线运行）', 560, 12),
    @('图3-2', 'AI 接入层 AIClient（唯一允许接触网络的模块）', 560, 12),
    @('图3-2', '左侧：分层架构（上层只依赖相邻下层；AIClient 是唯一出网模块，失败即降级到 M4）', 560, 11),
    @('图3-2', '依赖方向：pages → domain → data → storage；', 400, 11),
    @('图3-2', 'pages/domain 不得直接调用 ai/*，只能经 M3 推荐编排', 400, 11),
    @('图3-2', 'components/confirm-guard（忌口强制确认）', 400, 11),
    @('图3-3', '«entity» 保存位置：本地 wx.setStorage', 340, 10),
    @('图3-3', '«service» 安全边界执行者', 340, 13),
    @('图3-3', '① 命中忌口 → 返回"可能含有 X，', 340, 11),
    @('图3-3', '保存与敏感数据说明', 340, 11),
    @('图3-4', 'P3 推荐页', 140, 11),
    @('图3-4', 'M3 推荐编排', 140, 11),
    @('图3-4', '⑳ 写入 Feedback → 下调同类口味权重 → weightsVersion+1 → 缓存失效', 1000, 10),
    @('图3-4', '降级路径（NFR-03 / V4）：模型超时、报错或超额 → 直接采用 ⑥⑦ 的 baseResult，页面提示"AI 暂不可用，以下为按口味标签排序的结果"，核心流程不中断。', 1080, 10),
    @('图3-4', '⑥⑦ 先算规则基线是本设计的关键决策——降级不是出错后的补救，而是每次请求都算好的兜底结果（ADR-005）。', 1100, 11),
    @('图3-5', 'P3 推荐核心页', 240, 12),
    @('图3-5', 'C1 忌口强制确认（模态）', 240, 12),
    @('图3-5', '⑤ 重新操作：P3 提供"重新推荐（换一批）"；P4 提供"修改这条记录"；P2 提供"清空重填"；任何失败状态都给出下一步按钮，不出现死胡同。', 1060, 10),
    @('图3-5', '③ 返回：P2—P5 左上角「‹ 返回」回到上一页；模态 C1 只能由"已向窗口确认"或"换一道菜"关闭，不可点空白关闭。', 1060, 10),
    @('图3-6', '① 主行动按钮：进入核心任务的唯一入口，一键直达推荐页（≤1 次点击）。', 440, 9),
    @('图3-6', '④ 空数据状态（动态元素）：未记录时显示"今天还没有记录，去选餐 →"，不放占位假数据。', 440, 9),
    @('图3-7', '① 输入元素：只接受学生自己复制的公示文本；不做自动抓取（无接口），也不做拍照 OCR（明确不做）。', 480, 9),
    @('图3-8', '④ 强制人工确认（C1 组件，模态不可绕过）：未确认 → 无法记录该菜品（V3 硬门槛：确认后留痕）。', 500, 9),
    @('图3-8', '⑥ 空/错误状态：菜单未维护 → 整页替换为"暂无可靠菜单数据"＋"去维护菜单"按钮，不发 AI 请求；', 500, 9),
    @('图3-9', '② 用户命令元素：一键反馈（US-07）。负反馈 → 同类口味权重下调，下次推荐中排序下降（V5）。', 500, 9),
    @('图3-10', '⑥ 本页不提供任何"提高推荐准确度"式诱导：数据最小化优先于效果（NFR-05 / NFR-07）。', 460, 9)
)
foreach ($c in $cases) { Check $c[0] $c[1] $c[2] $c[3] }
"检查项: $checked  超宽项: $bad"
$g.Dispose(); $bmp.Dispose()
