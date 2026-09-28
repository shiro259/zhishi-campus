# 数据模型与接口设计（实验3 · 3.4 节完整版）

对应图3-3 数据模型类图。

## 一、数据对象（类 / 实体）

### 1. UserProfile 用户画像
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| profileId | string | 本地生成（时间戳+随机），唯一 | 本地 | 否 |
| tasteTags | string[] | 取值来自标签词表（微辣/清淡/重口/喜酸…），可多选 | 本地 | 否 |
| avoidList | string[] | 忌口/过敏清单，可为空（保存时二次提示）；只用于本地匹配 | 本地 | **是** |
| healthGoal | enum | 减脂 / 均衡 / 增肌 / 无 | 本地 | 否 |
| budget | {min,max} | 单位为元，min ≤ max | 本地 | 否 |
| updatedAt | datetime | 自动写入 | 本地 | 否 |

### 2. MenuDay 当日菜单（按窗口）
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| menuId | string | `date + canteen + window` 派生，唯一 | 本地 | 否 |
| date | date | 唯一性键的一部分；只保留最近 30 天 | 本地 | 否 |
| canteen / windowName | string | 非空 | 本地 | 否 |
| source | enum | 公示文本 / 手动录入 / 复用上周 | 本地 | 否 |
| rawText | string | 原始粘贴文本，用于追溯解析错误 | 本地 | 否 |
| parseStatus | enum | 成功 / 部分成功 / 失败 | 本地 | 否 |
| createdAt | datetime | 自动写入 | 本地 | 否 |

### 3. Dish 菜品
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| dishId | string | 菜单内唯一 | 本地（随 MenuDay） | 否 |
| menuId | string | 外键 → MenuDay | 本地 | 否 |
| name | string | 非空；来自公示文本或人工输入 | 本地 | 否 |
| price | number | ≥ 0；解析不到时置 null 并提示补充 | 本地 | 否 |
| ingredients | string[] \| null | 人工补充；为 null 时禁止推断 | 本地 | 否 |
| allergenTags | string[] | "可能含有"的标注，用于提示，**不作为安全结论** | 本地 | **是**（与健康相关） |
| tasteTags | string[] | 辣 / 清淡 / 油 / 甜… | 本地 | 否 |
| infoComplete | bool | ingredients 为空即 false（对应场景 S6） | 本地 | 否 |
| manualFixed | bool | 是否被人工修正过，用于评估解析质量 | 本地 | 否 |

### 4. Recommendation 推荐结果
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| recId | string | 唯一 | 本地缓存 | 否 |
| profileId / menuId | string | 外键 | 本地缓存 | 否 |
| weightsVersion | number | 缓存 key 的一部分，反馈后 +1 | 本地缓存 | 否 |
| items | array[1..3] | 每项 `{dishId, score(0—1), reason(一句话), riskTags[], noveltyHint(bool)}`；候选 ≥3 时**长度恰为 3**，候选不足时按实际条数并置 `partial:true` | 本地缓存 | 否 |
| engine | enum | AI / 规则 | 本地缓存 | 否 |
| degraded | bool | 是否降级产出 | 本地缓存 | 否 |
| latencyMs | number | 用于 NFR-01 记录 | 本地缓存 | 否 |
| createdAt | datetime | TTL 24 小时的起点 | 本地缓存 | 否 |

### 5. MealRecord 就餐记录
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| recordId | string | 唯一 | 本地 | 否 |
| profileId / dishId | string | 外键 | 本地 | 否 |
| date | date | **同一天允许多条记录**（按时间排序，午/晚餐各一条）；同菜重复记录时提示"今天已记录，可修改或继续新增" | 本地 | 否 |
| source | enum | 推荐 / 手动 | 本地 | 否 |
| riskConfirmedAt | datetime \| null | 命中忌口时的确认时间戳，**留痕用** | 本地 | **是** |

### 6. Feedback 就餐反馈
| 字段 | 类型 | 约束 | 保存 | 敏感 |
| --- | --- | --- | --- | --- |
| feedbackId | string | 唯一 | 本地 | 否 |
| recordId | string | 外键，**一条记录至多一条反馈** | 本地 | 否 |
| result | enum | 符合 / 不符合 | 本地 | 否 |
| reason | string \| null | 太辣 / 太油 / 分量少 / 其他 | 本地 | 否 |
| weightDelta | {tasteTag, delta} | 负反馈下调同类口味权重 | 本地 | 否 |
| createdAt | datetime | 自动写入 | 本地 | 否 |

## 二、关系（ER 视角）

```
UserProfile 1 ──< Recommendation      （一个画像多次推荐）
UserProfile 1 ──< MealRecord          （一个画像多条记录）
MenuDay     1 ──< Dish                （一个菜单日多道菜）
Recommendation >── Dish               （推荐结果引用菜品 N:N）
Dish        1 ──< MealRecord          （记录引用菜品）
MealRecord  1 ──0..1 Feedback         （一条记录至多一条反馈）
```

**外键约束**：所有外键均为**逻辑外键**（本地 JSON 存储，不做数据库级联），删除菜单或清空数据时由 D4 的事务统一处理，避免出现指向已删对象的悬空引用。

## 三、敏感数据与保存策略

| 数据 | 敏感等级 | 处理方式 |
| --- | --- | --- |
| avoidList（忌口/过敏清单） | 高 | 仅存本地；上传给模型的画像摘要**不含清单全文**，只用本地做风险匹配 |
| allergenTags / riskConfirmedAt | 中（与健康相关） | 仅存本地；不参与任何统计或上报 |
| 学号、姓名、手机号、位置、照片原图 | — | **完全不采集**（NFR-05）；P5 页面公开声明并可核对 |
| 就餐记录与反馈 | 中 | 仅存本地，只保留最近 30 天；可一键清空 |
| 推荐缓存 | 低 | 本地缓存，TTL 24 小时，可随时清除 |

## 四、接口设计（表3-5 / 表3-6）

### IF-01 recommend（唯一对外接口，经云函数代理）

| 项 | 内容 |
| --- | --- |
| 提供模块 | A1 云函数（内部由 M3 推荐编排调用） |
| 调用方 | M3 `recommend()` |
| 用途 | 在给定候选菜品集合内，为用户挑选 3 道推荐并生成一句话理由 |
| 协议 | HTTPS POST JSON；小程序请求域名需在后台白名单 |
| 超时 / 重试 | 5 秒超时，最多重试 1 次；失败即采用规则基线（ADR-005） |
| 请求体 | `dishes[{dishId,name,price,ingredients?,allergenTags?,tasteTags?}]` + `profileSummary{tasteTags,healthGoal,budget,avoidCount,recentNegativeTasteTags}` + `topN:3` |
| 响应体 | `{items[{dishId,score,reason,riskTags[]}], engine:"ai"|"rule", degraded:bool, latencyMs}` |
| 约束 | ①`dishId` 必须来自请求中的集合；②恰 3 条（候选不足时按实际条数并置 `partial:true`）；③禁止输出"不含/可以吃"等确定性安全结论（NFR-06）；④只输出 JSON，不解释、不加 Markdown |

**接口编号说明**：M3/A2/M4/M5/M6 的方法（`parseMenus()`、`rank()`、`check()`、`submitFeedback()` 等）都是**包内本地函数调用**，不涉及网络与序列化，因此不在接口表中单列，只在其模块设计中给出签名（见 `docs/design/modules.md`）。

### 表3-6 调用示例（正常）

请求：
```json
POST /recommend
{
  "dishes": [
    { "dishId": "d1", "name": "香煎鸡胸饭", "price": 12, "ingredients": ["鸡胸肉","米饭","西兰花"], "tasteTags": ["清淡"] },
    { "dishId": "d2", "name": "宫保鸡丁", "price": 11, "ingredients": null, "allergenTags": ["可能含花生"], "tasteTags": ["辣"] },
    { "dishId": "d3", "name": "清炒时蔬", "price": 5, "ingredients": ["青菜"], "tasteTags": ["清淡"] },
    { "dishId": "d4", "name": "水煮鱼", "price": 15, "ingredients": ["草鱼","辣椒"], "tasteTags": ["辣"] }
  ],
  "profileSummary": { "tasteTags": ["微辣"], "healthGoal": "减脂", "budget": { "min": 8, "max": 15 }, "avoidCount": 1, "recentNegativeTasteTags": ["重辣"] },
  "topN": 3
}
```
响应（HTTP 200）：
```json
{
  "items": [
    { "dishId": "d1", "score": 0.92, "reason": "高蛋白、少油，符合你的减脂目标，在预算内。", "riskTags": [] },
    { "dishId": "d3", "score": 0.81, "reason": "清淡低油，你最近 7 天没有点过这道菜。", "riskTags": [] },
    { "dishId": "d2", "score": 0.66, "reason": "口味与你的偏好接近，但配料信息缺失，建议到窗口确认。", "riskTags": ["可能含有花生"] }
  ],
  "engine": "ai", "degraded": false, "latencyMs": 2380
}
```
程序侧处理：Schema 校验通过 → `RiskGuard.validate()` 未发现确定性表述 → 写缓存（key 含 `weightsVersion`）→ P3 渲染；`d2` 命中忌口 → 记录按钮禁用，弹 C1 确认。

### 表3-6 调用示例（错误：超时 / 超额降级）

请求同上；云函数返回（HTTP 429，或客户端 5 秒超时无响应）：
```json
{ "error": { "code": "RATE_LIMIT", "message": "模型服务繁忙或已超出本月预算" } }
```
程序侧处理：
1. A3 记录失败并更新降级状态（连续 3 次失败 → 关闭 AI）；
2. M3 丢弃 AI 分支，**直接返回第 3 步已算好的规则基线**（无需重新计算）；
3. C2 状态条转橙，文案："AI 暂不可用，以下为按口味标签排序的结果"；
4. 结果结构不变（`engine:"rule"`，`degraded:true`），界面渲染逻辑不分支；
5. 核心流程不中断，记录与反馈仍可正常完成（NFR-03 / V4）。

### IF-02 parseMenus（本地函数，列出以说明数据入口）

| 项 | 内容 |
| --- | --- |
| 提供模块 | M2 菜单服务 |
| 调用方 | P2 菜单维护页 |
| 用途 | 把学生粘贴的公示文本解析成菜品列表 |
| 输入 | `rawText: string`（多行，形如"香煎鸡胸饭 12"） |
| 输出 | `{dishes[], parseStatus, failedLines[]}` |
| 失败处理 | 整体无法识别 → `parseStatus=failed`，提示"未能识别菜品，请逐条手动添加"；单行失败 → 列入 `failedLines`，由用户手动补齐；**任何情况下不生成文本中不存在的菜名**（V2 硬门槛） |
| 性能 | 20 条文本 < 8 秒（NFR-02） |

### IF-03 check（本地函数，安全边界接口）

| 项 | 内容 |
| --- | --- |
| 提供模块 | M5 风险与确认 |
| 调用方 | M3（推荐后标记）、P3（渲染风险行与记录前校验） |
| 输入 | `dish: Dish`，`avoidList: string[]` |
| 输出 | `{ hit: bool, hint: "可能含有 X，请向窗口确认" | null, allowRecord: bool }` |
| 约束 | 输出中**不得**出现"不含/没问题/可以吃"；`allowRecord` 仅在用户完成 C1 确认后变为 true |
| 失败处理 | 数据缺失（`infoComplete=false`）→ 返回 `hint:"配料未知，请现场核对"`，并在 M4 中对该菜降权 |
