#!/usr/bin/env node
// P4 验收证据（用户要求 1）：面板 v2 数据面禁止 import 任何具体子插件模块。
// P6 退役更新（原 v2.html 过渡页删除）：扫描清单改为 registry 化的四个 manager/引擎
// 文件 + panel/index.js（全模式）+ panel/client/index.js（**仅模块导入形态**——
// 客户端存量 P2.4 文案常量（DESCRIPTIONS/UNINSTALL_COPY 等）合法含五个子插件名，
// 不属数据面 import；对它只查 from/import/require 指向 lib/ 的真实模块引用）。
// 命中即非零退出。
// 用法：node scripts/p4-no-subplugin-import-check.mjs [文件...]（缺省扫 P6 文件集）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const NAME_PATTERNS = [
  /rate-throttle/,
  /compact-router/,
  /agent-memory/,
  /search-router/,
  /web-search-local/,
]
const MODULE_PATTERNS = [
  /\bfrom\s+['"][^'"]*\blib\//,
  /import\(\s*['"][^'"]*\blib\//,
  /require\(\s*['"][^'"]*\blib\//,
]

// files: [相对路径, 模式集]；'all' = 子插件名 + lib/ 模块引用；'module' = 仅 lib/ 模块引用
const defaultFiles = [
  ['panel/manager/registry-host.mjs', 'all'],
  ['panel/manager/v2-api.mjs', 'all'],
  ['panel/manager/realtime-connector.mjs', 'all'],
  ['panel/index.js', 'all'],
  ['panel/client/index.js', 'module'],
]
const argSpecs = process.argv.slice(2)
const files = argSpecs.length
  ? argSpecs.map((f) => [path.resolve(root, f), f.endsWith('client/index.js') ? 'module' : 'all'])
  : defaultFiles.map(([f, mode]) => [path.resolve(root, f), mode])

let hits = 0
for (const [file, mode] of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const patterns = mode === 'module' ? MODULE_PATTERNS : [...NAME_PATTERNS, ...MODULE_PATTERNS]
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const re of patterns) {
      if (re.test(line)) {
        hits++
        console.log(`命中 ${rel}:${i + 1}  ${line.trim().slice(0, 120)}`)
      }
    }
  })
}

console.log(`[no-subplugin-import-check] 扫描 ${files.length} 个文件，命中 ${hits} 处。`)
process.exit(hits === 0 ? 0 : 1)
