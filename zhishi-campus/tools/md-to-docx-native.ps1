# Markdown → .docx（纯脚本手写 OOXML，不依赖 Word / COM / 浏览器）
# 特点：图片真正嵌入 docx 包内（word/media），不依赖任何路径；16 个表格转为 Word 原生表格。
# 用法： & '.\md-to-docx-native.ps1'

param(
    [string]$MdPath  = 'E:\作业2\实验2-个人软件选题与需求分析(3).md',
    [string]$OutDocx = 'E:\作业2\实验2-个人软件选题与需求分析.docx'
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$lines = [System.IO.File]::ReadAllLines($MdPath, [System.Text.Encoding]::UTF8)
$mdDir = Split-Path $MdPath

function X([string]$s) {
    if ($null -eq $s) { return '' }
    $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;')
}

# 单段文本 → 若干 run（支持 **粗体**、`代码`、[文本](链接)）
$script:rid = 100
function Runs([string]$text, [int]$sz = 21) {
    $pattern = '(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))'
    $tokens = [regex]::Split($text, $pattern) | Where-Object { $_ -ne '' }
    $xml = ''
    foreach ($t in $tokens) {
        if ($t -match '^\*\*(.+)\*\*$') {
            $xml += "<w:r><w:rPr><w:b/><w:sz w:val=""$sz""/><w:szCs w:val=""$sz""/></w:rPr><w:t xml:space=""preserve"">" + (X $Matches[1]) + '</w:t></w:r>'
        } elseif ($t -match '^`(.+)`$') {
            $xml += "<w:r><w:rPr><w:rFonts w:ascii=""Consolas"" w:hAnsi=""Consolas""/><w:sz w:val=""18""/><w:szCs w:val=""18""/></w:rPr><w:t xml:space=""preserve"">" + (X $Matches[1]) + '</w:t></w:r>'
        } elseif ($t -match '^\[([^\]]+)\]\(([^\)]+)\)$') {
            $label = $Matches[1] + '（' + $Matches[2] + '）'
            $xml += "<w:r><w:rPr><w:sz w:val=""$sz""/><w:szCs w:val=""$sz""/></w:rPr><w:t xml:space=""preserve"">" + (X $label) + '</w:t></w:r>'
        } else {
            $xml += "<w:r><w:rPr><w:sz w:val=""$sz""/><w:szCs w:val=""$sz""/></w:rPr><w:t xml:space=""preserve"">" + (X $t) + '</w:t></w:r>'
        }
    }
    return $xml
}

function Para([string]$text, [string]$style = '', [int]$indent = 0, [string]$color = '', [bool]$leftBar = $false) {
    $pr = ''
    if ($style) { $pr += "<w:pStyle w:val=""$style""/>" }
    # CT_PPr 元素顺序：pStyle → pBdr → spacing → ind → jc
    if ($leftBar) { $pr += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="BFBFBF"/></w:pBdr>' }
    if ($indent -gt 0) { $pr += "<w:ind w:left=""$indent""/>" }
    $sz = if ($style -eq 'TableText') { 16 } else { 21 }
    $runs = Runs $text $sz
    if ($color -ne '') {
        # 插在 rFonts 之后，保持 rPr 元素顺序：rFonts → b → color → sz
        $runs = [regex]::Replace($runs, '<w:rPr>(<w:rFonts[^>]*/>)?', ('<w:rPr>$1<w:color w:val="' + $color + '"/>'))
    }
    $ppr = if ($pr) { "<w:pPr>$pr</w:pPr>" } else { '' }
    return "<w:p>$ppr$runs</w:p>"
}

function Table([string[][]]$rows) {
    $ncol = 0
    foreach ($r in $rows) { if ($r.Count -gt $ncol) { $ncol = $r.Count } }
    $w = [int](9638 / $ncol)
    $xml = '<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>'
    foreach ($side in 'top','left','bottom','right','insideH','insideV') {
        $xml += "<w:$side w:val=""single"" w:sz=""6"" w:space=""0"" w:color=""808080""/>"
    }
    $xml += '</w:tblBorders></w:tblPr><w:tblGrid>'
    for ($c = 0; $c -lt $ncol; $c++) { $xml += "<w:gridCol w:w=""$w""/>" }
    $xml += '</w:tblGrid>'
    for ($r = 0; $r -lt $rows.Count; $r++) {
        $xml += '<w:tr>'
        for ($c = 0; $c -lt $ncol; $c++) {
            $cell = if ($c -lt $rows[$r].Count) { $rows[$r][$c] } else { '' }
            $shade = if ($r -eq 0) { '<w:shd w:val="clear" w:color="auto" w:fill="EEF4FF"/>' } else { '' }
            $bold = if ($r -eq 0) { "<w:b/>" } else { '' }
            $txt = [regex]::Replace($cell, '\*\*(.+?)\*\*', '$1')
            $runs = Runs $txt 16
            if ($bold) { $runs = $runs.Replace('<w:rPr>', "<w:rPr>$bold") }
            $xml += "<w:tc><w:tcPr><w:tcW w:w=""$w"" w:type=""dxa""/>$shade<w:vAlign w:val=""top""/></w:tcPr><w:p><w:pPr><w:spacing w:before=""20"" w:after=""20""/></w:pPr>$runs</w:p></w:tc>"
        }
        $xml += '</w:tr>'
    }
    $xml += '</w:tbl>'
    return $xml + '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>'
}

# 图片（内联，宽度按正文宽度 17cm 缩放）
function ImageXml([string]$file, [int]$cx, [int]$cy, [int]$id) {
    $rid = 'rId' + $script:rid
    $script:rid++
    $script:media += ,@($file, $rid)
    $name = [System.IO.Path]::GetFileName($file)
    $xml = "<w:p><w:pPr><w:jc w:val=""center""/></w:pPr><w:r><w:drawing><wp:inline distT=""0"" distB=""0"" distL=""0"" distR=""0"">"
    $xml += "<wp:extent cx=""$cx"" cy=""$cy""/><wp:effectExtent l=""0"" t=""0"" r=""0"" b=""0""/>"
    $xml += "<wp:docPr id=""$id"" name=""Picture$id""/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect=""1""/></wp:cNvGraphicFramePr>"
    $xml += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    $xml += "<pic:nvPicPr><pic:cNvPr id=""$id"" name=""$name""/><pic:cNvPicPr/></pic:nvPicPr>"
    $xml += "<pic:blipFill><a:blip r:embed=""$rid""/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>"
    $xml += "<pic:spPr><a:xfrm><a:off x=""0"" y=""0""/><a:ext cx=""$cx"" cy=""$cy""/></a:xfrm><a:prstGeom prst=""rect""><a:avLst/></a:prstGeom></pic:spPr>"
    $xml += '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    return $xml
}

# ── 正文解析 ─────────────────────────────────────────
$script:media = @()
$body = New-Object System.Text.StringBuilder
$i = 0; $imgId = 1
$EMU_W = 6120000    # 17cm 正文宽（A4 去 2cm 页边距）

while ($i -lt $lines.Count) {
    $l = $lines[$i]
    $t = $l.Trim()

    # 图片
    if ($t -match '^!\[([^\]]*)\]\(([^\)]+)\)$') {
        $src = $Matches[2]
        if ($src -notmatch '^(https?:|data:)') {
            $full = Join-Path $mdDir $src
            if (Test-Path -LiteralPath $full) {
                # 读 PNG 尺寸
                $b = [System.IO.File]::ReadAllBytes($full)
                $pw = [BitConverter]::ToUInt32($b[19..16], 0)
                $ph = [BitConverter]::ToUInt32($b[23..20], 0)
                $cx = $EMU_W
                $cy = [int]($EMU_W * $ph / $pw)
                [void]$body.AppendLine((ImageXml $full $cx $cy $imgId))
                $imgId++
                $i++; continue
            } else {
                [void]$body.AppendLine((Para "[图片缺失：$src]" '' 0 'FF0000')); $i++; continue
            }
        } else {
            [void]$body.AppendLine((Para "[图片已内嵌为 data URI，Word 无法直接显示，请使用本 .docx 中的图片]" '' 0 'FF0000')); $i++; continue
        }
    }

    # 表格
    if ($t.StartsWith('|')) {
        $rows = @()
        while ($i -lt $lines.Count -and $lines[$i].Trim().StartsWith('|')) {
            $row = $lines[$i].Trim()
            if ($row -notmatch '^\|[\s\-\|:]+\|$') {
                $cells = @($row.Trim('|') -split '\|' | ForEach-Object { $_.Trim() })
                $rows += ,$cells
            }
            $i++
        }
        if ($rows.Count -gt 0) { [void]$body.AppendLine((Table $rows)) }
        continue
    }

    # 标题
    if ($t -match '^(#{1,6})\s+(.*)$') {
        $lvl = $Matches[1].Length
        $style = "Heading$lvl"
        [void]$body.AppendLine((Para $Matches[2] $style))
        $i++; continue
    }

    # 分隔线
    if ($t -eq '---') { $i++; continue }

    # 引用块
    if ($t.StartsWith('>')) {
        $q = @()
        while ($i -lt $lines.Count -and $lines[$i].Trim().StartsWith('>')) {
            $q += ($lines[$i].Trim() -replace '^>\s?',''); $i++
        }
        foreach ($ql in $q) {
            if ($ql.Trim() -eq '') { continue }
            [void]$body.AppendLine((Para $ql '' 240 '404040' $true))
        }
        continue
    }

    # 列表
    if ($t -match '^(\s*)([-*]|\d+\.)\s+(.*)$') {
        $baseIndent = $Matches[1].Length
        while ($i -lt $lines.Count) {
            $cur = $lines[$i]
            if ($cur.Trim() -eq '') { break }
            if ($cur.Trim() -notmatch '^(\s*)([-*]|\d+\.)\s+(.*)$') { break }
            $ind = $Matches[1].Length
            $isNum = $Matches[2] -match '^\d+\.$'
            $txt = $Matches[3]
            $mark = if ($isNum) { $Matches[2] + ' ' } else { '• ' }
            $pStyle = 'ListParagraph'
            [void]$body.AppendLine((Para ($mark + $txt) $pStyle (480 + 240 * [int]($ind / 2))))
            $i++
        }
        continue
    }

    # 空行
    if ($t -eq '') { $i++; continue }

    # 普通段落
    [void]$body.AppendLine((Para $t))
    $i++
}

# ── 组装 docx ────────────────────────────────────────
$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
$($body.ToString())
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>
"@

$rels = New-Object System.Text.StringBuilder
[void]$rels.AppendLine('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$rels.AppendLine('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">')
[void]$rels.AppendLine('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')
$mediaList = @()
$mi = 1
foreach ($m in $script:media) {
    $parts = $m[0] -split '\\'
    $partName = 'media/image' + $mi + [System.IO.Path]::GetExtension($m[0])
    [void]$rels.AppendLine("<Relationship Id=""$($m[1])"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"" Target=""$partName""/>")
    $mediaList += ,@($m[0], "word/$partName")
    $mi++
}
[void]$rels.AppendLine('</Relationships>')

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="60"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
</w:styles>
'@

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="svg" ContentType="image/svg+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'@

$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

if (Test-Path -LiteralPath $OutDocx) { Remove-Item -LiteralPath $OutDocx -Force }
$fs = [System.IO.File]::Open($OutDocx, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function AddEntry($zip, [string]$name, [string]$content) {
    $e = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $s = $e.Open()
    $bytes = $utf8.GetBytes($content)
    $s.Write($bytes, 0, $bytes.Length)
    $s.Dispose()
}
function AddBinary($zip, [string]$name, [string]$path) {
    $e = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $s = $e.Open()
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $s.Write($bytes, 0, $bytes.Length)
    $s.Dispose()
}

AddEntry $zip '[Content_Types].xml' $contentTypes
AddEntry $zip '_rels/.rels' $rootRels
AddEntry $zip 'word/document.xml' $documentXml
AddEntry $zip 'word/styles.xml' $stylesXml
AddEntry $zip 'word/_rels/document.xml.rels' $rels.ToString()
foreach ($m in $mediaList) { AddBinary $zip $m[1] $m[0] }
$zip.Dispose(); $fs.Dispose()

"已生成: $OutDocx ($([math]::Round((Get-Item -LiteralPath $OutDocx).Length/1KB,1)) KB)"
"嵌入图片: $($mediaList.Count) 张"
foreach ($m in $mediaList) { "  $($m[1])  <=  $($m[0])" }
