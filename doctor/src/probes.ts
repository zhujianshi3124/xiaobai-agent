/**
 * 默认环境探测面。全部只读；envVar 只返回存在性布尔，绝不出现值（§9）。
 * 测试（S3 故障注入）可整体替换为替身。
 */

import { accessSync, constants as fsConstants } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { delimiter, join } from 'node:path'
import type { Probes } from './types.js'

export function defaultProbes(hasService: (name: string) => boolean): Probes {
  return {
    nodeVersion: () => process.versions.node ?? '0.0.0',

    dshVersion: () => {
      try {
        const require = createRequire(process.cwd() + '/')
        const pkg = require('@deepseek-ai/dsh/package.json') as { version?: string }
        return pkg?.version
      } catch {
        return undefined
      }
    },

    hasEnv: (key) => {
      const value = process.env[key]
      return typeof value === 'string' && value !== ''
    },

    hasBinary: (name) => {
      const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
      const exts = process.platform === 'win32'
        ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
        : ['']
      for (const dir of dirs) {
        for (const ext of exts) {
          try {
            accessSync(join(dir, name + ext), fsConstants.X_OK)
            return true
          } catch {
            // 继续找下一个
          }
        }
      }
      return false
    },

    portFree: (port) =>
      new Promise((resolve) => {
        const server = net.createServer()
        server.once('error', () => resolve(false))
        server.once('listening', () => server.close(() => resolve(true)))
        server.listen(port, '127.0.0.1')
      }),

    fsAccessible: async (path, access) => {
      try {
        accessSync(path, access === 'rw' ? fsConstants.W_OK | fsConstants.R_OK : fsConstants.R_OK)
        return true
      } catch {
        return false
      }
    },

    apiReachable: async (url) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3000)
        try {
          await fetch(url, { signal: controller.signal, method: 'GET', redirect: 'follow' })
          return true // 任何 HTTP 响应都算可达（4xx/5xx 是对端问题，不是环境问题）
        } finally {
          clearTimeout(timer)
        }
      } catch {
        return false
      }
    },

    hasService,
  }
}
