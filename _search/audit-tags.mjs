/**
 * 列出全部种子菜品的「菜名 / 分类 / 标签 / 描述里出现的食材词」
 *
 * 目的：判断「搜牛肉只出来一道」到底是搜索算法的问题，还是标签数据本身不全。
 * 做法：把常见食材词逐个拿去和菜名、描述做子串匹配，
 *       如果某道菜的名字/描述里明明有「牛肉」却没有 牛肉 标签，就是漏标。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(ROOT, 'common/local-dishes.js'), 'utf8')
const body = src.replace(/^export /gm, '')
const mod = await import('data:text/javascript,' + encodeURIComponent(body + '\nexport { LOCAL_DISHES };'))

const INGREDIENTS = ['牛肉', '猪肉', '羊肉', '鸡肉', '鸡', '鱼', '虾', '海鲜', '蛋', '花生', '豆腐',
  '香菜', '葱', '蒜', '牛奶', '内脏', '面', '米', '粉', '辣', '清淡', '甜', '酸']

const rows = mod.LOCAL_DISHES
console.log('共 ' + rows.length + ' 道菜\n')

let missingTag = 0
const problems = []

for (const d of rows) {
  const text = (d.name || '') + ' ' + (d.description || '') + ' ' + (d.category || '')
  const tags = Array.isArray(d.tags) ? d.tags : []
  const tagStr = tags.join(' ')
  // 菜名/描述里出现、但 tags 里没有的食材词
  const holes = INGREDIENTS.filter((w) => text.includes(w) && !tagStr.includes(w))
  console.log(
    `${d.id}  ${d.name.padEnd(8, '　')} | ${String(d.category).padEnd(4, '　')} | ${tags.join('/')}`
  )
  if (holes.length) {
    missingTag++
    problems.push({ id: d.id, name: d.name, holes })
    console.log(`      ⚠ 菜名/描述里出现但没打标签：${holes.join('、')}`)
  }
}

console.log('\n================ 漏标汇总 ================')
console.log('有漏标的菜品：' + missingTag + ' / ' + rows.length)
const counter = {}
problems.forEach((p) => p.holes.forEach((h) => { counter[h] = (counter[h] || 0) + 1 }))
Object.entries(counter).sort((a, b) => b[1] - a[1]).forEach(([w, n]) => console.log(`  ${w} × ${n}`))

console.log('\n================ 搜「牛肉」实际命中 ================')
const hit = rows.filter((d) => {
  const parts = [d.name, d.window, d.canteen, d.category, ...(d.tags || [])]
  return parts.some((x) => typeof x === 'string' && x.toLowerCase().includes('牛肉'))
})
hit.forEach((d) => console.log(`  ${d.id} ${d.name}  tags=${(d.tags || []).join('/')}`))
console.log('共 ' + hit.length + ' 道')

console.log('\n================ 数据里真正含「牛肉」的菜 ================')
const real = rows.filter((d) => ((d.name || '') + (d.description || '')).includes('牛肉'))
real.forEach((d) => console.log(`  ${d.id} ${d.name}  tags=${(d.tags || []).join('/')}`))
console.log('共 ' + real.length + ' 道')
