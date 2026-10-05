// EXE-BOOT-045 · 确定性夹具 toolkit/scope——给"不得依赖本机宿主状态"的测试用。
//
// 045 刷新缘由（repair-plan §79.2 归因）：仓内 preset-patch-state.json 四笔台账钉在
// 0.1.5 时代的 npm 全局预设件上，039 换树后三件 ABSENT、liangshen 笔 sha 漂移 ⇒
// snapshot（panel/manager/snapshot.mjs presetPatchedAny）与 doctor（engine.mjs
// presetMountedFor）在真实机上一致判 compact-router「未挂载」——这是环境事实，
// 不是产品缺陷。本夹具提供一个确定性世界：与真实仓逐字节同源的扫描面（package.json/
// dsh.plugin.json/cordis.patch.yml/doctor-signals.json/lib 四卡 manifest/panel manifest）
// ＋一笔**有效**台账条目（file+patchedSha 自洽）⇒ compact-router 挂载态为真。
// 断言零放宽：测的是产品行为（挂载 ⇒ 下发 effectNote；doctor 对确定性 scope 0/0/0）。
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function shaText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// doctor/snapshot 的本体在案面 = lib/*/dsh.plugin.json（engine.mjs bodies 只认 lib/ 前缀）。
const LIB_DIRS = ['agent-memory', 'compact-router', 'rate-throttle', 'search-router']

// 夹具预设件：内容自洽即可（台账只对 sha；挂载判据不看内容语义）。
// 放在家根 .agent-presets/liangshen/ 下＝贴真实形态，且不进 scope 扫描面
// （scope 侧 .cordis.yml 会开新检查面，真实仓无此形态）。
const FIXTURE_PRESET_YAML = [
  '# fixture preset file (EXE-BOOT-045 deterministic world; content is sha-anchored only)',
  '- insert:',
  '    - id: persona-fixture',
  "      name: '@deepseek-ai/dsh-agent-preset'",
  '      config:',
  '        id: persona-fixture',
  '        order: 99',
  '        plugins:',
  '          - id: compaction',
  '            name: cordis:group',
  '            group: true',
  '            isolate:',
  '              compaction: true',
  '            config:',
  '              - id: compact-router',
  "                name: 'xiaobai-agent/compact-router'",
].join('\n') + '\n'

/** 确定性 toolkit/scope：与真实仓扫描面同源＋一笔有效台账（compact-router=mounted）。 */
export function buildFixtureToolkit({ tag = 'fx' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fixture-toolkit-' + tag + '-'))
  for (const f of ['package.json', 'dsh.plugin.json', 'cordis.patch.yml', 'doctor-signals.json']) {
    copyFileSync(join(REPO_ROOT, f), join(root, f))
  }
  // lib 四目录整树拷贝：doctor 除挂载面外还校验 manifest 的 exports 目标文件在场
  // （schema.exports-target-missing），故须连代码一起给；整树＝与真实仓 lib/** 扫描面同源。
  mkdirSync(join(root, 'lib'), { recursive: true })
  for (const d of LIB_DIRS) {
    cpSync(join(REPO_ROOT, 'lib', d), join(root, 'lib', d), { recursive: true })
  }
  // panel：manifest（toolkit-manager 行的 body 侧登记）＋其声明的两个 exports 目标。
  mkdirSync(join(root, 'panel'), { recursive: true })
  copyFileSync(join(REPO_ROOT, 'panel', 'dsh.plugin.json'), join(root, 'panel', 'dsh.plugin.json'))
  copyFileSync(join(REPO_ROOT, 'panel', 'index.js'), join(root, 'panel', 'index.js'))
  mkdirSync(join(root, 'panel', 'client'), { recursive: true })
  copyFileSync(join(REPO_ROOT, 'panel', 'client', 'panel.html'), join(root, 'panel', 'client', 'panel.html'))
  // 依赖解析面：doctor 的 pkg.missing-dependency 从 scope 根做 Node 解析、
  // pkg.resolution-outside-scope 要求 realpath 留在 scope 内——故拷贝实体而非 junction
  // （walker 对 node_modules 不入册＝与真实仓形态一致；全包 ~3MB）。
  cpSync(join(REPO_ROOT, 'node_modules', '@deepseek-ai'), join(root, 'node_modules', '@deepseek-ai'), { recursive: true })
  return { root }
}

/** 确定性家根：三根齐（configRoot/profiles/web）＋.agent-presets 夹具预设件＋热 JSON。 */
export function buildFixtureHome({ tag = 'fx' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'fixture-home-' + tag + '-'))
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  const presetDir = join(home, '.agent-presets', 'liangshen')
  mkdirSync(presetDir, { recursive: true })
  const presetFile = join(presetDir, 'agent.cordis.yml')
  writeFileSync(presetFile, FIXTURE_PRESET_YAML)
  const hotJson = join(home, 'dsh-search-router.json')
  writeFileSync(hotJson, JSON.stringify({ mode: 'auto' }, null, 2))
  return { home, presetFile, hotJson, presetSha: shaText(FIXTURE_PRESET_YAML) }
}

/** 把一笔有效台账写进 toolkit 根（file 指向家根夹具预设件）。 */
export function writeValidLedger(toolkitRoot, { presetFile, presetSha }) {
  writeFileSync(join(toolkitRoot, 'preset-patch-state.json'), JSON.stringify({
    liangshen: {
      file: presetFile,
      originalSha: presetSha,
      patchedSha: presetSha,
      patchedAt: '2026-10-05T00:00:00.000Z',
      note: 'EXE-BOOT-045 fixture: deterministic valid entry (compact-router mounted in this world)',
    },
  }, null, 2))
}
