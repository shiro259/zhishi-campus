# 校验生成的 .docx：①XML 是否格式良好（Word 能否打开）②表格/图片/段落计数 ③是否残留未转换的 Markdown 标记
# 用法： powershell -File .\check-docx.ps1 -DocxPath '...docx'

param(
    [string]$DocxPath = 'E:\作业3\软工一班 24111302054 陈康旭 实验3-软件架构与界面设计.docx'
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $DocxPath)) { "文件不存在: $DocxPath"; exit 1 }

$zip = [System.IO.Compression.ZipFile]::OpenRead($DocxPath)
$names = $zip.Entries | ForEach-Object { $_.FullName }
"包内条目: $($names.Count)"
foreach ($n in $names) { "  $n" }

# XML 格式良好性检查
$ok = $true
foreach ($n in $names | Where-Object { $_ -like '*.xml' -or $_ -like '*.rels' }) {
    $e = $zip.GetEntry($n)
    $sr = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
    $xml = $sr.ReadToEnd(); $sr.Dispose()
    try { [void][xml]$xml; "  [XML OK] $n ($($xml.Length) 字符)" }
    catch { $ok = $false; "  [XML 失败] $n -> $($_.Exception.Message)" }
}

$e = $zip.GetEntry('word/document.xml')
$sr = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
$doc = $sr.ReadToEnd(); $sr.Dispose()
$zip.Dispose()

$tbl   = ([regex]::Matches($doc, '<w:tbl>')).Count
$draw  = ([regex]::Matches($doc, '<w:drawing>')).Count
$para  = ([regex]::Matches($doc, '<w:p>|<w:p ')).Count
$blip  = ([regex]::Matches($doc, 'r:embed="rId')).Count
"表格数: $tbl"
"图片数(内联 drawing): $draw / blip 引用: $blip"
"段落数: $para"

# 残留 Markdown 标记
$leftover = @('**', '](', '<!--', '```', '| ---')
foreach ($m in $leftover) {
    $c = ([regex]::Matches($doc, [regex]::Escape($m))).Count
    if ($c -gt 0) { "残留标记 '$m' : $c 处" }
}
"XML 全部格式良好: $ok"
