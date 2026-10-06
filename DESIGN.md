# 食遇校园 · 设计规范

> 本文是项目的**唯一视觉标准**。所有页面必须遵循，`node scripts/self-check.mjs` 会自动校验违规项。

## 一、设计取向

参考微信小程序大赛获奖产品的共同特征，本项目采用**克制型简约风格**：

| 做 | 不做 |
| --- | --- |
| 只用一个强调色（品牌橙），其余全是中性灰阶 | 一张卡片里塞三四种彩色渐变 |
| 靠**字号、字重、留白**拉开层次 | 靠阴影、边框、色块堆叠层次 |
| 白底卡片 + 极浅描边 + 大圆角 | 彩色渐变横幅、玻璃拟态、霓虹发光 |
| 线性 SVG 图标（统一线宽） | emoji 充当界面图标（机型间字形不一致，显廉价） |
| 信息分组：一屏只讲一件事 | 功能平铺：首屏塞满入口 |

**判断标准**：把界面截图缩到 30% 大小，如果还能一眼看清「主次关系」，就是合格的。

## 二、设计令牌

定义在 `common/tokens.scss`（60 个变量，纯变量文件，不含任何 CSS 规则，因此重复引入无副作用）。

**每个 `<style lang="scss">` 块必须在首行显式引入一次：**

```scss
<style lang="scss" scoped>
@import '@/common/tokens.scss';

.page { background: $canvas; }
</style>
```

> 踩过的坑：`uni.scss` 的「自动注入」在 **H5 + Vite** 编译链下并不生效，
> 只依赖它会出现 `[plugin:vite:css] [sass] Undefined variable: $canvas`。
> 因此不要省略这行 `@import`——它同时兼容 HBuilderX（App/小程序）与 Vite（H5）。

### 颜色

```
品牌色    $brand #FF5A36    $brand-soft #FFF1EC    $brand-line #FFD9CC    $brand-dark #E8481F
中性阶    $ink #14110F（标题）  $gray7 #4A443F（正文）  $gray6 #8A8580（辅助）
          $gray4 #B8B2AA（占位）  $line #EEECE7（描边）  $line-strong #E2DED6
表面      $surface #FFFFFF    $surface-sunken #F2F0EB    $canvas #F7F6F3
语义      $success / $success-soft    $warning / $warning-soft    $danger / $danger-soft
```

**规则**：样式里禁止出现裸色值（`#fff`、`rgba()` 除外），一律用令牌。

### 字号与字重

```
$fs-display 48rpx  金额、关键数字
$fs-title   36rpx  页面主标题
$fs-card    32rpx  卡片标题
$fs-body    28rpx  正文
$fs-sub     26rpx  次要正文
$fs-cap     24rpx  辅助说明
$fs-tag     22rpx  标签、角标

$fw-bold 600（中文用 600 比 700 精致）   $fw-medium 500   $fw-normal 400
```

### 圆角 / 间距 / 投影

```
圆角  $radius-sm 8 · $radius 16 · $radius-card 24 · $radius-lg 32 · $radius-pill 999（rpx）
间距  $gap-page 32（页面内边距）· $gap-card 28（卡片内边距）· $gap 20 · $gap-sm 12 · $gap-lg 28
投影  $shadow-card 0 2rpx 12rpx rgba(20,17,15,.03)   极浅，用于卡片
      $shadow-raise 0 8rpx 24rpx rgba(20,17,15,.06)  浮起，用于悬浮按钮/弹层
      $shadow-brand 0 8rpx 20rpx rgba(255,90,54,.24) 仅用于主按钮
控件  $h-btn 88 · $h-btn-sm 64 · $h-input 88（rpx）
```

## 三、基础组件

### `<Icon>` — 线性图标

```html
<Icon name="search" :size="30" color="#B8B2AA" />
```

- 内联 SVG（data URI），无需字体文件与第三方依赖，颜色留空继承父级 `color`
- 可用图标（`common/icons.js`）：`left right down up search close check plus filter refresh edit trash settings chart list image wallet info warning location clock user star heart sparkle bowl fire clipboard`
- **禁止**用 emoji 当界面图标

### `<DishImage>` — 菜品图

```html
<DishImage :dish="d" :size="160" :radius="20" />
```

- 优先级：后台填写的图片地址 → `static/dishes/<菜品id>.jpg` → emoji 渐变方块
- 图片加载失败也会在运行时回退，**永远不会出现破图**
- 菜品图一律走它，不要直接渲染 `d.emoji` 或手写 `<image>`

## 四、页面骨架

```scss
.page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
}

.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}
```

常用控件：

```scss
/* 胶囊标签 */
.chip { height:56rpx; padding:0 24rpx; border-radius:$radius-pill; font-size:$fs-cap;
        background:$surface; border:2rpx solid $line; color:$gray7; }
.chip-on { background:$brand-soft; border-color:$brand-line; color:$brand; font-weight:$fw-medium; }

/* 主按钮 / 次按钮 */
.btn-primary { height:$h-btn; background:$brand; border-radius:$radius-pill; color:#fff;
               font-weight:$fw-medium; box-shadow:$shadow-brand; }
.btn-ghost   { height:$h-btn; background:$surface; border:2rpx solid $line;
               border-radius:$radius-pill; color:$gray7; }

/* 内嵌信息块 */
.sunken { background:$surface-sunken; border-radius:$radius; padding:18rpx 20rpx; }
```

## 五、导航与配色一览

| 位置 | 规格 |
| --- | --- |
| 全局导航栏 | 白底 + 黑字（`pages.json` 的 `globalStyle`），不再使用橙色导航栏 |
| 首页 | `navigationStyle: custom`，自绘头部（问候语 + 昵称 + 头像 + 搜索胶囊） |
| tabBar | 白底，未选 `#B8B2AA`，选中 `#FF5A36` |

## 六、如何校验

```bash
node scripts/self-check.mjs              # 设计规范 + 语法 + 图片 + 注册一致性
node scripts/check-scss-ready.mjs        # SCSS 编译前置条件（@import / 编码 / 中文）
node scripts/check-scss-syntax.mjs       # SCSS 语法风险扫描
node scripts/check-import-first.mjs      # @import 是否位于每个块首行
node scripts/verify-png.mjs              # tabBar PNG 结构/尺寸/配色
node scripts/test-rasterizer.mjs         # 33 条断言：图标几何/抗锯齿/结构朝向
node --import ./scripts/register-alias.mjs scripts/test-api.mjs   # 47 条 API 断言
```

`self-check.mjs` 会自动检查：

1. 每个页面 `<style>` 是否声明 `lang="scss"`（否则用不了令牌）
2. **每个 `<style lang="scss">` 块是否都有 `@import '@/common/tokens.scss'`**
3. 样式里是否存在**硬编码色值**
4. **SCSS 令牌是否真实存在**（项目没有 sass 编译器，这条能拦住拼错的变量名）
5. `<Icon name="...">` 的图标名是否真实存在（含三元动态取值）
6. 模板标签配对、`<script setup>` 语法、JSON 合法性、导入可达性（含 `components/`）
7. pages.json 注册一致性、tabBar 图标文件是否存在
8. 菜品图片就位进度与本地/云端图片映射一致性

检查范围包含 **`pages/` + `App.vue` + `components/`**（只扫 pages 会漏掉全局样式与组件）。

**要求：问题列表为空。**

### tabBar 图标的生成与校验

tabBar 只接受本地图片路径，因此用脚本把同一套线性图标光栅化成 PNG：

```bash
node scripts/generate-tabbar-icons.mjs    # 生成 8 个 PNG 到 static/tabbar/
node scripts/test-rasterizer.mjs          # 33 条断言：几何 / 配色 / 抗锯齿 / 结构朝向
node scripts/test-rasterizer.mjs --show   # 额外打印 ASCII 字符画，可直接肉眼确认形状
```

生成器自己实现了 SVG path 解析（含椭圆弧转贝塞尔）、PNG 编码（Node 内置 zlib）与 4× 超采样抗锯齿，
**不依赖任何第三方库**。`--show` 输出的字符画是在无图片库、无截图环境下唯一能"看见"图标的途径。

> 踩过的坑：SVG 规范里 `A` 命令的 `large-arc-flag` 与 `sweep-flag` 是**不带分隔符的单字符**，
> `a9 9 0 100 18` 必须读成 `large-arc=1, sweep=0, x=0, y=18`；用正则切分数字会把整圆解析成错乱曲线。
