# 自检脚本（开发用，不参与小程序打包）

这些脚本只用来在本地验证代码，**不参与 uni-app 编译与小程序的运行**，
放在这里只是为了改完代码能自己先跑一遍，而不是等 HBuilderX 报错。

## 搜索功能回归测试

```bash
node _search/check.mjs
```

它会真跑代码（不是重述逻辑）：

1. **内存假数据库 + 真云函数**：在沙箱里执行
   `uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js` 的 `handleList`，
   验证云端的搜索口径；
2. **真前端兜底**：`import` 真实的 `api/index.js`，走 `localDishList` 本地链路；
3. **两条链路对比**：同一个关键词必须返回**完全相同**的一批菜
   —— 这是「有时候搜不到、有时候搜出错误菜品」的根因；
4. **竞态守卫**：翻页 / 搜索交错时，过期响应必须被丢弃；
5. **边打边搜**：防抖语义（连打两个字只发一次请求）。

无第三方依赖，`node` 直接可跑（Node ≥ 20）。

## 两份菜品数据的一致性体检

```bash
node _search/compare-datasets.mjs
```

项目里存在**两份**菜品数据：

- `common/local-dishes.js` —— 本机菜谱（客户端兜底，`LOCAL_DISHES`）
- `uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js` —— 云端种子（`SEED_DISHES`）

`api/index.js` 的设计约定是「云端种子库与本地同源（由 shiyu-seed 初始化）」，
一旦两者不一致，同一个关键词走云端和走本地就会返回不同的菜 ——
表现为「有时候搜不到、有时候搜到错误菜品」。

这个脚本按菜名逐条比对两份数据（菜名集合、tags、食堂、窗口、分类、价格），
再用一批关键词对比两份数据的命中结果，最后校验 `image` 字段与
`scripts/dish-image-map.json`（菜名 → 图片文件名）是否一致，防止串图。

## 标签体检

```bash
node _search/audit-tags.mjs
```

把常见食材词逐个拿去和菜名、描述做子串匹配，列出「菜名/描述里明明有某个食材，
却没有打对应标签」的菜品。tags 是搜索和忌口硬过滤的数据基础，漏标就会搜不到。

## 菜品数据有**几份**？如何保持同源

项目里同一个菜单存在多份副本，历史上它们各不相同（这正是「同一个词有时搜不到、
有时搜出别的菜」的根源）：

| 位置 | 用途 |
|---|---|
| `uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js` 的 `SEED_DISHES` | **唯一数据源**：写入云端 dishes 集合 |
| `common/local-dishes.js` 的 `LOCAL_DISHES` | 客户端兜底菜谱 |
| `uniCloud-aliyun/cloudfunctions/shiyu-chat/index.js` 的 `FALLBACK_DISHES` | AI 聊天读库失败时的兜底菜谱 |

改菜品数据**只改 `SEED_DISHES`**，然后：

```bash
node _search/sync-datasets.mjs --write   # 同步到另外两份
node _search/compare-datasets.mjs        # 复核是否一致
node _search/check.mjs                   # 回归测试（含同源断言）
```

`sync-datasets.mjs` 不加 `--write` 时只预览，不写文件。
`check.mjs` 的 [H] 组会断言三份数据逐条一致，改歪了会立刻失败。

## 忌口标签体检

```bash
node _search/audit-allergens.mjs
```

只盯 10 个忌口食材词（香菜、葱、蒜、花生、海鲜、牛肉、羊肉、内脏、鸡蛋、牛奶）。
食材只写在**描述**里却没进 `tags` 的，会同时造成两个后果：

- 搜不到（描述不参与搜索）；
- **忌口硬过滤失效**（推荐引擎按 tags 精确匹配），过敏同学可能被推荐到忌口菜。

例：`麻婆豆腐` 的描述是「嫩豆腐配牛肉末」，没有 `牛肉` 标签 → 搜「牛肉」搜不到它，
忌口牛肉的同学也不会被过滤掉。

## SFC 编译检查

```bash
node _search/sfc-own.mjs
```

编译 `pages/` 与 `components/` 下的全部自研 `.vue`，提前发现模板 / 脚本语法错误。
需要 `@vue/compiler-sfc`（`_search/package.json` 已存在，装依赖不会影响根目录的 `package.json`）：

```bash
cd _search
npm install --no-audit --no-fund --cache ./.npmcache @vue/compiler-sfc
```

（`sfc.mjs` 是连 `uni_modules/` 第三方插件一起编译的版本。官方插件用了
`// #ifdef MP-WEIXIN` 这类条件编译注释，裸的 compiler-sfc 解析不了会误报，
所以日常只看 `sfc-own.mjs`。）

⚠️ 装完依赖记得把 `node_modules` 与 `.npmcache` 删掉，别让它们进小程序包。
