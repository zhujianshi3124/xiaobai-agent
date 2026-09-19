#!/usr/bin/env node
// P4 验收证据（用户要求 1）：面板 v2 数据面禁止 import 任何具体子插件模块。
// 扫描 P4 交付的 4 个文件，搜索五个子插件名与 lib/ 路径引用；命中即非零退出。
// 用法：node scripts/p4-no-subplugin-import-check.mjs [文件...]（缺省扫 P4 文件集）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultFiles = [
  'panel/manager/registry-host.mjs',
  'panel/manager/v2-api.mjs',
  'panel/manager/realtime-connector.mjs',
  'panel/client/v2.html',
]
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(root, f))
  : defaultFiles.map((f) => path.resolve(root, f))

const PATTERNS = [
  /rate-throttle/,
  /compact-router/,
  /agent-memory/,
  /search-router/,
  /web-search-local/,
  /\bfrom\s+['"][^'"]*\blib\//,
  /import\(\s*['"][^'"]*\blib\//,
  /require\(\s*['"][^'"]*\blib\//,
]

let hits = 0
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      if (re.test(line)) {
        hits++
        console.log(`命中 ${rel}:${i + 1}  ${line.trim().slice(0, 120)}`)
      }
    }
  })
}

console.log(`[no-subplugin-import-check] 扫描 ${files.length} 个文件，命中 ${hits} 处。`)
process.exit(hits === 0 ? 0 : 1)
