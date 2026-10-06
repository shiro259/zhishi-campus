/**
 * Node 加载钩子：让测试能直接 import 项目里的源码
 *
 * 两个问题必须解决，否则 import '../api/index.js' 直接报错：
 *   1. api/index.js 用的是 uni-app 的 '@/' 别名（@/common/...），Node 不认识；
 *   2. 项目根 package.json 没有 "type": "module"，Node 会把 .js 当 CommonJS 解析，
 *      而这些文件全是 ESM。
 * 所以这里把 '@/xxx' 映射到项目根，并强制项目内的 .js 按 ESM 解析。
 */
import { pathToFileURL } from 'node:url'

const PROJECT = new URL('../', import.meta.url)

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(new URL(specifier.slice(2), PROJECT).href, context)
  }
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.startsWith(PROJECT.href) && url.endsWith('.js')) {
    return next(url, { ...context, format: 'module' })
  }
  return next(url, context)
}
