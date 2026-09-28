# 接口说明书（实验3 · 3.4 节 · 表3-7 的完整版）

本项目的接口分两类：**①对外网络接口**（只有 1 个，经自建云函数代理调用模型服务）；**②本地函数接口**（模块之间的调用，不涉及序列化，列出用于界定模块边界与失败行为）。

---

## 一、对外接口 IF-01：`POST /recommend`

| 项目 | 说明 |
| --- | --- |
| 编号 | IF-01 |
| 名称 | recommend（获取 Top3 推荐） |
| 提供方 | 自建云函数 `cloud/recommend`（内部再调用 LLM 服务；本项目只维护这一层，业务代码不直接接触第三方 API 与密钥） |
| 调用方 | 业务层 M3 推荐编排（`domain/recommender.js`）；界面层不得直接调用 |
| 用途 | 在用户当次给定的候选菜品集合内，挑选恰好 3 道推荐，并为每道菜生成一句面向用户的理由 |
| 协议 | HTTPS + JSON；小程序后台需把云函数域名加入请求白名单 |
| 鉴权 | 由云函数持有服务商密钥，前端不持有任何密钥 |
| 超时 / 重试 | 客户端 5 秒超时（NFR-01），最多重试 1 次；仍失败即采用本地规则基线 |
| 幂等性 | 幂等（同一 `profileId + menuId + weightsVersion` 的结果写入缓存，24 小时内不再请求） |
| 输入大小 | 约 1k tokens（候选 20 道以内 + 画像摘要），用于控制费用（NFR-12） |

### 输入（请求体）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| dishes | array | 是 | 候选菜品，来自当日菜单（M2）；元素见下 |
| dishes[].dishId | string | 是 | 集合内唯一 |
| dishes[].name | string | 是 | 菜品名，自然语言 |
| dishes[].price | number \| null | 否 | 元；缺失时置 null |
| dishes[].ingredients | string[] \| null | 否 | 人工补充的配料；null 表示未知（S6） |
| dishes[].allergenTags | string[] | 否 | 可能含有的成分标注 |
| dishes[].tasteTags | string[] | 否 | 辣 / 清淡 / 油 等标签 |
| profileSummary | object | 是 | **画像摘要，不含忌口清单全文**（NFR-05） |
| profileSummary.tasteTags | string[] | 是 | 口味标签 |
| profileSummary.healthGoal | enum | 是 | 减脂 / 均衡 / 增肌 / 无 |
| profileSummary.budget | {min,max} | 否 | 预算区间 |
| profileSummary.avoidCount | number | 是 | 忌口项**数量**（仅用于让模型保守排序，不传具体成分） |
| profileSummary.recentNegativeTasteTags | string[] | 否 | 近期负反馈的口味标签（用于避雷） |
| topN | number | 是 | 固定为 3（R4） |

### 输出（成功响应 HTTP 200）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| items | array(1—3) | 推荐项；候选 ≥3 时必须为 3 条 |
| items[].dishId | string | 必须来自请求的 `dishes`，否则视为不合法输出 |
| items[].score | number | 0—1 的推荐分 |
| items[].reason | string | 一句话理由，面向用户，无技术术语（NFR-10） |
| items[].riskTags | string[] | 可能含有的风险食材，只描述"可能含有" |
| items[].noveltyHint | bool | 是否为"近 7 天未点过"的菜品（US-06），供界面加标签，缺失时按 false 处理 |
| engine | enum | `ai` |
| degraded | bool | `false` |
| partial | bool | 候选不足 3 道时为 `true` |
| latencyMs | number | 云函数侧耗时 |

### 输出（失败响应）

| 场景 | HTTP | 错误码 | 客户端行为 |
| --- | --- | --- | --- |
| 模型超时（>5 秒无响应） | — | 客户端超时 | 采用规则基线；C2 显示"AI 暂不可用，以下为按口味标签排序的结果" |
| 服务商限流 / 余额不足 | 429 | `RATE_LIMIT` | 同上；A3 累计失败次数，连续 3 次转"长期降级模式" |
| 云函数报错 | 500 | `UPSTREAM_ERROR` | 同上 |
| 输出不合规（字段缺失 / 菜名越界 / 含确定性安全表述） | 200 | 客户端判定 `SCHEMA_INVALID` | 丢弃本次 AI 结果，保留规则基线；记录一条本地日志（不含用户数据） |
| 请求体过大 | 413 | `PAYLOAD_TOO_LARGE` | 按预算与口味匹配度取前 20 道重新请求，并在数据状态条（C2）提示"本次仅对前 20 道排序"，不静默截断 |

**统一约定**：任何失败都不向用户抛出技术信息，界面只呈现可理解的说明与下一步（"换一批""稍后再试"）。

---

## 二、本地函数接口（模块边界）

| 编号 | 签名 | 提供方 | 调用方 | 失败行为 |
| --- | --- | --- | --- | --- |
| IF-02 | `parseMenus(rawText) → {dishes[], parseStatus, failedLines[]}` | M2 | P2 | 解析失败返回 `failedLines`，提示手动添加；绝不编造菜名 |
| IF-03 | `rank(profile, dishes, weights) → Recommendation` | M4 | M3 / P3（AI 不可用时） | 无外部依赖，不会失败；数据缺失菜品按保守规则降权 |
| IF-04 | `check(dish, avoidList) → {hit, hint, allowRecord}` | M5 | M3 / P3 | 信息缺失时返回"配料未知，请现场核对" |
| IF-05 | `validate(aiOutput) → {ok, violations[]}` | A2 | M3 | 不抛异常，返回违规清单供 M3 决定是否丢弃结果 |
| IF-06 | `recommend(profileId, menuId) → Recommendation` | M3 | P3 | 菜单为空 → 返回空态标记，不发起网络请求；AI 失败 → 返回规则基线 |
| IF-07 | `submitFeedback(feedback) → {weightsVersion}` | M6 | P4 | 无对应记录 → 返回错误码，界面引导先记录 |
| IF-08 | `clearAll() → {ok}` | M1/D4 | P5 | 失败即回滚并返回错误，界面提示"清空未完成，请重试" |

---

## 三、接口与需求的对应

| 接口 | 支撑的需求 | 验收方法 |
| --- | --- | --- |
| IF-01 | FR-04、FR-05、NFR-01、NFR-03、NFR-06、NFR-12 | V1（正常）、V2（信息不足）、V3（人工确认）、V4（降级） |
| IF-02 | FR-02、FR-03 | V2（不得出现未提供的菜名）、NFR-02 |
| IF-03 | NFR-03（降级路径） | V4 对比两次请求结果 |
| IF-04 | FR-05、NFR-06 | V3（未确认不可记录） |
| IF-05 | NFR-06 | 30 组回归用例硬门槛（确定性表述数 = 0） |
| IF-06 | FR-04 | V1、NFR-01 |
| IF-07 | FR-07 | V5 |
| IF-08 | FR-08、NFR-07 | UC-08 功能测试 |
