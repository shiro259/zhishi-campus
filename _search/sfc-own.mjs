/**
 * 只检查项目自己的代码（跳过 uni_modules 第三方插件）
 *
 * uni_modules 里的官方插件用了 uni-app 的条件编译注释（// #ifdef MP-WEIXIN），
 * 裸的 @vue/compiler-sfc 无法解析，会误报 —— 那些不是我们的代码。
 * 这里只关心 pages/ components/ 与根目录下的自研 .vue。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate, compileScript } from '@vue/compiler-sfc'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['pages', 'components']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'unpackage' || name.startsWith('_')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)))
let bad = 0
const okList = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const { descriptor, errors } = parse(src, { filename: file })
  const problems = []
  if (errors && errors.length) errors.forEach((e) => problems.push('parse: ' + (e.message || e)))

  if (!problems.length && descriptor.template) {
    const res = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: rel,
      compilerOptions: { mode: 'module' }
    })
    if (res.errors && res.errors.length) res.errors.forEach((e) => problems.push('template: ' + (e.message || e)))
  }
  if (!problems.length && (descriptor.scriptSetup || descriptor.script)) {
    try { compileScript(descriptor, { id: rel }) }
    catch (e) { problems.push('script: ' + (e.message || e)) }
  }

  if (problems.length) {
    bad++
    console.log('FAIL ' + rel)
    problems.forEach((p) => console.log('   ' + p))
  } else {
    okList.push(rel)
  }
}

okList.sort().forEach((r) => console.log('  ok  ' + r))
console.log('\n自研代码 ' + files.length + ' 个 .vue，' + (bad === 0 ? '全部编译通过' : bad + ' 个失败'))
process.exit(bad === 0 ? 0 : 1)
