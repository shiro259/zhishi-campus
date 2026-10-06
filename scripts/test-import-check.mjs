/**
 * 验证自检的「@import 缺失」检查真的会报警
 *
 * 做法：读出 App.vue → 内存里删掉 @import 行 → 用与 self-check 完全相同的判定逻辑检查 → 复原（文件从未被写过）。
 *
 * 注意：不能用 spawnSync 去跑自检再抓输出——在受限沙箱里子进程无法通过管道回传输出
 * （spawnSync 直接返回 EPERM），所以这里在同一进程内复用判定逻辑做验证。
 *
 * 用法：node scripts/test-import-check.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/** 与 self-check.mjs 保持一致的判定：每个 scss 块是否都有 @import */
function findBlocksMissingImport(src) {
  const missing = []
  const blockRe = /<style[^>]*lang="scss"[^>]*>([\s\S]*?)<\/style>/g
  let m
  while ((m = blockRe.exec(src))) {
    if (!/@import\s+['"]@\/common\/tokens\.scss['"]/.test(m[1])) missing.push(m[0].slice(0, 40))
  }
  return missing
}

const TARGET = path.join(ROOT, 'App.vue')
const original = fs.readFileSync(TARGET, 'utf8')

// 1) 正常文件应无缺失
const okMissing = findBlocksMissingImport(original)
console.log(`原始 App.vue：scss 块 ${(original.match(/lang="scss"/g) || []).length} 个，缺失 @import ${okMissing.length} 个`)

// 2) 内存里破坏后应能检出
const broken = original.replace(/@import\s+'@\/common\/tokens\.scss';\r?\n/, '')
const brokenMissing = findBlocksMissingImport(broken)

console.log(`删掉 @import 后：缺失 ${brokenMissing.length} 个`)

const pass = okMissing.length === 0 && brokenMissing.length === 1
console.log('')
if (pass) {
  console.log('✅ 检查逻辑有效：正常文件不报错，缺失 @import 时能检出')
} else {
  console.log('❌ 检查逻辑异常')
  process.exitCode = 1
}

// 文件全程只读，无需还原；这里确认一下确实没被改动
const now = fs.readFileSync(TARGET, 'utf8')
console.log('App.vue 未被修改:', now === original, `(${Buffer.byteLength(now)} 字节)`)
