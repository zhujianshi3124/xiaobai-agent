// S6 契约化回归（P5）：5 个存量插件的 manifest configSchema（schemastery 纯定义）
// 必须对 cordis.patch.yml 里的真实配置值校验通过（证明"补 configSchema 零行为变化"），
// 未知键必须直通保留，doctor CLI 对新增契约字段保持 0 error。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (name) => join(root, 'lib', name)

// 与 cordis.patch.yml 当前值逐字一致（bundle 层写死的激活配置）。
// ⚠ 这里是**手抄镜像**，会被下面的 S6-C4 与真文件对账（引擎列表一项）——改 patch 忘了改这里就红。
// patch 文件里**每一行 config 的类型正确性**由门禁步 `scripts/patch-config-check.mjs` 按宿主通道
// 语义校验（含真 YAML 标量解析），那条不依赖本镜像。（历史教训：cordis.patch.yml:61 一个未加引号
// 的 360 让宿主整机起不来，而当时仓内没有任何一条链路看得到它 —— 见 docs/debt.md D-16 / A#24。）
const PATCH_CONFIGS = {
  'rate-throttle': {
    enabled: false,
    throttleProviders: [],
    minIntervalMs: 3000,
    maxRequestsPerMinute: 6,
    adaptive: false,
    maxIntervalMs: 20000,
    backoffFactor: 2,
    logProviders: [],
    logPath: '',
    routing: {
      enabled: true,
      autoGroups: true,
      autoGroupTtlMs: 300000,
      excludeProviders: ['llm-deepseek', 'deepseek-official'],
      cooldownMs: 300000,
      tpmTurnSkip: true,
      tpmCooldownMs: 45000,
      downgradeContextMargin: 0.9,
      maxDowngradeCompactsPerTurn: 1,
      metricsWindowMs: 600000,
      metricsLogIntervalMs: 60000,
      clearCooldownOnUserSwitch: true,
      syncSelectionOnFailover: true,
      staticGroups: [
        { id: 'v4-pro', providers: [{ provider: 'sensenova-gateway', model: 'deepseek-v4-pro' }] },
      ],
    },
  },
  'web-search-local': { engines: ['searxng', 'google', 'duckduckgo', 'mojeek', 'bing', 'baidu'] },
  'search-router': { mode: 'auto', officialProviders: ['llm-deepseek'], officialProviderPatterns: [], officialModelPatterns: [], defaultWhenUnknown: 'local' },
  'agent-memory': { dataRoot: 'C:\\Users\\LENOVO\\.agent-memory', defaultWorkspace: null },
  'compact-router': {},
}

test('S6-C1：5 插件 manifest configSchema 对 patch 真实配置值校验全部通过（validateConfigAgainstSchema）', async () => {
  const { validateConfigAgainstSchema } = await import('@local/dsh-toolkit/contract')
  for (const [name, patchConfig] of Object.entries(PATCH_CONFIGS)) {
    const manifest = JSON.parse(readFileSync(join(lib(name), 'dsh.plugin.json'), 'utf8'))
    assert.ok(manifest.configSchema, `${name} 必须声明 configSchema`)
    const result = await validateConfigAgainstSchema(manifest.configSchema, patchConfig)
    assert.equal(result.ok, true, `${name} schema 校验失败：${JSON.stringify(result.issues)}`)
    assert.equal(result.via, 'schemastery-call', `${name} 走的是 schemastery 真校验（实际 ${result.via}）`)
  }
})

test('S6-C2：patch 配置中的 unknown 键不被 schema 吞掉（rate-throttle routing.excludeProviders）', async () => {
  const Schema = (await import('@deepseek-ai/schemastery')).default
  const manifest = JSON.parse(readFileSync(join(lib('rate-throttle'), 'dsh.plugin.json'), 'utf8'))
  const resolved = Schema(manifest.configSchema)(PATCH_CONFIGS['rate-throttle'])
  assert.deepEqual(resolved.routing.excludeProviders, ['llm-deepseek', 'deepseek-official'], 'excludeProviders 直通保留（运行时读取它）')
  assert.equal(resolved.enabled, false, '声明键的值原样保留')
})

test('S6-C3：5 个 dsh.plugin.json 的契约字段通过 contract 校验（存量字段降级为 info）', async () => {
  const { validateManifest } = await import('@local/dsh-toolkit/contract')
  for (const name of Object.keys(PATCH_CONFIGS)) {
    const manifest = JSON.parse(readFileSync(join(lib(name), 'dsh.plugin.json'), 'utf8'))
    const result = validateManifest(manifest)
    assert.equal(result.ok, true, `${name} manifest 校验：${JSON.stringify(result.errors ?? [])}`)
    assert.equal(result.manifest.contract, '^1.0')
    assert.ok(result.info.some((i) => i.path === 'manifestVersion' || i.path === 'requirements'), '存量字段以 info 容忍')
  }
})

test('S6-C4：web-search-local 引擎夹具镜像必须与 cordis.patch.yml 实际声明逐字对齐', () => {
  // 这里是**文本级**对账（拿到的是字符串清单），刻意不做类型解析——类型正确性由门禁步
  // scripts/patch-config-check.mjs 按宿主通道语义负责（它会发现 `360` 被 YAML 变成数字）。
  // 本条只防一件事：改了 patch 的引擎列表却忘了改这份手抄镜像，让 S6-C1 校验一个不存在的配置。
  const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const m = /^\s*engines:\s*\[([^\]]*)\]\s*$/m.exec(patchText)
  assert.ok(m, 'cordis.patch.yml 里应能找到一行 `engines: [...]`（flow 序列写法是本条的对账前提）')
  const fileEngines = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  assert.ok(fileEngines.length >= 1, '引擎列表不得为空（空了这个 profile 的本地搜索完全不可用）')
  assert.deepEqual(
    PATCH_CONFIGS['web-search-local'].engines, fileEngines,
    `patch 文件实际声明 ${JSON.stringify(fileEngines)} 与夹具镜像 ${JSON.stringify(PATCH_CONFIGS['web-search-local'].engines)} 不一致 ⇒ 两处必须一起改`,
  )
})
