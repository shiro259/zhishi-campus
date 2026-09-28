# 把新生成的 docx 覆盖到最终文件名（当原文件被 Word/资源管理器预览占用时会失败，关闭后重跑即可）
# 用法： powershell -File .\publish-docx.ps1

$repo = 'E:\作业3\zhishi-campus'
$tmp  = 'E:\作业3\.build\实验3.docx'
$final = 'E:\作业3\软工一班 24111302054 陈康旭 实验3-软件架构与界面设计.docx'

& (Join-Path $repo 'tools\build-docx.ps1') -OutDocx $tmp | Select-Object -First 1

try {
    Copy-Item $tmp $final -Force -ErrorAction Stop
    "已更新最终文件: $final"
} catch {
    "⚠ 最终文件被占用，无法覆盖：$($_.Exception.Message)"
    "  处理办法：关闭正在预览/打开该 docx 的窗口（Word、资源管理器预览窗格），然后重新运行本脚本。"
    "  或直接使用新生成的临时文件: $tmp"
}
