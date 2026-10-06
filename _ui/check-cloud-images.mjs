/**
 * 菜品图迁移到云存储 自检
 *
 * 「改云存储要不要一个一个传」这个问题的答案是「不用」，那这个答案就必须被验证：
 *
 *   [1] 迁移模块真跑：成功 / 单张失败 / 全失败 / 无需迁移 / 云存储不可用
 *   [2] 云函数 setImages 真跑：口令校验、批量更新、部分失败、上限保护
 *   [3] 管理页按钮与提示都在，且走的是「全部菜品」而不是当前页
 *   [4] 关键保护：迁移不删本机原图（否则云端一出问题就没图可回退）
 *
 * 用法：node _ui/check-cloud-images.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createChecker, loadPage, checkCompile, checkLogic } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const c = createChecker()

/* ==================== [1] 迁移模块真跑 ==================== */
console.log('\n[1] common/cloud-images.js（真跑，用假 uni / uniCloud）')

/**
 * 用可控的假 uni / uniCloud 把模块跑起来
 * @param {Object} opts
 *   failUploads: 上传失败的图片文件名数组
 *   imageInfoFails: getImageInfo 失败的图片名（用来验证 readFile 回退）
 *   noCloud: 模拟未关联服务空间
 */
async function loadModule(opts = {}) {
  const uploads = []
  const infoCalls = []
  const readCalls = []

  globalThis.uni = {
    getImageInfo: ({ src, success, fail }) => {
      infoCalls.push(src)
      const name = String(src).split('/').pop()
      if ((opts.imageInfoFails || []).indexOf(name) >= 0) {
        fail && fail({ errMsg: 'getImageInfo:fail ' + name })
        return
      }
      success && success({ path: 'wxfile://tmp_' + name })
    },
    getFileSystemManager: () => ({
      readFile: ({ filePath, success, fail }) => {
        readCalls.push(filePath)
        success && success({ data: new ArrayBuffer(8) })
      }
    })
  }
  globalThis.uniCloud = opts.noCloud
    ? {}
    : {
        uploadFile: ({ filePath, fileContent, cloudPath, success, fail }) => {
          const name = String(cloudPath).split('/').pop()
          if ((opts.failUploads || []).indexOf(name) >= 0) {
            fail && fail({ errMsg: 'uploadFile:fail ' + name })
            return
          }
          uploads.push({ filePath, fileContent: !!fileContent, cloudPath })
          success && success({ fileID: 'cloud://space.bucket/' + cloudPath })
        }
      }

  const mod = await import('../common/cloud-images.js?v=' + Math.random())
  return { mod, uploads, infoCalls, readCalls }
}

const dishes = [
  { id: 'd001', name: '麻婆豆腐', image: 'static/dishes/d001.jpg' },
  { id: 'd002', name: '水煮肉片', image: 'static/dishes/d003.jpg' },
  { id: 'd003', name: '回锅肉', image: 'static/dishes/d004.jpg' },
  { id: 'd004', name: '已有云图', image: 'cloud://space.bucket/dishes/x.jpg' },
  { id: 'd005', name: '外链图', image: 'https://example.com/a.jpg' },
  { id: 'd006', name: '没图', image: '' }
]

// needsMigration 判定
{
  const { mod } = await loadModule()
  const need = mod.pickMigratable(dishes).map((d) => d.id)
  c.check('只挑出 image 指向 static/ 的菜品', need, ['d001', 'd002', 'd003'])
  c.ok('已是 cloud:// 的不重复迁移', mod.needsMigration({ image: 'cloud://a/b.jpg' }) === false)
  c.ok('外链图片不动', mod.needsMigration({ image: 'https://x/a.jpg' }) === false)
  c.ok('没有图片字段的不参与', mod.needsMigration({ image: '' }) === false)
  c.ok('带前导斜杠的 static 路径也算需要迁移', mod.needsMigration({ image: '/static/dishes/a.jpg' }) === true)
  c.ok('云路径按文件名生成且带 seed- 前缀（不与后台手工传的撞名）',
    mod.toCloudPath({ image: 'static/dishes/d001.jpg' }, 0) === 'dishes/seed-d001.jpg')
}

// 全部成功
{
  const { mod, uploads } = await loadModule()
  const progress = []
  const res = await mod.migrateDishImagesToCloud(dishes, {
    onProgress: (done, total, name) => progress.push([done, total, name])
  })
  c.check('total 只算需要迁移的', res.total, 3)
  c.check('三张全部上传成功', res.uploaded.length, 3)
  c.check('没有失败项', res.failed, [])
  c.check('上传用的云端路径正确', uploads.map((u) => u.cloudPath), [
    'dishes/seed-d001.jpg',
    'dishes/seed-d003.jpg',
    'dishes/seed-d004.jpg'
  ])
  c.ok('fileID 原样带回（用于写回云端）',
    res.uploaded[0].image === 'cloud://space.bucket/dishes/seed-d001.jpg')
  c.ok('上报了进度（首尾各一次）', progress.length >= 4 && progress[0][0] === 0)
  c.ok('走的是 getImageInfo 临时路径', uploads.every((u) => String(u.filePath).indexOf('wxfile://') === 0))
}

// 单张失败不中断
{
  const { mod } = await loadModule({ failUploads: ['seed-d003.jpg'] })
  const res = await mod.migrateDishImagesToCloud(dishes)
  c.check('失败的被单独记录，其余照常成功', res.uploaded.map((x) => x.id), ['d001', 'd003'])
  c.check('失败项带上原因', res.failed.length, 1)
  c.ok('失败原因来自底层错误信息', /uploadFile:fail/.test(res.failed[0].reason))
  c.check('失败的菜品名也带上，便于定位', res.failed[0].name, '水煮肉片')
}

// getImageInfo 失败 → 回退 readFile
{
  const { mod, uploads, readCalls } = await loadModule({ imageInfoFails: ['d001.jpg'] })
  const res = await mod.migrateDishImagesToCloud(dishes.slice(0, 1))
  c.ok('getImageInfo 失败时回退到 readFile', readCalls.length === 1 && readCalls[0].includes('d001.jpg'))
  c.ok('回退路径上传成功且用的是 fileContent',
    res.uploaded.length === 1 && uploads[0].fileContent === true, JSON.stringify(res.failed))
}

// 未关联云空间
{
  const { mod } = await loadModule({ noCloud: true })
  const res = await mod.migrateDishImagesToCloud(dishes)
  c.check('云存储不可用时全部记为失败（不抛异常）', res.failed.length, 3)
  c.ok('给出「先关联服务空间」的提示', /关联|云存储不可用/.test(res.failed[0].reason), res.failed[0].reason)
}

// 无需迁移
{
  const { mod, uploads } = await loadModule()
  const res = await mod.migrateDishImagesToCloud([{ id: 'x', name: 'y', image: 'cloud://a/b.jpg' }])
  c.check('没有需要迁移的菜品时返回空结果', [res.total, res.uploaded.length, res.failed.length], [0, 0, 0])
  c.check('也不会发起任何上传', uploads.length, 0)
}

/* ==================== [2] 云函数 setImages 真跑 ==================== */
console.log('\n[2] 云函数 shiyu-dish 的 setImages（真跑）')

function runDishFn(rows, authOk) {
  const src = read('uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js')
  const updated = []
  const store = rows.map((r) => ({ ...r }))
  const fakeDb = {
    collection: () => ({
      doc: (id) => ({
        update: async (patch) => {
          const hit = store.find((r) => r._id === id)
          if (!hit) return { updated: 0 }
          Object.assign(hit, patch)
          updated.push({ id, patch })
          return { updated: 1 }
        }
      }),
      where: () => ({ field: () => ({ limit: () => ({ get: async () => ({ data: store }) }) }) })
    }),
    command: { and: () => ({}), or: () => ({}) }
  }
  const sandbox = {
    uniCloud: { database: () => fakeDb },
    require: () => ({ verifyAdminToken: async () => (authOk ? { ok: true } : { ok: false, message: '口令校验失败' }) }),
    console: { log() {}, error() {}, warn() {} },
    process: { env: {} },
    exports: {},
    module: { exports: {} }
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: 'shiyu-dish/index.js' })
  return { main: sandbox.exports.main || sandbox.module.exports.main, updated, store }
}

const rows = [
  { _id: 'id1', name: 'A', image: 'static/dishes/d001.jpg', price: 8 },
  { _id: 'id2', name: 'B', image: 'static/dishes/d003.jpg', price: 9 }
]

{
  const { main, updated } = runDishFn(rows, true)
  const res = await main({ action: 'setImages', items: [{ id: 'id1', image: 'cloud://a/1.jpg' }] })
  c.ok('口令通过时批量更新成功', res.code === 0 && res.data.updated === 1, JSON.stringify(res))
  c.check('只改 image 字段（不动价格等其它字段）', Object.keys(updated[0].patch), ['image'])
  c.check('写回的是传入的 fileID', updated[0].patch.image, 'cloud://a/1.jpg')
}

{
  const { main } = runDishFn(rows, false)
  const res = await main({ action: 'setImages', items: [{ id: 'id1', image: 'cloud://a/1.jpg' }] })
  c.ok('口令不对时拒绝更新', res.code === -1 && res.message.includes('口令'), res.message)
}

{
  const { main } = runDishFn(rows, true)
  const res = await main({
    action: 'setImages',
    items: [
      { id: 'id1', image: 'cloud://a/1.jpg' },
      { id: 'id2', image: '' }, // 缺 image
      { id: '', image: 'cloud://a/3.jpg' }, // 缺 id
      { id: 'not-exist', image: 'cloud://a/4.jpg' } // 不存在
    ]
  })
  c.ok('部分失败不影响其它项', res.code === 0 && res.data.updated === 1)
  c.check('逐个记录失败原因', res.data.failed.map((f) => f.reason), ['缺少 image', '缺少菜品 id', '菜品不存在或内容无变化'])
}

{
  const { main } = runDishFn(rows, true)
  const res = await main({ action: 'setImages', items: [] })
  c.ok('空数组直接报缺少参数', res.code === -1 && res.message.includes('items'))
  const many = await main({
    action: 'setImages',
    items: Array.from({ length: 201 }, (_, i) => ({ id: 'id' + i, image: 'cloud://a/x.jpg' }))
  })
  c.ok('超过 200 条时拒绝（防止误传超大数组）', many.code === -1 && many.message.includes('200'), many.message)
}

/* ==================== [3] 管理页接线 ==================== */
console.log('\n[3] 管理端页面')
const page = loadPage(ROOT, 'pages/admin/dishes.vue')
checkCompile(ROOT, page, c)

// ⚠️ 必须跑 checkLogic：它会校验「模板里引用的标识符都有定义」。
// 这一项漏掉过一次 —— 模板里写了 migratableCount 而脚本里没定义，
// v-if 永远为 false，入口根本不渲染，而当时只跑编译是发现不了的。
checkLogic(page, {
  // 这些是前几轮按需求改掉的（与本次迁移无关），一并记录原因
}, c)

c.ok('模板里有迁移入口', page.tplSrc.includes('class="migrate-bar"') && page.tplSrc.includes('@click="onMigrateImages"'))
c.ok('入口的显示条件用的是已定义的 bagImageCount',
  page.tplSrc.includes('v-if="bagImageCount > 0 || migrating"') && page.script.includes('const bagImageCount = ref('))
c.ok('提示文案里的变量也已定义',
  page.tplSrc.includes('bagImageCount + 1') === false &&
  /migrate-sub[\s\S]{0,200}?bagImageCount/.test(page.tplSrc) &&
  page.script.includes('const progressText = ref('))
c.ok('迁移前有二次确认', /onMigrateImages[\s\S]{0,600}?uni\.showModal/.test(page.script))
c.ok('针对全部菜品而不是当前页（否则只迁一页）',
  /async function fetchAllDishes\(\)[\s\S]{0,700}?dishApi\.list\(\{ page: p, pageSize: 100 \}\)/.test(page.script))
c.ok('按页循环取全（云函数单页上限 100，传 999 会被截断）',
  page.script.includes('MAX_PAGES') && page.script.includes('res.hasMore'))
c.ok('打开页面时统计包内图片数量', /onLoad\(async[\s\S]*?refreshBagImageCount\(\)/.test(page.script))
c.ok('迁移完成后刷新列表并重新统计', /await reload\(\)[\s\S]{0,200}?refreshBagImageCount\(\)/.test(page.script))
c.ok('结果显示成功与失败数量', page.script.includes('上传成功') && page.script.includes('上传失败'))
c.ok('提示了下一步（确认无误后再删本机原图）',
  page.script.includes('可以删掉 static/dishes'))
c.ok('迁移中禁用按钮（防重复提交）', page.tplSrc.includes("disabled: migrating") && page.script.includes('if (migrating.value) return'))

// 关键保护：迁移不能顺手删本机原图
const cloudMod = read('common/cloud-images.js')
c.ok('迁移模块里没有任何删除本机文件的操作（原图必须留着，云端出问题才有回退）',
  !/removeSavedFile|unlink|rmdir|rmSync/.test(cloudMod))

/* ==================== [4] API 层 ==================== */
console.log('\n[4] API 层')
const apiSrc = read('api/index.js')
c.ok('dishApi 暴露了 setImages', /async setImages\(items/.test(apiSrc))
c.ok('setImages 带管理口令', /action: 'setImages'[\s\S]{0,120}?token: getAdminToken\(\)/.test(apiSrc))
c.ok('批量接口给了更长的超时', /setImages[\s\S]{0,400}?timeout: Number\(options\.timeout\)/.test(apiSrc))

process.exit(c.summary() === 0 ? 0 : 1)
