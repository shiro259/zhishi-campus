/**
 * 一次性 Node 测试用 ESM loader：把 `@/xxx` 解析到项目根目录的 xxx。
 *
 * 只在 scripts/test-api.mjs 里通过 --import 使用，不影响 uni-app 构建
 * （HBuilderX 编译时由它自己的 @ 别名规则处理）。
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = 'E:/uniapp'

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = path.join(ROOT, specifier.slice(2))
    return { url: pathToFileURL(target).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
