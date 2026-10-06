/**
 * 菜品配图下载脚本（在本机运行，需要外网）
 *
 * 从 Wikimedia Commons 抓取**自由授权**的菜品照片，下载到 static/dishes/，
 * 并生成 static/dishes/manifest.json（含来源、作者、授权协议，用于署名合规）。
 *
 * 为什么必须下载到本地、而不是直接引用外链：
 *   微信小程序不允许 <image> 请求未在后台备案的第三方域名，外链图在真机上会被拦截。
 *   下载到 static/ 后 H5 / 小程序 / App 三端都能正常显示，且离线可用。
 *
 * 下载哪些图、存成什么文件名，由 scripts/dish-image-map.json 决定
 * （菜名 → 文件名），保证本地菜谱与云端种子数据引用同一套图。
 *
 * 用法：
 *   node scripts/download-dish-images.mjs              # 下载缺失的图（已存在则跳过）
 *   node scripts/download-dish-images.mjs --force       # 全部重新下载
 *   node scripts/download-dish-images.mjs --only 麻婆豆腐  # 只下载某道菜
 *   node scripts/download-dish-images.mjs --api-only    # 只打印将使用的图片地址
 */
import fs from 'node:fs'
import path from 'node:path'
import dns from 'node:dns'
import { fileURLToPath } from 'node:url'

const UA = 'ShiYuCampus/1.0 (educational campus project; contact: student@example.edu)'

// 不同网络环境下可达的地址族不同：有的没有 IPv6 出口，有的 IPv4 被污染只能走 IPv6。
// 启动时分别探测一次，选择能连通 Wikimedia 的地址族顺序。
async function detectResultOrder() {
  const probe = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&meta=siteinfo'
  for (const order of ['ipv6first', 'ipv4first']) {
    dns.setDefaultResultOrder(order)
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(probe, { signal: ctrl.signal, headers: { 'User-Agent': UA } })
      clearTimeout(timer)
      if (res.ok) return order
    } catch { /* 试下一个 */ }
  }
  return 'ipv4first'
}
const resultOrder = await detectResultOrder()
dns.setDefaultResultOrder(resultOrder)
console.log('DNS 地址族优先顺序：' + resultOrder)

// undici 仅用于调优连接池参数；未安装时直接使用 Node 内置 fetch
// （内置 fetch 同样基于 undici，请求超时已由 AbortController 控制）。
try {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({
    connect: { timeout: 30000 },
    headersTimeout: 60000,
    bodyTimeout: 60000,
    keepAliveTimeout: 15000,
    connections: 4
  }))
} catch (e) {
  // 未安装 undici，使用全局 dispatcher
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT_DIR = path.join(ROOT, 'static', 'dishes')
const MANIFEST = path.join(OUT_DIR, 'manifest.json')
const MAP_FILE = path.join(HERE, 'dish-image-map.json')

const argv = process.argv.slice(2)
const API_ONLY = argv.includes('--api-only')
const FORCE = argv.includes('--force')
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : ''
const WIDTH = argv.includes('--width') ? Number(argv[argv.indexOf('--width') + 1]) : 400
const LIMIT = 6

/**
 * 菜名 → 检索词
 * 用英文/通用名检索，Commons 命中率远高于中文名。
 * 没列出的菜名会退化为「菜名 + Chinese food」兜底检索。
 */
const QUERIES = {
  麻婆豆腐: 'Mapo tofu',
  宫保鸡丁: 'Kung Pao chicken',
  水煮肉片: 'Sichuan boiled pork',
  毛血旺: 'Mao xue wang',
  鱼香肉丝: 'Yuxiang shredded pork',
  麻辣香锅: 'Mala xiang guo',
  麻辣烫: 'Malatang',
  辣子鸡: 'Laziji chicken',
  回锅肉: 'twice cooked pork',
  酸辣粉: 'hot and sour noodles',
  担担面: 'Dan dan noodles',
  重庆小面: 'Chongqing noodles',
  酸辣土豆丝: 'shredded potato stir fry',
  番茄炒蛋: 'scrambled eggs with tomatoes',
  红烧排骨: 'braised pork ribs',
  青椒肉丝: 'shredded pork green pepper',
  清炒时蔬: 'stir fried vegetables Chinese',
  紫菜蛋花汤: 'egg drop soup',
  蒜蓉油麦菜: 'Chinese broccoli oyster sauce',
  兰州拉面: 'Lanzhou beef noodles',
  牛肉拉面: 'beef noodle soup',
  三鲜馄饨: 'wonton soup',
  武汉热干面: 'hot dry noodles Wuhan',
  西红柿鸡蛋面: 'tomato egg noodles',
  番茄鸡蛋面: 'tomato egg noodles',
  油泼面: 'biang biang noodles',
  炸酱面: 'Zhajiangmian noodles',
  阳春面: 'plain noodles soup',
  臊子面: 'Saozi noodles',
  黄焖鸡米饭: 'braised chicken rice',
  香菇滑鸡: 'steamed chicken mushroom',
  蛋炒饭: 'egg fried rice',
  咖喱鸡排饭: 'chicken curry rice',
  咖喱鸡肉饭: 'chicken curry rice',
  卤肉饭: 'braised pork rice Taiwan',
  台式卤肉饭: 'braised pork rice Taiwan',
  梅菜扣肉饭: '梅菜扣肉',
  鲜榨橙汁: 'fresh orange juice glass',
  鸡胸沙拉: 'grilled chicken salad',
  红烧牛肉饭: 'braised beef rice',
  番茄牛腩饭: 'tomato beef brisket rice',
  照烧鸡腿饭: 'teriyaki chicken rice',
  孜然羊肉饭: 'cumin lamb rice',
  土豆炖牛肉: 'beef stew potato',
  手抓饼: 'scallion pancake',
  煎饼果子: 'Jianbing Chinese crepe',
  肉夹馍: 'Roujiamo Chinese hamburger',
  沙县蒸饺: 'steamed dumplings',
  小笼包: 'xiaolongbao soup dumpling',
  皮蛋瘦肉粥: 'congee pork',
  烤冷面: 'grilled cold noodles',
  鸭血粉丝汤: 'duck blood soup',
  广东肠粉: 'rice noodle roll',
  白切鸡: 'white cut chicken',
  蜜汁叉烧饭: 'char siu rice',
  蜜汁叉烧: 'char siu',
  干炒牛河: 'beef chow fun',
  广式煲仔饭: 'claypot rice',
  螺蛳粉: 'Luosifen',
  羊肉泡馍: 'Yangrou paomo',
  云南过桥米线: 'crossing the bridge noodles',
  孜然羊肉串: 'lamb skewers',
  蒜蓉蒸虾: 'steamed prawns garlic',
  蒜蓉粉丝娃娃菜: 'steamed cabbage vermicelli',
  鸡胸肉沙拉: 'chicken salad',
  藜麦蔬菜饭: 'quinoa vegetable bowl',
  全麦三明治: 'whole wheat sandwich',
  牛奶燕麦碗: 'oatmeal bowl milk',
  水果酸奶杯: 'yogurt fruit parfait'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 带超时 + 指数退避重试的 fetch：公网图片站偶发抖动，必须重试 */
async function timedFetch(url, timeoutMs = 45000, retries = 4) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: '*/*' }
      })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error('HTTP ' + res.status)
        clearTimeout(timer)
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }
      clearTimeout(timer)
      return res
    } catch (e) {
      clearTimeout(timer)
      const cause = e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''
      lastErr = new Error(e.message + cause)
      await sleep(1000 * Math.pow(2, attempt))
    }
  }
  throw lastErr || new Error('请求失败')
}

/** 排除 PDF / 视频等非图片条目（Commons 搜索会返回它们的封面缩略图） */
function isRealImage(info, title) {
  const mime = String((info && info.mime) || '')
  if (mime && !/^image\/(jpeg|png|webp)$/i.test(mime)) return false
  if (/\.(pdf|webm|ogv|ogg|mp4|svg|tif|tiff|xcf|djvu)$/i.test(title || '')) return false
  const url = String((info && info.thumburl) || '')
  if (/\/(pdf|webm|ogv|mp4)\//i.test(url)) return false
  // 优先横向构图，避免竖图在卡片里被裁得只剩一条
  const w = Number(info.width || 0)
  const h = Number(info.height || 0)
  if (w && h && h > w * 1.6) return false
  return true
}

async function searchImage(query) {
  const api = 'https://commons.wikimedia.org/w/api.php'
    + '?action=query&format=json&generator=search&gsrnamespace=6'
    + '&gsrlimit=' + LIMIT
    + '&gsrsearch=' + encodeURIComponent(query)
    + '&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=' + WIDTH

  const res = await timedFetch(api)
  if (!res.ok) throw new Error('API HTTP ' + res.status)
  const body = await res.json()

  const pages = body && body.query && body.query.pages
    ? Object.values(body.query.pages).sort((a, b) => (a.index || 99) - (b.index || 99))
    : []

  for (const p of pages) {
    const info = p.imageinfo && p.imageinfo[0]
    if (!info || !info.thumburl) continue
    if (!isRealImage(info, p.title)) continue
    const meta = info.extmetadata || {}
    return {
      thumb: info.thumburl,
      page: info.descriptionurl,
      title: p.title,
      mime: info.mime || '',
      license: (meta.LicenseShortName && meta.LicenseShortName.value) || '',
      artist: ((meta.Artist && meta.Artist.value) || '').replace(/<[^>]+>/g, '').trim()
    }
  }
  return null
}

async function download(url, dest) {
  const res = await timedFetch(url, 60000)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 2000) throw new Error('文件过小，可能是错误页')
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  if (!isJpg && !isPng) throw new Error('返回内容不是图片')
  fs.writeFileSync(dest, buf)
  return buf.length
}

/* --------------------------------- 主流程 --------------------------------- */

async function main() {
  if (!fs.existsSync(MAP_FILE)) {
    throw new Error('缺少 scripts/dish-image-map.json，请先运行 node scripts/build-image-map.mjs')
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
  const entries = Object.entries(mapData.map).filter(([dish]) => !ONLY || dish === ONLY)

  // 按文件名去重：多道菜可能共用一张同类图，只下载一次
  const byFile = new Map()
  for (const [dish, file] of entries) {
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push(dish)
  }

  console.log(`待处理菜名 ${entries.length} 个，去重后需下载图片 ${byFile.size} 张（宽 ${WIDTH}px）\n`)

  const items = []
  let index = 0

  for (const [file, dishes] of byFile) {
    index++
    const dish = dishes[0]
    const dest = path.join(OUT_DIR, file)
    const entry = {
      file: `static/dishes/${file}`,
      dishes,
      query: QUERIES[dish] || (dish + ' Chinese food'),
      source_title: '',
      source_page: '',
      license: '',
      artist: '',
      status: 'pending',
      bytes: 0
    }

    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
      entry.status = 'ok'
      entry.bytes = fs.statSync(dest).size
      entry.skipped = true
      console.log(`[${index}/${byFile.size}] ${file} ← ${dish}（已存在，跳过）`)
      items.push(entry)
      continue
    }

    try {
      const hit = await searchImage(entry.query)
      if (!hit) {
        entry.status = 'no-result'
        console.log(`[${index}/${byFile.size}] ${file} ← ${dish}：未找到合适图片`)
        items.push(entry)
        continue
      }
      entry.source_title = hit.title
      entry.source_page = hit.page
      entry.license = hit.license
      entry.artist = hit.artist

      if (API_ONLY) {
        console.log(`[${index}/${byFile.size}] ${file} ← ${dish}：${hit.thumb}`)
        entry.status = 'found'
        items.push(entry)
        continue
      }

      const bytes = await download(hit.thumb, dest)
      entry.status = 'ok'
      entry.bytes = bytes
      console.log(`[${index}/${byFile.size}] ${file} ← ${dish}（${Math.round(bytes / 1024)} KB，${hit.license}）`)
    } catch (e) {
      entry.status = 'failed'
      entry.error = e.message
      console.log(`[${index}/${byFile.size}] ${file} ← ${dish}：失败 ${e.message}`)
    }

    items.push(entry)
    await sleep(250) // 对 Commons 友好，避免限流
  }

  // 合并清单，保留上一次的结果（支持增量补图）
  let merged = items
  if (fs.existsSync(MANIFEST)) {
    try {
      const old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
      const byOld = new Map((old.items || []).map((it) => [it.file, it]))
      for (const it of items) byOld.set(it.file, it)
      merged = [...byOld.values()]
    } catch (e) {
      // 旧清单损坏则直接覆盖
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({
    generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    source: 'Wikimedia Commons (https://commons.wikimedia.org)',
    note: '图片为自由授权作品，逐条来源与作者见 items；仅作教学演示用途，可用于答辩材料的来源说明',
    width: WIDTH,
    items: merged
  }, null, 2), 'utf8')

  const ok = merged.filter((i) => i.status === 'ok').length
  const noResult = merged.filter((i) => i.status === 'no-result')
  console.log(`\n成功 ${ok} / 共 ${merged.length} 张，清单 -> static/dishes/manifest.json`)
  if (noResult.length) {
    console.log('未找到图片的菜名：' + noResult.map((i) => i.dishes[0]).join('、'))
    console.log('可手动放一张同名图片到 static/dishes/，或修改 scripts/dish-image-map.json 换用别的菜名图。')
  }

  // 重建「实际存在哪些图片」的清单：前端据此决定显示照片还是 emoji 回退。
  // 不做这一步，新下载的图片不会被前端识别（仍会显示 emoji）。
  await regenerateImageManifest()
}

/**
 * 调用 gen-dish-images.mjs 重建图片清单。
 * 注意：受限环境下子进程可能无法创建管道，因此失败时给出明确的手动执行提示，
 * 而不是静默跳过（否则用户会困惑"图片下载了却不显示"）。
 */
async function regenerateImageManifest() {
  const genScript = path.join(HERE, 'gen-dish-images.mjs')
  if (!fs.existsSync(genScript)) {
    console.log('\n提示：未找到 scripts/gen-dish-images.mjs，请手动维护 common/dish-images.js')
    return
  }

  // 优先在本进程内直接扫描目录写清单，避免依赖子进程
  try {
    const { execFileSync } = await import('node:child_process')
    execFileSync(process.execPath, [genScript], { stdio: 'inherit' })
    return
  } catch (e) {
    console.log('\n提示：自动重建图片清单失败（' + (e && e.message) + '）')
    console.log('请手动执行：node scripts/gen-dish-images.mjs')
  }
}

main().catch((e) => {
  console.error('脚本异常：', e.message)
  process.exitCode = 1
})
