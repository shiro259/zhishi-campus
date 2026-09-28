# 表格精简收尾：修正正文里残留的旧表号引用
# 用法： powershell -File .\fix-refs.ps1

$ErrorActionPreference = 'Stop'
$f = 'E:\作业3\zhishi-campus\docs\report\实验3-软件架构与界面设计.md'
$t = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

$reps = @(
    # 表3-4 内部引用：数据对象表已为 表3-6
    @('（见表3-7、图3-3）', '（见表3-6、图3-3）'),
    # 3.6.1 检查对象
    @('| 检查对象 | 表3-1A/3-1B/3-1C、表3-2、ADR-001—009、图3-1—图3-6、图3-3 数据模型、IF-01—IF-08、图3-7—图3-6 界面原型 |', '| 检查对象 | 表3-1—表3-11、图3-1—图3-10、ADR-001—009、IF-01—IF-08 |'),
    # 3.6.4 材料清单中的表号
    @('| 需求与设计对应表 | `docs/design/requirements-traceability.md` | 表3-1A/3-1B/3-1C 的完整版 |', '| 需求与设计对应表 | `docs/design/requirements-traceability.md` | 表3-1 的完整版，含逐条反向追踪 |'),
    @('| ADR 架构决策记录 | `docs/design/adr.md` | 表3-2、ADR-001—009 与替代方案 |', '| ADR 架构决策记录 | `docs/design/adr.md` | 表3-2、表3-3 与 ADR-001—009 |'),
    @('| 模块设计与职责划分 | `docs/design/modules.md` | 表3-3A/3-3B/3-3C、表3-4 |', '| 模块设计与职责划分 | `docs/design/modules.md` | 表3-4、表3-5 |'),
    @('| 数据模型与接口 | `docs/design/data-model.md`、`docs/design/interfaces.md` | 表3-6/3-6 与 IF-01—IF-08、调用示例 |', '| 数据模型与接口 | `docs/design/data-model.md`、`docs/design/interfaces.md` | 表3-6、表3-7 与 IF-01—IF-08、调用示例 |'),
    @('| 设计一致性检查记录 | `docs/design/design-review.md` | 表3-11 与检查依据 |', '| 设计一致性检查记录 | `docs/design/design-review.md` | 表3-9 与检查依据 |'),
    # 第4部分
    @('已全部调整（表3-10）', '已全部调整（表3-9）'),
    @('表3-1—表3-9、表4-1 连续无重号', '表3-1—表3-11、表4-1 连续无重号'),
    @('已完成 8 次设计内容提交（表3-9）', '已完成 8 次设计内容提交（表3-11）')
)
foreach ($r in $reps) { $t = $t.Replace($r[0], $r[1]) }

[System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($true)))

# 校验：所有引用的表号都必须存在
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)
$caps = $lines | Where-Object { $_ -match '^表[34]-\d' } | ForEach-Object { ($_ -split ' ')[0] }
$refs = [regex]::Matches(($lines -join "`n"), '表[34]-\d+') | ForEach-Object { $_.Value } | Sort-Object -Unique
$missing = $refs | Where-Object { $caps -notcontains $_ }
"表标题: " + ($caps -join ', ')
"正文引用: " + ($refs -join ', ')
if ($missing) { "⚠ 引用了不存在的表号: " + ($missing -join ', ') } else { "所有引用均有对应表 ✓" }
