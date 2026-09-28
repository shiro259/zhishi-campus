# 表格精简（最终版）：21 个表 → 10 个表（表3-1—表3-9 + 表4-1）
# 做法：逐行扫描 Markdown；遇到表题时整体替换（标题行 + 空行 + 表格块）为事先写好的新内容，
#       需要删除的表题则整块跳过；最后同步正文里的旧表号引用。
# 前置：报告须为提交版（git checkout HEAD -- docs/report/…md）
# 用法： powershell -File .\slim-tables.ps1

$ErrorActionPreference = 'Stop'
$f = 'E:\作业3\zhishi-campus\docs\report\实验3-软件架构与界面设计.md'
$asm = 'E:\作业3\zhishi-campus\tools\slim-tables'
$src = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$origTables = ($src | Where-Object { $_ -match '^表[34]-\d' }).Count

function Frag([string]$name) { ([System.IO.File]::ReadAllText((Join-Path $asm $name), [System.Text.Encoding]::UTF8)).TrimEnd("`r", "`n") -split "`n" }

# 旧表题前缀 → 新内容（@DROP@ = 删除该表块）
$plan = [ordered]@{
    '表3-1A'            = (Frag 't3-01-需求设计对应表.md')            # 合并 3-1A/3-1B/3-1C → 表3-1
    '表3-1B'            = '@DROP@'
    '表3-1C'            = '@DROP@'
    '表3-1D'            = (Frag 't3-02-程序与AI分工.md')        # → 表3-2
    '表3-2 技术选型比较表' = (Frag 't3-03-技术选型与关键依赖.md')   # 技术选型 + 关键依赖 → 表3-3
    '表3-2B'            = '@DROP@'
    '表3-3A'            = (Frag 't3-04-模块划分与职责.md')            # 三张模块表 → 表3-4
    '表3-3B'            = '@DROP@'
    '表3-3C'            = '@DROP@'
    '表3-4 用户—普通程序—模型—工具职责划分表' = (Frag 't3-05-职责划分表.md')   # → 表3-4
    '表3-5'             = (Frag 't3-06-数据对象摘要.md')            # 数据对象 → 表3-5
    '表3-6 主要接口一览'   = (Frag 't3-07-接口一览.md')           # → 表3-6
    '表3-6 的关键约束'     = (Frag 'if-constraints.md')
    '表3-7'             = (Frag 'call-normal.md')      # 示例 → 加粗小标题
    '表3-8'             = (Frag 'call-error.md')
    '表3-9'             = (Frag 'flow-summary.md')     # 纯清单 → 一行配色约定
    '表3-10'            = (Frag 't3-08-原型元素自查.md')         # → 表3-7
    '表3-11'            = (Frag 't3-09-一致性检查记录.md')         # → 表3-8
    '表3-12'            = (Frag 't3-10-设计文件清单.md')         # → 表3-9
    '表3-13'            = (Frag 't3-11-仓库提交记录.md')         # 提交记录 → 表3-11
    '表4-1'             = (Frag 't4-01-提交前核对清单.md')
}

$out = New-Object System.Collections.Generic.List[string]
$i = 0
$handled = 0
while ($i -lt $src.Count) {
    $line = $src[$i]
    if ($line -match '^表[34]-\d') {
        $key = $null
        foreach ($k in $plan.Keys) {
            if ($line.StartsWith($k)) { if ($null -eq $key -or $k.Length -gt $key.Length) { $key = $k } }
        }
        $j = $i + 1
        while ($j -lt $src.Count -and $src[$j].Trim() -eq '') { $j++ }
        $k2 = $j
        while ($k2 -lt $src.Count -and $src[$k2].StartsWith('|')) { $k2++ }
        if ($key) {
            $handled++
            if ($plan[$key] -ne '@DROP@') { foreach ($l in $plan[$key]) { $out.Add($l) } }
            $i = $k2
            continue
        }
    }
    $out.Add($line)
    $i++
}

$t = ($out -join "`n")

# ── 正文旧引用同步 ──
$refs = @(
    @('表3-1B 每一行', '表3-1 每一行'),
    @('表3-1C US-06 行', '表3-1 的 US-06 行'),
    @('（表3-1B 反向追踪段）', '（表3-1 的反向追踪说明）'),
    @('表3-1B 全部编号取自实验2', '表3-1 全部编号取自实验2'),
    @('按表3-1B 逐行复核', '按表3-1 逐行复核'),
    @('表3-1A 七个步骤全部有页面、模块、数据与验收对应', '表3-1 的七个流程步骤全部有页面、模块、数据与验收对应'),
    @('（表3-1A、图3-5）', '（表3-1、图3-5）'),
    @('（表3-3A/3-3B/3-3C、表3-4）', '（表3-4）'),
    @('（表3-5/3-6 与 IF-01—IF-08、调用示例）', '（表3-5、表3-6 与 IF-01—IF-08、调用示例）'),
    @('检查对象 | 表3-1A/3-1B/3-1C、表3-2、ADR-001—009、图3-1—图3-10、图3-3 数据模型、IF-01—IF-08、图3-5—图3-10 界面原型 |', '检查对象 | 表3-1—表3-9、图3-1—图3-10、ADR-001—009、IF-01—IF-08 |'),
    @('（表3-11 与检查依据）', '（表3-8 与检查依据）'),
    @('（表3-11 的 D8）', '（表3-8 的 D8）'),
    @('已全部调整（表3-11）', '已全部调整（表3-8）'),
    @('（表3-13 逐条列出）', '（见 3.6.4 的提交清单）'),
    @('逐条列在表3-13', '逐条列在 3.6.4 的提交清单'),
    @('提交短哈希见表3-13。', '提交短哈希见 3.6.4 的提交清单。'),
    @('已完成 8 次设计内容提交（表3-11）', '已完成 8 次设计内容提交'),
    @('（表3-2、ADR-001—009 与替代方案）', '（表3-2、表3-3 与 ADR-001—009）'),
    @('（表3-3、表3-4、表3-5 与 IF-01—IF-08）', '（表3-3—表3-6 与 IF-01—IF-08）'),
    @('**A1—A3** 为 AI 接入与降级模块（分工见表3-2，职责见表3-3）', '**A1—A3** 为 AI 接入与降级模块（职责见表3-4）'),
    @('图3-10 的降级路径', '图3-4 的降级路径'),
    @('（表3-8 原型元素与状态覆盖自查表）', '（表3-7 原型元素与状态覆盖自查表）'),
    @('表3-1A/3-1B/3-1C 的完整版', '表3-1 的完整版'),
    @('表3-3A/3-3B/3-3C、表3-4', '表3-4、表3-5'),
    @('表3-6/3-6 与 IF-01—IF-08、调用示例', '表3-6、表3-7 与 IF-01—IF-08、调用示例'),
    @('表3-11 与检查依据', '表3-9 与检查依据'),
    @('表3-1B 每一行', '表3-1 每一行'),
    @('已完成 8 次设计内容提交（表3-11）', '已完成 8 次设计内容提交（表3-11）')
)
foreach ($r in $refs) { $t = $t.Replace($r[0], $r[1]) }

# ── 旧“职责划分表”整块删除后，插入为新的 表… 位置：改用 3.3.4 的正文段落引用（见下）
# ── 删除 3.1.2 重复小节（内容已并入 3.1.1） ──
$ls = $t -split "`n"
$idx = -1
for ($i2 = 0; $i2 -lt $ls.Count; $i2++) { if ($ls[$i2] -match '^#### 3\.1\.2 ') { $idx = $i2; break } }
if ($idx -ge 0) { $ls = @($ls[0..($idx - 1)]) + @($ls[($idx + 1)..($ls.Count - 1)]) }
$t = ($ls -join "`n")

# ── 去重配色说明（保留 3.5 一处） ──
$dup = '**数据状态条（C2）的配色约定**：绿 = 实时 AI 结果或已确认（正常）；灰 = 本地规则结果（正常，非错误）；橙 = 规则降级或数据不足（需说明原因）；红 = 强制确认或错误（必须处理）。'
$first = $t.IndexOf($dup)
if ($first -ge 0) {
    $second = $t.IndexOf($dup, $first + 1)
    if ($second -ge 0) { $t = $t.Remove($second, $dup.Length) }
}

$t = [regex]::Replace($t, '(\r?\n){3,}', "`n`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($true)))

$caps = ([System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8) | Where-Object { $_ -match '^表[34]-\d' }) | ForEach-Object { ($_ -split ' ')[0] }
"替换的表块数: $handled"
"表标题顺序: " + ($caps -join ', ')
$d = $caps | Group-Object | Where-Object { $_.Count -gt 1 }
if ($d) { "⚠ 重复表号: " + (($d | ForEach-Object { $_.Name }) -join ', ') } else { "无重复表号 ✓" }
"表数量: $origTables → $($caps.Count)"
