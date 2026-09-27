# 把两张 PNG 以 base64 内嵌进交付版报告（单文件自包含）
$p   = 'E:\作业2\实验2-个人软件选题与需求分析(3).md'
$dir = 'E:\作业2'
$imgs = @('图3-1-核心用户流程图.png', '图B-1-用例图.png')

$txt = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
"原文件大小: $([math]::Round((Get-Item $p).Length/1KB,1)) KB"

foreach ($img in $imgs) {
    $full = Join-Path $dir $img
    if (-not (Test-Path -LiteralPath $full)) { throw "缺少图片: $full" }
    $old = "]($img)"
    $n = ([regex]::Matches($txt, [regex]::Escape($old))).Count
    if ($n -ne 1) { throw "引用数异常（$n 处）: $old" }
    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($full))
    $txt = $txt.Replace($old, "](data:image/png;base64,$b64)")
    "已内嵌: $img  (base64 $([math]::Round($b64.Length/1KB,1)) KB)"
}

[System.IO.File]::WriteAllText($p, $txt, (New-Object System.Text.UTF8Encoding($false)))
"写入完成，新文件大小: $([math]::Round((Get-Item $p).Length/1KB,1)) KB"

# ── 校验：把 base64 解回来，检查 PNG 签名与尺寸 ──
$check = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
$ms = [regex]::Matches($check, '\(data:image/png;base64,([A-Za-z0-9\+/=]+)\)')
$leftover = ([regex]::Matches($check, '\]\(图[^\)]*\.png\)')).Count
"内嵌图片数: $($ms.Count)   残留文件名引用: $leftover"
foreach ($m in $ms) {
    $bytes = [Convert]::FromBase64String($m.Groups[1].Value)
    $sig = ($bytes[0..7] | ForEach-Object { $_.ToString('X2') }) -join ' '
    $w = [BitConverter]::ToUInt32(($bytes[19..16]), 0)
    $h = [BitConverter]::ToUInt32(($bytes[23..20]), 0)
    "  解码 OK: $([math]::Round($bytes.Length/1KB,1)) KB, 签名 $sig, 尺寸 ${w}x${h}"
}
