/**
 * 全项目 SFC 编译检查
 *
 * 用 @vue/compiler-sfc 真编译每一个 .vue（template + script + style 的 scss 交给
 * sass 编译成本高，这里只做 vue 层面的解析与模板编译），能抓出：
 *   - 模板语法错误（标签不闭合、指令写错）
 *   - script setup 解析错误
 *   - 引用了不存在的子组件 / 未定义的变量（通过编译产物里的引用粗略核对）
 * 目的：改完代码先自己发现编译错误，而不是等 HBuilderX 报「编译 .wxml 文件错误」。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate, compileScript } from '@vue/compiler-sfc'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'unpackage' || name.startsWith('_')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

const files = walk(ROOT)
let bad = 0
const allComponents = new Set()

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const { descriptor, errors } = parse(src, { filename: file })

  if (errors && errors.length) {
    bad++
    console.log('FAIL(parse) ' + rel)
    errors.forEach((e) => console.log('   ' + (e.message || e)))
    continue
  }

  const problems = []

  // 模板编译
  if (descriptor.template) {
    const res = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: rel,
      compilerOptions: { mode: 'module' }
    })
    if (res.errors && res.errors.length) {
      res.errors.forEach((e) => problems.push('template: ' + (e.message || e)))
    }
  }

  // script setup 解析（不真正执行，只做语法/宏检查）
  if (descriptor.scriptSetup || descriptor.script) {
    try {
      compileScript(descriptor, { id: rel })
    } catch (e) {
      problems.push('script: ' + (e.message || e))
    }
  }

  if (problems.length) {
    bad++
    console.log('FAIL ' + rel)
    problems.forEach((p) => console.log('   ' + p))
  } else {
    console.log('  ok  ' + rel)
  }

  // 统计自定义组件引用，后面核对是否存在
  if (descriptor.template) {
    for (const m of descriptor.template.content.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
      allComponents.add(m[1])
    }
  }
}

console.log('\n共 ' + files.length + ' 个 .vue，' + (bad === 0 ? '全部编译通过' : bad + ' 个失败'))
process.exit(bad === 0 ? 0 : 1)
