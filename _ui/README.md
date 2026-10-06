# 首页 UI 工具（开发用，不参与小程序打包）

## 1. 校食堂 Banner 图处理

```bash
node _ui/banner.mjs
```

把 `首页照片/` 里的原图处理成小程序可用的资源 `static/banner/canteen.jpg`。

必须处理的三件事：

| 问题 | 原因 |
|---|---|
| **位置** | 小程序运行时只能读包内 `static/` 资源（或云存储）。放在项目根目录的 `首页照片/` 里，真机上根本加载不出来。 |
| **体积** | 原图 1672×941 PNG 1.7MB；微信小程序**主包上限 2MB**。Banner 显示尺寸约 375×200pt，压成 1125×600 的 JPEG q82 后约 79KB。 |
| **构图** | Banner 是 1.875:1 的横长条，原图 1.777:1，按 cover 居中裁切，保证右侧食堂场景完整。 |

脚本还会统计左右两半的平均亮度，用来决定橙色蒙版要压多重（实测 192/255，很亮）。

## 2. 首页改造自检

```bash
node _ui/check-home.mjs
```

改 UI 最大的风险不是「不好看」，而是**悄悄弄丢功能**。这个脚本逐项核对：

1. 模板 / 脚本 / 样式能否编译（`@vue/compiler-sfc` + `sass`，模拟 uni.scss 注入 tokens.scss）
2. **页面逻辑没丢**：与 `git HEAD` 版本对比，脚本里的函数 / 变量一个都不能少
3. 模板里的 `@click`、`{{ }}` 用到的标识符都还在，参数没变
4. 需求点名的文案与区块顺序都在
5. `Icon` 用的图标名真实存在（写错就是个空白洞）
6. 不再用 emoji 充当界面图标
7. 设计令牌真的用上了、圆角统一
8. Banner 资源存在、体积达标、自定义导航栏下留了状态栏内边距

依赖：`cd _ui && npm install --no-audit --no-fund --cache ./.npmcache @vue/compiler-sfc sass sharp`
（`_ui/package.json` 已存在，装依赖不会影响根目录的 `package.json`）

## 3. 页面预览图

```bash
node _ui/preview.mjs            # 首页 → _ui/首页预览.png（整页）
node _ui/preview-chat.mjs       # AI 对话页 → _ui/对话页预览.png（欢迎态 + 对话态两屏并排）
node _ui/preview-dish-list.mjs  # 菜单页 → _ui/菜单页预览.png（默认列表 + 筛选/收藏两屏并排）
node _ui/preview-user.mjs       # 个人中心 → _ui/我的页预览.png（主页 + 功能列表/足迹/设置两屏并排）
```

预览图是**按真实数据画出来的**，不是示意图：

- 结构与 class 直接来自页面模板
- 样式直接读该页面的 `<style>` 块，把 `$令牌` 换成 `tokens.scss` 的真实值、`rpx` 换算成 px
- 菜品数据用 `common/local-dishes.js` 的真实菜单，榜单口径与 `api/index.js` 的 `rank()` 一致
- 图片用 `static/dishes/` 下真实的菜品照片；tabBar 图标用 `static/tabbar/` 下真实 PNG
  > ⚠️ 菜品图已迁到云存储，`static/dishes/` 已删除 —— 现在重新渲染预览图，菜品位置会显示 emoji 占位
  > （`DishImage` 的正常回退行为）。想看带照片的效果图，先 `git checkout -- static/dishes` 恢复再渲染。
- 机器人形象取 `components/AiMascot/AiMascot.vue` 里**同一份 SVG**
- 对话页与菜单页会画出 iOS 状态栏、微信原生导航栏与 tabBar ——
  它们在 `pages.json` 里是普通导航栏 + tabBar 页，不画出来就和真机对不上
- 用 Edge 无头模式截图（`--headless=new`，3 倍图）

### 顺带做了文字可读性实测

脚本会渲染两遍（一遍正常、一遍把文字设为 `visibility:hidden`），用差异**定位文字的真实像素范围**，
再回到「无文字」图里量那块区域底下背景的亮度，算出对比度。
并排多屏时必须把寻找差异的范围限定在单块屏幕内，否则屏幕之间的浅色间隙会被当成文字背景。

这一步抓出过真问题，全都是**实测才发现、靠肉眼估算发现不了**的：

| 位置 | 第一版 | 调整后 |
|---|---|---|
| 首页 Banner 白字 | 1.00:1（照片里有一处接近纯白的高光） | **4.79:1** ✓ |
| 对话页英雄区白标题 | 2.88:1（渐变太平，标题落在偏亮的橙上） | **3.24:1** ✓（20pt 粗体，线 3:1） |
| 菜单页 Banner 文字 | 2.48:1（渐变方向反了，文字压在浅段） | **4.86:1** ✓（含两行小字，线 4.5:1） |

> 注意：`preview*.mjs` 里的页面结构是手写复刻的（不是从模板编译出来的），
> 所以改了页面结构要同步改这里。`check-*.mjs` 会比对两边的区块列表，
> 不一致直接报错，避免效果图骗人。

## 4. AI 机器人形象自检

```bash
node _ui/check-mascot.mjs
```

我看不到图，所以用栅格化把「它到底画出来了什么」量化验证：
SVG 能否被标准渲染器解析、图形有没有超出画布被裁掉、覆盖率是否合理、
品牌渐变是否真的生效（不是退化成纯色）、面屏够不够白、五官够不够深、
整体有没有居中。改形象后跑一次即可。

## 5. 页面 / 功能改造自检

```bash
node _ui/check-home.mjs          # 首页
node _ui/check-chat.mjs          # AI 对话页
node _ui/check-dish-list.mjs     # 菜单页
node _ui/check-wechat-login.mjs  # 微信一键登录（含云函数真跑）
node _ui/check-cloud-images.mjs  # 菜品图迁移到云存储（含模块与云函数真跑）
node _ui/check-favorites-page.mjs # 我的收藏（含云函数 byIds 真跑 + 端到端）
node _ui/check-user-page.mjs     # 个人中心（含画像/足迹/等级的推导真跑）
```

> 三个带手机外壳的预览脚本（chat / dish-list / user）各自带了一份状态栏 + 导航栏 + tabBar 的
> HTML 片段。抽到 `lib/preview-common.mjs` 会更整洁，但提取后需要重跑三个脚本才能确认没写坏 ——
> 其中菜单页预览依赖已被删除的 `static/dishes` 图片，重跑会把带照片的效果图覆盖成 emoji 版，
> 所以暂时保留这三份副本，改的时候注意三处同步。

（目录名 `_ui` 是历史原因，这里放的是各页面与功能的回归自检。）

公共逻辑在 `_ui/lib/page-check.mjs`、`_ui/lib/preview-common.mjs`，各页面共用一份，
避免复制粘贴出几套不一致的检查。页面类脚本都会：

1. 编译模板 / 脚本 / 样式（含 scss，模拟 uni.scss 注入 tokens.scss）
2. **与 `git HEAD` 对比**：原有函数 / 变量一个都不能少；有意删除的必须逐条写明原因
3. 核对模板里的 `@click`、`{{ }}`、`v-for` 变量与参数没变
4. 核对需求点名的模块都在
5. 核对 `Icon` 图标名真实存在、没有拿 emoji 当图标
6. 核对设计令牌真的用上了（不再写死颜色 / 圆角）

另外两个会**真跑被测代码**，而不是只看代码里写没写：

- `check-dish-list.mjs`：用内存版 uni 存储跑 `common/favorites.js`，
  验证收藏的增删查、幂等、坏数据自愈、存储不可用时不崩
- `check-wechat-login.mjs`：在沙箱里跑 `wechat-login` 云函数，
  覆盖「缺 code / 缺环境变量 / 只配一半 / 成功 / 40013 / 40029 / 40163 / 45011 /
  未知错误码 / 外网异常」十种情况，确认每种都给出可执行的原因而不是一句笼统的失败



