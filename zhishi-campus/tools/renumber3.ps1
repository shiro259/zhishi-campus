# 表号重排：按表题在正文中出现的顺序编号（表3-1、表3-2 …；第4部分单独编号为 表4-n）
# 先全部替换为占位符，再落成最终编号，避免连锁覆盖。
# 用法： powershell -File .\renumber3.ps1

$ErrorActionPreference = 'Stop'
$f = 'E:\作业3\zhishi-campus\docs\report\实验3-软件架构与界面设计.md'
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)

# 先修正一处内容：3.3 的模块划分表应为 表3-4（写作时误标为 表3-3）
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith('表3-3 模块划分与职责')) { $lines[$i] = $lines[$i].Replace('表3-3 模块划分与职责', '表3-4 模块划分与职责') }
}
$text = ($lines -join "`n")

$map = @{}      # 旧编号 -> 占位符
$part4 = @{}    # 占位符 -> 是否第4部分
$n = 0
$inPart4 = $false
$lines = $text -split "`n"
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^## 4\. 实验小结') { $inPart4 = $true }
    if ($lines[$i] -match '^表([34])-(\d+)([A-D]?)\s+(.*)$') {
        $n++
        $old = '表' + $Matches[1] + '-' + $Matches[2] + $Matches[3]
        $ph = "@@T$n@@"
        if (-not $map.ContainsKey($old)) { $map[$old] = $ph }
        $lines[$i] = $ph + ' ' + $Matches[4]
        $part4[$ph] = $inPart4
    }
}
$text = ($lines -join "`n")

# 引用同步：先按旧号做一次特例修正（职责划分表由 表3-4 变 表3-5 等），再统一替换
$text = $text.Replace('职责见表3-4）', '职责见表3-5）').Replace('见表3-4、图3-3', '见表3-6、图3-3')

foreach ($old in ($map.Keys | Sort-Object { $_.Length } -Descending)) {
    $text = $text.Replace($old, $map[$old])
}

# 占位符 → 最终编号（按出现序号；第4部分单独序列）
$finalOf = @{}
$c3 = 0; $c4 = 0
foreach ($ph in ($part4.Keys | Sort-Object { [int]($_ -replace '\D','') })) {
    if ($part4[$ph]) { $c4++; $finalOf[$ph] = "表4-$c4" } else { $c3++; $finalOf[$ph] = "表3-$c3" }
}
$text = [regex]::Replace($text, '@@T(\d+)@@', { param($m) $finalOf[$m.Value] })

[System.IO.File]::WriteAllText($f, $text, (New-Object System.Text.UTF8Encoding($true)))
$caps = ([System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8) | Where-Object { $_ -match '^表[34]-\d' }) | ForEach-Object { ($_ -split ' ')[0] }
"表标题顺序: " + ($caps -join ', ')
$d = $caps | Group-Object | Where-Object { $_.Count -gt 1 }
if ($d) { "⚠ 重复: " + (($d | ForEach-Object { $_.Name }) -join ', ') } else { "无重复 ✓" }
