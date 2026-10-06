/**
 * 忌口相关的标签漏标体检
 *
 * 只盯 ALLERGY_OPTIONS 里的 10 个食材词（香菜、葱、蒜、花生、海鲜、牛肉、羊肉、
 * 内脏、鸡蛋、牛奶）。原因是这两个后果都很严重：
 *
 *   1. **搜索**：标签是搜食材最准的字段。菜名里没有、只写在描述里的食材，
 *      不打标签就一定搜不到（例：麻婆豆腐的描述写着「嫩豆腐配牛肉末」，
 *      但没有 牛肉 标签 → 搜「牛肉」搜不到它）。
 *   2. **忌口硬过滤**：推荐引擎按 tags 精确匹配剔除忌口菜
 *      （recommend-engine.js: tags.indexOf(allergen) >= 0）。
 *      漏标意味着过敏同学可能被推荐到含该食材的菜。
 *
 * 判断「真漏标」的规则：该食材词出现在**描述**里却没进 tags。
 * 只出现在菜名里的不算漏标 —— 菜名本身参与搜索，搜得到。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(ROOT, 'common/local-dishes.js'), 'utf8').replace(/^export /gm, '')
const { LOCAL_DISHES } = await import(
  'data:text/javascript,' + encodeURIComponent(src + '\nexport { LOCAL_DISHES };')
)
const { ALLERGY_OPTIONS } = await import('../common/constants.js')

console.log('忌口词：' + ALLERGY_OPTIONS.join('、') + '\n')

let real = 0
const descOnly = []
const nameOnly = []

for (const d of LOCAL_DISHES) {
  const tags = Array.isArray(d.tags) ? d.tags : []
  const desc = String(d.description || '')
  const name = String(d.name || '')
  for (const w of ALLERGY_OPTIONS) {
    if (tags.includes(w)) continue
    const inDesc = desc.includes(w)
    const inName = name.includes(w)
    if (inDesc && !inName) {
      real++
      descOnly.push({ dish: d, word: w })
    } else if (inDesc && inName) {
      nameOnly.push({ dish: d, word: w, why: '菜名里也有，搜得到' })
    }
  }
}

console.log('=== 真漏标：食材只写在描述里、tags 里没有（会导致搜不到 + 忌口过滤失效）===')
if (!descOnly.length) console.log('（无）')
descOnly.forEach(({ dish, word }) => {
  console.log(`  ${dish.name}（${dish.canteen}·${dish.window}）缺少「${word}」标签`)
  console.log(`      现有 tags：${(dish.tags || []).join('/')}`)
  console.log(`      描述：${dish.description}`)
})

console.log('\n=== 仅供参考：菜名里也出现该词，搜索不受影响 ===')
if (!nameOnly.length) console.log('（无）')
nameOnly.forEach(({ dish, word }) => {
  console.log(`  ${dish.name}：描述/菜名提到「${word}」，tags=${(dish.tags || []).join('/')}（${'菜名里也有，搜得到'}）`)
})

console.log('\n真漏标数：' + real)
process.exit(real === 0 ? 0 : 1)
