// EXE-BOOT-046 · 账本盲区修复钉——020 命名空间双面（snapshot／doctor）blockSha 对账
//
// 045 T1 产品级发现（§80.2 候裁项）：preset-patch-state.json 的 "020" 命名空间
// （apply-preset-patch.mjs VARIANT_STATE_NS，0.2.x profile-patch 通道按 blockId 记
// blockSha）对挂载态消费者不可见——snapshot presetPatchedAny 与 doctor
// presetMountedFor 都只遍历顶层键（legacy 预设条目）。039 换树后 legacy 条目全灭
// （npm 全局预设件路径消亡），挂载态真实落在 020 通道 ⇒ 两消费者一致误判
// 「未挂载」（doctor 出 mount.body-without-row 警示＝039 后稳态假警示）。
//
// 本文件钉修法：两消费者增读 020 命名空间、按 blockSha 对账盘上覆盖块
// （profile patch 内 BEGIN/END 标记行集 sha256 === 记录 blockSha 才算挂载）。
// 断言零放宽：正向钉「legacy 死条目＋有效 020 ⇒ 挂载」，负向钉「020 sha 对不上
// ⇒ 未挂载」（不盲信账本，对账是真校验不是存在性检查）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildFixtureToolkit, buildFixtureHome, buildFixtureProfilePatch, write020Ledger } from './helpers/fixture-toolkit.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'doctor', 'cli', 'src', 'cli.mjs')

function world020(tag, { blockShaOverride } = {}) {
  const tk = buildFixtureToolkit({ tag })
  const home = buildFixtureHome({ tag })
  const patch = buildFixtureProfilePatch({ tag })
  write020Ledger(tk.root, { ...patch, blockShaOverride })
  return {
    tk, home, patch,
    cleanup: () => {
      fs.rmSync(tk.root, { recursive: true, force: true })
      fs.rmSync(home.home, { recursive: true, force: true })
      fs.rmSync(patch.profileDir, { recursive: true, force: true })
    },
  }
}

test('020 对账 · 正向：legacy 死条目＋有效 020 记录 ⇒ snapshot 判挂载（installed-unmounted 盲区消除）', async () => {
  const w = world020('l020-a')
  try {
    const { buildSnapshot } = await import('../panel/manager/snapshot.mjs')
    const snap = await buildSnapshot({ toolkitRoot: w.tk.root, hotRouterPath: w.home.hotJson })
    const card = snap.plugins.find((x) => x.dir === 'compact-router')
    assert.ok(card, 'compact-router 卡必须在快照里')
    assert.equal(card.status, 'mounted', '020 记录按 blockSha 对账成功 ⇒ 挂载（修前判 installed-unmounted）')
    // 展示面：020 条目按命名空间前缀入 map，命名空间键本身不得冒充预设 id
    assert.equal(snap.custody.presetState['020/liangshen'], true)
    assert.equal('020' in snap.custody.presetState, false, '"020" 是命名空间键，不是预设 id')
    // legacy 死条目照实为 false（039 后世界事实）
    assert.equal(snap.custody.presetState['standard'], false)
  } finally { w.cleanup() }
})

test('020 对账 · 正向：doctor 对同世界 dry-run 0/0/0（mount.body-without-row 假警示消除）', () => {
  const w = world020('l020-b')
  try {
    const out = execFileSync(process.execPath, [CLI, '--json', '--scope', w.tk.root], {
      encoding: 'utf8', maxBuffer: 1 << 26,
      env: { ...process.env, DSH_HOME: w.home.home },
    })
    const j = JSON.parse(out)
    const s = j.summary
    assert.equal(`${s.error}/${s.warning}/${s.info}`, '0/0/0', '020 对账成功 ⇒ 无 mount 警示：' + JSON.stringify(j.issues))
  } finally { w.cleanup() }
})

test('020 对账 · 负向：020 记录 blockSha 与盘上块不一致 ⇒ 两消费者一致判未挂载（不盲信账本）', async () => {
  const w = world020('l020-c', { blockShaOverride: 'f'.repeat(64) })
  try {
    const { buildSnapshot } = await import('../panel/manager/snapshot.mjs')
    const snap = await buildSnapshot({ toolkitRoot: w.tk.root, hotRouterPath: w.home.hotJson })
    const card = snap.plugins.find((x) => x.dir === 'compact-router')
    assert.equal(card.status, 'installed-unmounted', 'sha 对不上 ⇒ 本体在＋挂载不在＋无面板台账')
    assert.equal(snap.custody.presetState['020/liangshen'], false)

    let out
    try {
      out = execFileSync(process.execPath, [CLI, '--json', '--scope', w.tk.root], {
        encoding: 'utf8', maxBuffer: 1 << 26,
        env: { ...process.env, DSH_HOME: w.home.home },
      })
    } catch (e) {
      out = e.stdout // doctor 对"发现问题"exit 1（0/1/0），输出仍走 stdout
    }
    const j = JSON.parse(out)
    assert.equal(`${j.summary.error}/${j.summary.warning}/${j.summary.info}`, '0/1/0', 'doctor 恢复出 mount 警示（真警示不因修法而哑）')
    assert.ok(j.issues.some((i) => i.id === 'mount.body-without-row'), 'mount.body-without-row 在案')
  } finally { w.cleanup() }
})
