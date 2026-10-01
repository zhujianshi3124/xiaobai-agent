/**
 * 由 manifest.requires 自动合成的规则（REQ-4 规则来源之二）。
 * 一条 requires 子类目 = 一条规则；id 形如 `requires/services`。
 * 全部只读、幂等；envVar 只出存在性结论，绝不出现值。
 */

import { versionSatisfies } from 'dsh-toolkit/contract'
import type { DshSubPluginManifest, DoctorRule, HealthItem } from 'dsh-toolkit/contract'
import type { Probes } from './types.js'

function fix(summary: string, steps?: string[]) {
  return { summary, ...(steps ? { steps } : {}) }
}

export function synthesizeRules(
  manifest: DshSubPluginManifest,
  probes: Probes,
  subPluginInstalled?: (id: string) => boolean,
): DoctorRule[] {
  const requires = manifest.requires ?? {}
  const rules: DoctorRule[] = []

  // 运行时版本范围（对齐存量 doctor 的 env.node-version-mismatch / env.dsh-version-mismatch）
  rules.push({
    id: 'requires/runtime',
    description: 'node / DSH 运行时版本范围',
    check: async () => {
      const items: HealthItem[] = []
      if (requires.node) {
        if (!versionSatisfies(probes.nodeVersion(), requires.node)) {
          items.push({
            code: 'env.node-version-mismatch',
            level: 'error',
            message: `node ${probes.nodeVersion()} 不满足要求范围 ${requires.node}`,
            fix: fix('升级或切换 node 版本', [`安装满足 ${requires.node} 的 node 后重启宿主`]),
          })
        }
      }
      if (requires.dshRuntime) {
        const current = probes.dshVersion()
        if (current === undefined) {
          items.push({
            code: 'env.dsh-version-unknown',
            level: 'warn',
            message: '无法探测 DSH 运行时版本，跳过范围校验',
            fix: fix('确认宿主安装完整性'),
          })
        } else if (!versionSatisfies(current, requires.dshRuntime)) {
          items.push({
            code: 'env.dsh-version-mismatch',
            level: 'error',
            message: `DSH 运行时 ${current} 不满足要求范围 ${requires.dshRuntime}`,
            fix: fix('升级或切换 DSH 运行时', [`安装满足 ${requires.dshRuntime} 的 @deepseek-ai/dsh`]),
          })
        }
      }
      return items
    },
  })

  // 依赖服务
  rules.push({
    id: 'requires/services',
    description: 'requires.services 在当前运行时可用',
    check: async () => {
      const items: HealthItem[] = []
      for (const name of requires.services ?? []) {
        if (!probes.hasService(name)) {
          items.push({
            code: 'service-missing',
            level: 'error',
            message: `依赖的宿主服务 "${name}" 不可用`,
            fix: fix(`补齐服务 ${name}`, ['确认宿主 profile 已启用提供该服务的插件/包']),
          })
        }
      }
      return items
    },
  })

  // 依赖子插件
  rules.push({
    id: 'requires/subPlugins',
    description: 'requires.subPlugins 已安装且启用',
    check: async () => {
      const items: HealthItem[] = []
      for (const id of requires.subPlugins ?? []) {
        if (!subPluginInstalled?.(id)) {
          items.push({
            code: 'subplugin-missing',
            level: 'warn',
            message: `依赖的子插件 "${id}" 未注册或未启用`,
            fix: fix(`安装/启用子插件 ${id}`, ['在面板安装该子插件，或检查其 enabled 状态']),
          })
        }
      }
      return items
    },
  })

  // 环境变量（存在性/非空；绝不打印值）
  rules.push({
    id: 'requires/envVars',
    description: 'requires.envVars 存在且非空（只报存在性）',
    check: async () => {
      const items: HealthItem[] = []
      for (const v of requires.envVars ?? []) {
        if (!probes.hasEnv(v.key)) {
          items.push({
            code: 'env.var-missing',
            level: v.required ? 'error' : 'warn',
            message: `环境变量 ${v.key} 未设置或为空${v.required ? '（必需）' : '（可选）'}${v.describe ? '：' + v.describe : ''}`,
            fix: fix(`设置环境变量 ${v.key}`, [
              v.example ? `示例值形态：${v.example}（不要在日志中出现真实值）` : '按插件文档设置后重启宿主',
            ]),
          })
        }
      }
      return items
    },
  })

  // 二进制（存在性 + 版本下限真探测：--version 输出首个 semver 与 minVersion 比对）
  rules.push({
    id: 'requires/binaries',
    description: 'requires.binaries 存在性与版本下限',
    check: async () => {
      const items: HealthItem[] = []
      for (const b of requires.binaries ?? []) {
        if (!probes.hasBinary(b.name)) {
          items.push({
            code: 'env.binary-missing',
            level: 'error',
            message: `所需二进制 "${b.name}" 不在 PATH 中${b.describe ? '：' + b.describe : ''}`,
            fix: fix(`安装 ${b.name}`, [`安装后确认 "${b.name}" 可在命令行直接调用`]),
          })
          continue
        }
        if (b.minVersion) {
          const version = await probes.binaryVersion(b.name)
          if (version === null) {
            items.push({
              code: 'env.binary-version-unknown',
              level: 'warn',
              message: `二进制 "${b.name}" 在场但无法获取版本，跳过下限比对（要求 >= ${b.minVersion}）`,
              fix: fix(`确认 "${b.name} --version" 可执行`, ['部分工具不支持 --version 时可放宽 minVersion 声明']),
            })
          } else if (!versionSatisfies(version, '>=' + b.minVersion)) {
            items.push({
              code: 'env.binary-version-mismatch',
              level: 'error',
              message: `二进制 "${b.name}" 版本 ${version} 低于下限 ${b.minVersion}`,
              fix: fix(`升级 ${b.name} 至 >= ${b.minVersion}`, ['升级后重跑预检']),
            })
          }
        }
      }
      return items
    },
  })

  // 端口（shared 仅提示不阻断）
  rules.push({
    id: 'requires/ports',
    description: 'requires.ports 占用探测',
    check: async () => {
      const items: HealthItem[] = []
      for (const p of requires.ports ?? []) {
        const free = await probes.portFree(p.port)
        if (!free) {
          items.push({
            code: 'port-occupied',
            level: p.shared ? 'warn' : 'error',
            message: `端口 ${p.port}/${p.protocol ?? 'tcp'} 已被占用${p.shared ? '（声明为可共享，仅提示）' : ''}${p.purpose ? '：' + p.purpose : ''}`,
            fix: fix(`释放端口 ${p.port} 或调整本插件端口配置`, ['找到占用进程并停用，或修改插件 config 中的端口']),
          })
        }
      }
      return items
    },
  })

  // 文件路径
  rules.push({
    id: 'requires/fsPaths',
    description: 'requires.fsPaths 读写探测',
    check: async () => {
      const items: HealthItem[] = []
      for (const f of requires.fsPaths ?? []) {
        if (!(await probes.fsAccessible(f.path, f.access))) {
          items.push({
            code: 'fs.inaccessible',
            level: 'error',
            message: `路径 ${f.path} 不满足 ${f.access === 'rw' ? '读写' : '读'} 要求${f.purpose ? '：' + f.purpose : ''}`,
            fix: fix(`确保路径存在且权限正确`, [`创建目录或修正权限后重试`]),
          })
        }
      }
      return items
    },
  })

  // 外部 API（可达性；不可达按警告处理——网络可能瞬断）
  rules.push({
    id: 'requires/externalApis',
    description: 'requires.externalApis 可达性',
    check: async () => {
      const items: HealthItem[] = []
      for (const api of requires.externalApis ?? []) {
        if (!api.url) continue
        if (!(await probes.apiReachable(api.url))) {
          items.push({
            code: 'api.unreachable',
            level: 'warn',
            message: `外部 API "${api.name}" 当前不可达：${api.url}`,
            fix: fix('检查网络或对端服务状态', [
              '确认本机可访问该地址（浏览器/curl）',
              api.authEnv ? `确认鉴权环境变量 ${api.authEnv} 已设置（存在性，不含值）` : '检查对端服务状态',
            ]),
          })
        }
      }
      return items
    },
  })

  return rules
}
