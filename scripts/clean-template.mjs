/**
 * 一次性清理脚本：移除 hello uniCloud 模板示例页、示例组件、示例云函数、
 * 示例数据库 schema 与示例静态资源，只保留「食遇校园」业务相关文件。
 *
 * 用法：node scripts/clean-template.mjs          （预演，只打印）
 *       node scripts/clean-template.mjs --apply （执行删除）
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:/uniapp'
const APPLY = process.argv.includes('--apply')

/** 要删除的目录（递归） */
const DIRS = [
  // 模板示例页面（均未在 pages.json 注册，属于死代码）
  'pages/clientDB',
  'pages/cloudFunction',
  'pages/cloudObject',
  'pages/schema2code',
  'pages/storage',
  'pages/secure-network',
  'pages/test',
  'pages/validate-demo',
  'pages/user-info',
  'pages/webview',
  // 模板示例组件（仅被上面的示例页引用）
  'components/alertCode',
  'components/j-input',
  'components/j-link',
  'components/j-video',
  'components/page-head',
  'components/set-permission',
  'components/show-code',
  // 模板示例云函数
  'uniCloud-aliyun/cloudfunctions/add',
  'uniCloud-aliyun/cloudfunctions/ai-recommend',
  'uniCloud-aliyun/cloudfunctions/cloud-object-demo',
  'uniCloud-aliyun/cloudfunctions/ext-storage-co',
  'uniCloud-aliyun/cloudfunctions/get',
  'uniCloud-aliyun/cloudfunctions/prohibitedWords',
  'uniCloud-aliyun/cloudfunctions/redis-test',
  'uniCloud-aliyun/cloudfunctions/remove',
  'uniCloud-aliyun/cloudfunctions/secure-network',
  'uniCloud-aliyun/cloudfunctions/secure-network-object',
  'uniCloud-aliyun/cloudfunctions/update',
  'uniCloud-aliyun/cloudfunctions/upload-image',
  'uniCloud-aliyun/cloudfunctions/use-common',
  'uniCloud-aliyun/cloudfunctions/user-center',
  'uniCloud-aliyun/cloudfunctions/uni-clientDB-actions',
  'uniCloud-aliyun/cloudfunctions/common/hello-common'
]

/** 要删除的单个文件 */
const FILES = [
  // 模板示例 schema 与示例数据
  'uniCloud-aliyun/database/book.schema.json',
  'uniCloud-aliyun/database/book.init_data.json',
  'uniCloud-aliyun/database/order.schema.json',
  'uniCloud-aliyun/database/order.init_data.json',
  'uniCloud-aliyun/database/permission-test.schema.json',
  'uniCloud-aliyun/database/permission-test-1.schema.json',
  'uniCloud-aliyun/database/permission-test-1.init_data.json',
  'uniCloud-aliyun/database/permission-test-2.schema.json',
  'uniCloud-aliyun/database/permission-test-2.init_data.json',
  'uniCloud-aliyun/database/permission-test-3.schema.json',
  'uniCloud-aliyun/database/permission-test-3.init_data.json',
  'uniCloud-aliyun/database/permission-test-4.schema.json',
  'uniCloud-aliyun/database/permission-test-4.init_data.json',
  'uniCloud-aliyun/database/permission-test-5.schema.json',
  'uniCloud-aliyun/database/permission-test-5.init_data.json',
  'uniCloud-aliyun/database/permission-test-6.schema.json',
  'uniCloud-aliyun/database/permission-test-6.init_data.json',
  'uniCloud-aliyun/database/permission-test-7.schema.json',
  'uniCloud-aliyun/database/permission-test-7.init_data.json',
  'uniCloud-aliyun/database/permission-test-8.schema.json',
  'uniCloud-aliyun/database/permission-test-9.schema.json',
  'uniCloud-aliyun/database/permission-test-10.schema.json',
  'uniCloud-aliyun/database/permission-test-11.schema.json',
  'uniCloud-aliyun/database/permission-test-12.schema.json',
  'uniCloud-aliyun/database/test.schema.json',
  'uniCloud-aliyun/database/test.init_data.json',
  'uniCloud-aliyun/database/unicloud-test.schema.json',
  'uniCloud-aliyun/database/unicloud-test.init_data.json',
  'uniCloud-aliyun/database/user-info.schema.json',
  'uniCloud-aliyun/database/validate-demo.schema.json',
  'uniCloud-aliyun/database/validateFunction/type_name_check.js',
  'uniCloud-aliyun/database/validateFunction/word_filter.js',
  // 模板示例页面（已在上面的 pages 目录清理清单覆盖，这里补单文件）
  'pages/user/edit.vue',
  // 模板说明文档
  'schema2code.md',
  // 模板示例静态资源
  'static/jian.png',
  'static/play.png',
  'static/uniCloud-logo-1.png',
  'static/tabbar/fn.png',
  'static/tabbar/fn1.png',
  'static/tabbar/obj.png',
  'static/tabbar/obj1.png',
  'static/tabbar/st-code.png',
  'static/tabbar/st-code1.png',
  'static/tabbar/storage.png',
  'static/tabbar/storage1.png',
  'static/tabbar/yun.png',
  'static/tabbar/yun1.png',
  'static/userImg/admin.png',
  'static/userImg/auditor.png',
  'static/userImg/user.png'
]

function sizeOf(target) {
  if (!fs.existsSync(target)) return 0
  const stat = fs.statSync(target)
  if (stat.isFile()) return stat.size
  let total = 0
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name)
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size
  }
  return total
}

let bytes = 0
let count = 0
let missing = 0

console.log(`模式：${APPLY ? '执行删除' : '预演（加 --apply 才真正删除）'}\n`)

for (const rel of [...DIRS, ...FILES]) {
  const target = path.join(ROOT, rel)
  if (!fs.existsSync(target)) {
    console.log(`  [跳过] ${rel}（不存在）`)
    missing++
    continue
  }
  const size = sizeOf(target)
  bytes += size
  count++
  console.log(`  删除 ${rel}  (${(size / 1024).toFixed(1)} KB)`)
  if (APPLY) fs.rmSync(target, { recursive: true, force: true })
}

console.log(`\n共 ${count} 项，约 ${(bytes / 1024 / 1024).toFixed(2)} MB${APPLY ? '，已删除' : '，未删除'}；跳过 ${missing} 项`)
