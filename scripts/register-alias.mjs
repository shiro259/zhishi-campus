/**
 * 注册脚本：在 Node 中启用 `@/` 别名解析（供 scripts/test-api.mjs 使用）
 *
 * 用法：node --import ./scripts/register-alias.mjs scripts/test-api.mjs
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

register(pathToFileURL(path.join(import.meta.dirname, 'alias-loader.mjs')))
