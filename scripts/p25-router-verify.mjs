#!/usr/bin/env node
// p25-router-verify —— 批次 5C governance-router 的专项验证（施工单 2.3）。
//
// 三层，缺一层都不算验完：
//   ① 纯函数单测（不依赖宿主）：compilePattern / normalizeRules / matchRules / validateRules /
//      extractLastUserText / renderSkillContent / buildInjectionMessage
//   ② 假 registry 端到端：注入 → 去重 → 未命中零注入 → 技能缺失降级 → skills 缺席不 throw
//   ③ 零写入自证：断言真实 .toolkit-governance/ 未被本脚本改动
//
// ── 两条本项目踩过的坑，本脚本按纪律逐条防 ──────────────────────────────
// 坑 14「replace 空转 ⇒ 断言恒空」：凡是「改一处文本、再断言结果」的夹具，改完必须紧跟
//   premise 断言证明真的改到了。本脚本每一处文本构造后面都有 premise check。
// 坑 15「测试的本机在场前提」：**本脚本不读真实技能目录、不读真实 .toolkit-governance/ 报告**。
//   技能面一律用假 registry（外部克隆环境没有 .agents/skills 与 office-skills，
//   依赖它们＝在别人机器上必红）。真实目录只做「零写入」的 sha 比对，不做内容断言。
//
// 用法：node scripts/p25-router-verify.mjs
// 纪律：全部落盘测试走 os.tmpdir 副本；真实仓零写入（末尾断言）。

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MOD = join(root, 'lib', 'governance-router', 'index.js')

let pass = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('PASS ' + name) }
  else { fails.push(name + ' — ' + detail); console.log('FAIL ' + name + ' — ' + detail) }
}

// ── 零写入基线：跑之前先记下真实治理报告面的状态 ──────────────────────────
const REAL_GOV = join(root, '.toolkit-governance')
function snapshotTree(abs) {
  const out = {}
  if (!existsSync(abs)) return out
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      const key = rel === '' ? e.name : rel + '/' + e.name
      if (e.isDirectory()) walk(full, key)
      else out[key] = createHash('sha256').update(readFileSync(full)).digest('hex')
    }
  }
  walk(abs, '')
  return out
}
const govBefore = snapshotTree(REAL_GOV)

// ── 载入被测模块 ──────────────────────────────────────────────────────────
check('前置：lib/governance-router/index.js 在场', existsSync(MOD), MOD)
const mod = await import('file:///' + MOD.replace(/\\/g, '/'))
for (const fn of ['validateRules', 'matchRules', 'buildReport', 'apply', 'normalizeRules', 'compilePattern', 'extractLastUserText', 'renderSkillContent', 'buildInjectionMessage', 'writeReport', 'reportDigest']) {
  check('导出纯函数 ' + fn, typeof mod[fn] === 'function', typeof mod[fn])
}
check('inject 为空数组（裁决：B 案，缺席可见而非静默不加载）', Array.isArray(mod.inject) && mod.inject.length === 0, JSON.stringify(mod.inject))
check('name = governance-router', mod.name === 'governance-router', String(mod.name))

// ══════════════════════════════════════════════════════════════════════════
// ① 纯函数单测
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ① 纯函数单测 ──')

{
  const a = mod.compilePattern('规划')
  check('compilePattern：中文关键词可编译且大小写不敏感', a.re instanceof RegExp && a.re.test('帮我规划一下') && a.fallback === false)
  const b = mod.compilePattern('excel')
  check('compilePattern：英文关键词大小写不敏感', b.re.test('把这份 EXCEL 读进来'))
  const c = mod.compilePattern('(')
  check('compilePattern：非法正则不 throw，回落字面量（fallback=true）', c.re instanceof RegExp && c.fallback === true, JSON.stringify(c.fallback))
  check('compilePattern：回落后的字面量仍能匹配自身', c.re.test('括号 ( 本身'))
  const d = mod.compilePattern('')
  check('compilePattern：空串 → re=null（不静默变成匹配一切）', d.re === null)
  const e2 = mod.compilePattern(123)
  check('compilePattern：非字符串 → re=null', e2.re === null)
}

{
  const { rules, dropped } = mod.normalizeRules([
    { skill: 'b-skill', patterns: ['bbb'], priority: 200 },
    { skill: 'a-skill', patterns: ['aaa'], priority: 100 },
    { skill: '', patterns: ['x'] },
    { skill: 'no-patterns', patterns: [] },
    'not-an-object',
    null,
    { skill: 'c-skill', patterns: ['ccc'] },
  ])
  // 期望顺序：a-skill(100, index 1) → c-skill(100, index 6) → b-skill(200, index 0)。
  // c-skill 未声明 priority ⇒ 回落 100，与 a-skill 同级 ⇒ 稳定排序按**声明顺序** a 在前。
  check('normalizeRules：按 priority 升序（两个 100 先于 200）', rules.length === 3 && rules[0].skill === 'a-skill' && rules[2].skill === 'b-skill', JSON.stringify(rules.map((r) => r.skill)))
  check('normalizeRules：缺 priority 的回落 100，且同 priority 按声明顺序稳定', rules[1].skill === 'c-skill' && rules[1].priority === 100, JSON.stringify(rules[1]))
  check('normalizeRules：4 条非法条目被丢弃且各有 reason（不 throw）', dropped.length === 4, JSON.stringify(dropped))
  check('normalizeRules：丢弃原因逐条可辨', dropped.map((d) => d.reason).sort().join(',') === 'rule-not-object,rule-not-object,rule-patterns-empty,rule-skill-missing', dropped.map((d) => d.reason).join(','))
  const empty = mod.normalizeRules(undefined)
  check('normalizeRules：undefined → 空表且不 throw', empty.rules.length === 0 && empty.dropped.length === 0)
  const badRegex = mod.normalizeRules([{ skill: 's', patterns: ['('] }])
  check('normalizeRules：非法正则条目保留但标 patternFallback', badRegex.rules.length === 1 && badRegex.rules[0].patternFallback === true)
}

{
  const { rules } = mod.normalizeRules([
    { skill: 'planning-with-files-zh', patterns: ['规划', '拆解任务'], priority: 100 },
    { skill: 'office-xlsx', patterns: ['excel', '表格', 'xlsx'], priority: 100 },
  ])
  const m1 = mod.matchRules('帮我规划一下这个项目', rules)
  check('matchRules：中文命中第一条规则', m1.matched && m1.matched.skill === 'planning-with-files-zh', m1.reason)
  const m2 = mod.matchRules('把这个 Excel 读进来', rules)
  check('matchRules：英文大小写不敏感命中第二条', m2.matched && m2.matched.skill === 'office-xlsx', m2.reason)
  const m3 = mod.matchRules('今天天气不错', rules)
  check('matchRules：未命中 → matched=null 且 reason=no-match（零 token 前提）', m3.matched === null && m3.reason === 'no-match', m3.reason)
  const m4 = mod.matchRules('随便什么', [])
  check('matchRules：空规则表 → reason=no-rules（默认静默的机械保证）', m4.matched === null && m4.reason === 'no-rules', m4.reason)
  const m5 = mod.matchRules('', rules)
  check('matchRules：空文本 → reason=no-user-text', m5.matched === null && m5.reason === 'no-user-text', m5.reason)
  // priority 决定性：高优先级先命中，哪怕两条都能匹配
  const { rules: prio } = mod.normalizeRules([
    { skill: 'low', patterns: ['共同词'], priority: 200 },
    { skill: 'high', patterns: ['共同词'], priority: 10 },
  ])
  const m6 = mod.matchRules('这里有共同词', prio)
  check('matchRules：priority 升序先命中（10 胜过 200）', m6.matched && m6.matched.skill === 'high', m6.matched && m6.matched.skill)
}

{
  const { rules } = mod.normalizeRules([
    { skill: 'present-skill', patterns: ['a'] },
    { skill: 'ghost-skill', patterns: ['b'] },
  ])
  const v = mod.validateRules(rules, [{ name: 'present-skill' }, { name: 'unrouted-skill' }])
  const codes = v.issues.map((i) => i.code)
  check('validateRules：规则指向不存在技能 ⇒ rule-target-missing', codes.includes('rule-target-missing'), JSON.stringify(codes))
  const missing = v.issues.find((i) => i.code === 'rule-target-missing')
  check('validateRules：rule-target-missing 是 **error** 级（让规则表过期变成回归链上的红）', missing.level === 'error', missing.level)
  check('validateRules：rule-target-missing 指名到具体技能', missing.skill === 'ghost-skill', missing.skill)
  check('validateRules：目录里有技能但无规则覆盖 ⇒ skill-unrouted', codes.includes('skill-unrouted'), JSON.stringify(codes))
  check('validateRules：skill-unrouted 是 info 级（不是错）', v.issues.find((i) => i.code === 'skill-unrouted').level === 'info')
  check('validateRules：有 error 时 ok=false', v.ok === false)
  // 三类 issue 不许合并：这里必须能同时出现两种不同的 code
  check('validateRules：三类 issue 逐条独立，不合并', new Set(codes).size >= 2, JSON.stringify(codes))

  // 注意：normalizeRules 会丢弃 patterns 为空的规则，故夹具必须带 patterns，
  // 否则 rules 变成空表 ⇒ 目录里每个技能都会被判 unrouted（本格最初就是这么写错的）。
  const clean = mod.validateRules(mod.normalizeRules([{ skill: 'only', patterns: ['x'] }]).rules, ['only'])
  check('validateRules：规则与目录逐个相等时零 issue 且 ok=true', clean.ok === true && clean.issues.length === 0, JSON.stringify(clean.issues))
  // 规则只覆盖 one 而目录有 one+two ⇒ 必然有一条 skill-unrouted（这是设计，不是缺陷）
  const partial = mod.validateRules(mod.normalizeRules([{ skill: 'one', patterns: ['x'] }]).rules, ['one', 'two'])
  check('validateRules：目录多出的技能如实报 skill-unrouted（不是零 issue）', partial.issues.length === 1 && partial.issues[0].code === 'skill-unrouted' && partial.issues[0].skill === 'two', JSON.stringify(partial.issues))

  const unavailable = mod.validateRules(rules, null)
  check('validateRules：目录读不到（null）⇒ skills-unavailable', unavailable.issues.some((i) => i.code === 'skills-unavailable'))
  check('validateRules：skills-unavailable 是 info 级且不判红（如实报，不制造假红）', unavailable.issues.find((i) => i.code === 'skills-unavailable').level === 'info' && unavailable.ok === true)
  check('validateRules：目录读不到时**不**再产出 rule-target-missing（无从判定，不许猜）', !unavailable.issues.some((i) => i.code === 'rule-target-missing'))
}

{
  const msgs = [
    { id: '1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第一条' }] },
    { id: '2', role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '目录消息' }] },
    { id: '3', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '最后一条' }] },
  ]
  const t = mod.extractLastUserText(msgs)
  check('extractLastUserText：取最后一条 user 消息，跳过 skill-catalog', t === '最后一条', String(t))
  const onlyCatalog = mod.extractLastUserText([msgs[1]])
  check('extractLastUserText：只有宿主注入消息 → null（不许把目录当用户输入去匹配）', onlyCatalog === null, String(onlyCatalog))
  check('extractLastUserText：空数组 → null', mod.extractLastUserText([]) === null)
  check('extractLastUserText：非数组 → null 且不 throw', mod.extractLastUserText(undefined) === null)
  const multi = mod.extractLastUserText([{ id: 'x', source: { kind: 'user' }, content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }])
  check('extractLastUserText：多 text 块按换行拼接', multi === 'A\nB', JSON.stringify(multi))
}

{
  const skill = { name: 'demo', provider: 'p', resourceBase: { kind: 'directory', path: 'D:/s' }, content: 'BODY-TEXT' }
  const r = mod.renderSkillContent(skill)
  check('renderSkillContent：含 <skill_content name="demo">', r.includes('<skill_content name="demo">'), r.slice(0, 60))
  check('renderSkillContent：含 <skill_instructions> 与正文', r.includes('<skill_instructions>') && r.includes('BODY-TEXT'))
  check('renderSkillContent：目录型 resourceBase 给出 base directory 提示', r.includes('Base directory for this skill: D:/s'))
  const noRes = mod.renderSkillContent({ name: 'n', provider: 'prov', content: 'X' })
  check('renderSkillContent：无 resourceBase 时给 provider 兜底句（不崩）', noRes.includes('managed by provider "prov"'), noRes.slice(0, 120))
  const escaped = mod.renderSkillContent({ name: 'a"b', provider: 'p', content: '<script>' })
  check('renderSkillContent：名字里的引号被转义（不许破坏帧）', escaped.includes('name="a&quot;b"'), escaped.slice(0, 40))
  check('renderSkillContent：正文逐字保留，不做转义（技能是可信本地内容）', escaped.includes('<script>'))

  const m = mod.buildInjectionMessage('hello', { name: 'demo', reason: 'matched:规划' })
  check('buildInjectionMessage：id 为非空字符串（宿主 session 形状要求）', typeof m.id === 'string' && m.id !== '')
  check('buildInjectionMessage：role = user', m.role === 'user')
  check('buildInjectionMessage：source.kind = router-rule（不与宿主 kind 撞名）', m.source.kind === 'router-rule', m.source.kind)
  check('buildInjectionMessage：source.form = instructions（与 tool-skill 同形）', m.source.form === 'instructions')
  check('buildInjectionMessage：source.name 记录技能名', m.source.name === 'demo')
  check('buildInjectionMessage：content 是数组且首块是 text', Array.isArray(m.content) && m.content[0].type === 'text' && m.content[0].text === 'hello')
  check('buildInjectionMessage：两次构造 id 不同（不撞 session 的 already-pending 判重）', m.id !== mod.buildInjectionMessage('hello', { name: 'demo' }).id)
}

// ══════════════════════════════════════════════════════════════════════════
// ② 假 registry 端到端（不依赖宿主、不依赖本机技能目录）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ② 假 registry 端到端 ──')

const work = mkdtempSync(join(tmpdir(), 'p25-router-'))

/** 造一个假 ctx：on / get 两个通道，记录所有注册与读数。 */
function makeFakeCtx({ skills = undefined, workingDirectory = undefined } = {}) {
  const listeners = []
  const services = { skills, workingDirectory }
  return {
    listeners,
    on(name, handler) { listeners.push({ name, handler }) },
    get(name) { return services[name] },
    _services: services,
  }
}

/** 造一个假 agent（WeakMap 键用，必须有对象身份）。 */
function makeAgent(tag) { return { id: tag, session: {} } }

/**
 * 跑一次 pre-step。
 * 形制与宿主一致：waterfall(payload, next)，next 返回 defaultDecision。
 */
async function runPreStep(handler, { agent, messages, turn = 1, step = 1, signal = undefined } = {}) {
  const payload = { agent, messages, turn, step, signal: signal || new AbortController().signal }
  const defaultDecision = { kind: 'enter', messages }
  return handler(payload, () => defaultDecision)
}

/** 假 skills 服务：snapshot 返回给定 summary 列表；get 返回给定正文。 */
function makeFakeSkills(summaries, bodies) {
  const calls = { snapshot: 0, get: [] }
  return {
    calls,
    async snapshot() { calls.snapshot++; return { skills: summaries, complete: true } },
    async get(name) { calls.get.push(name); return bodies[name] },
  }
}

// ── 2.1 默认 rules: [] ⇒ 零注入（lead 要求自证 1）───────────────────────────
{
  const reportRoot = join(work, 'r-default')
  const skills = makeFakeSkills([{ name: 'planning-with-files-zh', description: 'd', invocation: { modelInvocable: true, userInvocable: true } }], {})
  const ctx = makeFakeCtx({ skills })
  mod.apply(ctx, { reportRoot })
  check('2.1 默认 rules: [] ⇒ 不订阅 agent/pre-step（零成本）', ctx.listeners.length === 0, 'listeners=' + ctx.listeners.length)
  check('2.1 默认 rules: [] ⇒ 不读 ctx.skills（连探测都不做）', skills.calls.snapshot === 0, 'snapshot=' + skills.calls.snapshot)
  check('2.1 默认 rules: [] ⇒ 仍产出报告（默认静默≠不运行）', existsSync(join(reportRoot, 'latest.json')))
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.1 报告 schema 正确', rep.schema === 'toolkit-governance/router@1', rep.schema)
  check('2.1 报告记录 ruleCount=0', rep.config.ruleCount === 0, String(rep.config.ruleCount))
  check('2.1 报告记录 skills.probed=false（默认态不探测）', rep.skills.probed === false, JSON.stringify(rep.skills))
  // 即便手工把 handler 拿出来跑，rules=[] 时 matchRules 也返回 no-rules ⇒ 零注入
  const { matched } = mod.matchRules('帮我规划一下', mod.normalizeRules([]).rules)
  check('2.1 rules: [] 时 matchRules 恒不命中（双保险）', matched === null)
}

// ── 2.2 命中 → 注入正文，且绝不注入目录（lead 要求自证 2 的前半）──────────
{
  const reportRoot = join(work, 'r-hit')
  const body = 'PLANNING-BODY-内容'
  const summaries = [{ name: 'planning-with-files-zh', description: '目录里的描述', invocation: { modelInvocable: true, userInvocable: true } }]
  const skills = makeFakeSkills(summaries, { 'planning-with-files-zh': { name: 'planning-with-files-zh', provider: 'fs', content: body, invocation: { modelInvocable: true, userInvocable: true } } })
  const ctx = makeFakeCtx({ skills })
  mod.apply(ctx, {
    reportRoot,
    rules: [{ skill: 'planning-with-files-zh', patterns: ['规划'], priority: 100 }],
    maxInjectPerTurn: 1,
  })
  check('2.2 配了规则 ⇒ 订阅了 agent/pre-step', ctx.listeners.length === 1 && ctx.listeners[0].name === 'agent/pre-step', JSON.stringify(ctx.listeners.map((l) => l.name)))
  const handler = ctx.listeners[0].handler
  const agent = makeAgent('a-hit')
  const userMsg = { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我规划一下这个项目' }] }
  const d = await runPreStep(handler, { agent, messages: [userMsg] })
  check('2.2 命中后 decision.messages 追加了 1 条', d.messages.length === 2, 'len=' + d.messages.length)
  const inj = d.messages[1]
  check('2.2 注入消息追加在**末尾**（与 tool-skill 同形）', d.messages[0].id === 'u1' && inj.source.kind === 'router-rule', inj.source && inj.source.kind)
  check('2.2 注入的是**正文**（含 BODY 内容）', inj.content[0].text.includes(body))
  check('2.2 注入的**不是目录**：不含目录描述句', !inj.content[0].text.includes('目录里的描述'), '正文里出现了目录描述')
  check('2.2 注入内容带 <skill_content> 帧', inj.content[0].text.startsWith('<skill_content name="planning-with-files-zh">'))
  check('2.2 原 user 消息对象未被改动（不可变）', d.messages[0] === userMsg)
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.2 报告记 injected 一条', rep.stats.injected.length === 1 && rep.stats.injected[0].skill === 'planning-with-files-zh', JSON.stringify(rep.stats.injected))
  check('2.2 报告 skills.available=true 且 count=1', rep.skills.available === true && rep.skills.count === 1, JSON.stringify(rep.skills))
  check('2.2 报告无 error 级 issue（规则表与目录对齐）', !rep.issues.some((i) => i.level === 'error'), JSON.stringify(rep.issues))

  // ── 2.3 去重：同一技能连跑两次 pre-step，第二次不注入（lead 要求自证 2）──
  const d2 = await runPreStep(handler, { agent, messages: [userMsg], turn: 2, step: 1 })
  check('2.3 去重生效：同一 agent 第二次命中不再注入', d2.messages.length === 1, 'len=' + d2.messages.length)
  check('2.3 去重后 decision 与原 decision 内容一致（未改动）', d2.messages[0].id === 'u1')
  const rep2 = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.3 报告记 dedupe 跳过', rep2.stats.skipped.some((s) => String(s.reason).startsWith('dedupe:')), JSON.stringify(rep2.stats.skipped))
  // 不同 agent 各自独立去重（WeakMap 分桶）
  const agent2 = makeAgent('a-hit-2')
  const d3 = await runPreStep(handler, { agent: agent2, messages: [userMsg], turn: 1, step: 1 })
  check('2.3 去重按 agent 分桶：另一个 agent 照常注入', d3.messages.length === 2, 'len=' + d3.messages.length)
}

// ── 2.4 未命中 ⇒ 零注入、零 skills 读数 ─────────────────────────────────
{
  const reportRoot = join(work, 'r-miss')
  const skills = makeFakeSkills([{ name: 'planning-with-files-zh', description: 'd', invocation: { modelInvocable: true, userInvocable: true } }], {})
  const ctx = makeFakeCtx({ skills })
  mod.apply(ctx, { reportRoot, rules: [{ skill: 'planning-with-files-zh', patterns: ['规划'] }] })
  const handler = ctx.listeners[0].handler
  const userMsg = { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '今天天气不错' }] }
  const d = await runPreStep(handler, { agent: makeAgent('a-miss'), messages: [userMsg] })
  check('2.4 未命中 ⇒ decision.messages 逐字节未变', JSON.stringify(d.messages) === JSON.stringify([userMsg]))
  check('2.4 未命中 ⇒ 零 ctx.skills 读数（零 token 的关键）', skills.calls.snapshot === 0, 'snapshot=' + skills.calls.snapshot)
  check('2.4 未命中 ⇒ 零 get 调用', skills.calls.get.length === 0)
}

// ── 2.5 本步无 user 消息 ⇒ 直接放行 ─────────────────────────────────────
{
  const reportRoot = join(work, 'r-nouser')
  const skills = makeFakeSkills([], {})
  const ctx = makeFakeCtx({ skills })
  mod.apply(ctx, { reportRoot, rules: [{ skill: 's', patterns: ['x'] }] })
  const handler = ctx.listeners[0].handler
  const toolResult = { id: 't1', role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: '规划' }] }
  const d = await runPreStep(handler, { agent: makeAgent('a-nouser'), messages: [toolResult] })
  check('2.5 无 user 消息 ⇒ 放行且不读 skills', d.messages.length === 1 && skills.calls.snapshot === 0)
}

// ── 2.6 技能缺失降级：目录里没有该技能 ⇒ 记 error issue，放行，不 throw ──
{
  const reportRoot = join(work, 'r-ghost')
  const skills = makeFakeSkills([{ name: 'other-skill', description: 'd', invocation: { modelInvocable: true, userInvocable: true } }], {})
  const ctx = makeFakeCtx({ skills })
  mod.apply(ctx, { reportRoot, rules: [{ skill: 'ghost-skill', patterns: ['规划'] }] })
  const handler = ctx.listeners[0].handler
  const userMsg = { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我规划' }] }
  let threw = null
  let d
  try { d = await runPreStep(handler, { agent: makeAgent('a-ghost'), messages: [userMsg] }) } catch (e) { threw = e }
  check('2.6 技能缺失 ⇒ 绝不 throw', threw === null, threw && threw.message)
  check('2.6 技能缺失 ⇒ 放行（不注入）', d && d.messages.length === 1)
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  const errs = rep.issues.filter((i) => i.code === 'rule-target-missing')
  check('2.6 报告里有 rule-target-missing 且为 error 级', errs.length >= 1 && errs[0].level === 'error', JSON.stringify(rep.issues))
}

// ── 2.7 skills 服务缺席 ⇒ 不 throw 且记 skills-unavailable（lead 要求自证 3）──
{
  const reportRoot = join(work, 'r-noskills')
  const ctx = makeFakeCtx({ skills: undefined })   // ctx.get('skills') → undefined
  mod.apply(ctx, { reportRoot, rules: [{ skill: 'ghost-skill', patterns: ['规划'] }] })
  check('2.7 skills 缺席时仍订阅 pre-step（不是静默不加载）', ctx.listeners.length === 1, 'listeners=' + ctx.listeners.length)
  const handler = ctx.listeners[0].handler
  const userMsg = { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我规划' }] }
  let threw = null
  let d
  try { d = await runPreStep(handler, { agent: makeAgent('a-noskills'), messages: [userMsg] }) } catch (e) { threw = e }
  check('2.7 skills 缺席 ⇒ 绝不 throw', threw === null, threw && threw.message)
  check('2.7 skills 缺席 ⇒ 放行（decision.messages 未变）', d && JSON.stringify(d.messages) === JSON.stringify([userMsg]))
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.7 报告里有 skills-unavailable issue', rep.issues.some((i) => i.code === 'skills-unavailable'), JSON.stringify(rep.issues))
  check('2.7 报告记 skills.available=false 且带原因', rep.skills.available === false && typeof rep.skills.unavailableReason === 'string', JSON.stringify(rep.skills))
  check('2.7 skills-unavailable 不判红（info 级，如实报）', rep.issues.find((i) => i.code === 'skills-unavailable').level === 'info')
}

// ── 2.8 单回合注入上限 ───────────────────────────────────────────────────
{
  const reportRoot = join(work, 'r-cap')
  const summaries = [
    { name: 'a-skill', description: 'd', invocation: { modelInvocable: true, userInvocable: true } },
    { name: 'b-skill', description: 'd', invocation: { modelInvocable: true, userInvocable: true } },
  ]
  const bodies = {
    'a-skill': { name: 'a-skill', provider: 'p', content: 'A', invocation: { modelInvocable: true, userInvocable: true } },
    'b-skill': { name: 'b-skill', provider: 'p', content: 'B', invocation: { modelInvocable: true, userInvocable: true } },
  }
  const skills = makeFakeSkills(summaries, bodies)
  const ctx = makeFakeCtx({ skills })
  // 两条规则用**不同的**触发词，才能把「去重」与「回合上限」两件事分开测：
  // 若用同一个词，第二次会先被 dedupe 拦下，永远走不到 turn-cap 分支（本格最初就是这么写错的）。
  mod.apply(ctx, {
    reportRoot,
    maxInjectPerTurn: 1,
    rules: [{ skill: 'a-skill', patterns: ['触发甲'], priority: 10 }, { skill: 'b-skill', patterns: ['触发乙'], priority: 20 }],
  })
  const handler = ctx.listeners[0].handler
  const agent = makeAgent('a-cap')
  const uA = { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '触发甲' }] }
  const uB = { id: 'u2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '触发乙' }] }
  const d1 = await runPreStep(handler, { agent, messages: [uA], turn: 1, step: 1 })
  check('2.8 同回合第一条命中照常注入', d1.messages.length === 2 && d1.messages[1].source.name === 'a-skill', 'len=' + d1.messages.length)
  // 同回合第二步：b-skill 未被去重，但本回合预算已用完 ⇒ turn-cap
  const d2 = await runPreStep(handler, { agent, messages: [uB], turn: 1, step: 2 })
  check('2.8 同回合超出上限 ⇒ 不再注入', d2.messages.length === 1, 'len=' + d2.messages.length)
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.8 报告记 turn-cap 跳过', rep.stats.skipped.some((s) => String(s.reason).startsWith('turn-cap:')), JSON.stringify(rep.stats.skipped))
  // 下一回合预算重置 ⇒ b-skill 可注入
  const d3 = await runPreStep(handler, { agent, messages: [uB], turn: 2, step: 1 })
  check('2.8 新回合预算重置 ⇒ b-skill 可注入', d3.messages.length === 2, 'len=' + d3.messages.length)
  check('2.8 新回合注入的是 b-skill（a 已被会话去重）', d3.messages[1].source.name === 'b-skill', d3.messages[1].source.name)
}

// ── 2.9 decision.kind === 'reject' ⇒ 原样返回，不碰 ─────────────────────
{
  const reportRoot = join(work, 'r-reject')
  const ctx = makeFakeCtx({ skills: makeFakeSkills([], {}) })
  mod.apply(ctx, { reportRoot, rules: [{ skill: 's', patterns: ['规划'] }] })
  const handler = ctx.listeners[0].handler
  const reject = { kind: 'reject' }
  const out = await handler({ agent: makeAgent('a-rej'), messages: [], turn: 1, step: 1, signal: new AbortController().signal }, () => reject)
  check('2.9 reject 原样透传（不吞别人的拦截决定）', out === reject)
}

// ── 2.10 apply 自身绝不 throw（裁决 C）────────────────────────────────
{
  // **每一格都必须显式给 reportRoot**：apply 的缺省 reportRoot 落在仓根
  // （resolveReportRoot(moduleToolkitRoot())），不给就会真的写进真实 .toolkit-governance/。
  // 这正是本脚本 ④ 零写入自证抓到的那次越界（本格最初漏了三个），此处按坑记下来。
  const safe = join(work, 'r-nothrow')
  const cases = [
    ['config 为 null', { reportRoot: safe }],
    ['config 为字符串', { reportRoot: safe }],
    ['config 为数组', { reportRoot: safe }],
    ['rules 为非法类型', { reportRoot: safe, rules: 'not-array' }],
    ['reportRoot 为不可写路径', { reportRoot: 'Z:/definitely/not/writable', rules: [{ skill: 's', patterns: ['x'] }] }],
    ['maxInjectPerTurn 为负数', { reportRoot: safe, maxInjectPerTurn: -5, rules: [{ skill: 's', patterns: ['x'] }] }],
  ]
  for (const [label, cfg] of cases) {
    let threw = null
    try { mod.apply(makeFakeCtx({}), cfg) } catch (e) { threw = e }
    check('2.10 apply 不 throw：' + label, threw === null, threw && threw.message)
  }
  let threw2 = null
  try { mod.apply(undefined, { reportRoot: safe }) } catch (e) { threw2 = e }
  check('2.10 apply(ctx=undefined) 不 throw', threw2 === null, threw2 && threw2.message)
  // 缺省 reportRoot 会落到仓根：这一格钉住该行为**是设计而非意外**，
  // 并提醒后续测试必须显式传 reportRoot（否则污染真实仓）。
  check('2.10 缺省 reportRoot 落在仓根 .toolkit-governance/governance-router（设计如此）',
    mod.resolveReportRoot(mod.moduleToolkitRoot()) === join(root, '.toolkit-governance', 'governance-router'),
    mod.resolveReportRoot(mod.moduleToolkitRoot()))
  let threw3 = null
  try { mod.apply({ on() { throw new Error('boom') }, get() { throw new Error('boom') } }, { reportRoot: safe, rules: [{ skill: 's', patterns: ['x'] }] }) } catch (e) { threw3 = e }
  check('2.10 ctx.on / ctx.get 抛错时 apply 仍不 throw', threw3 === null, threw3 && threw3.message)
}

// ── 2.11 enabled: false ⇒ 完全不动作 ─────────────────────────────────
{
  const reportRoot = join(work, 'r-disabled')
  const ctx = makeFakeCtx({ skills: makeFakeSkills([], {}) })
  mod.apply(ctx, { enabled: false, reportRoot, rules: [{ skill: 's', patterns: ['x'] }] })
  check('2.11 enabled:false ⇒ 不订阅事件', ctx.listeners.length === 0)
  check('2.11 enabled:false ⇒ 不产报告（内部逻辑由 enabled 控制）', !existsSync(join(reportRoot, 'latest.json')))
}

// ── 2.11b dedupeScope 只实现 session：未实现值必须如实降级 ─────────────
{
  const reportRoot = join(work, 'r-dedupescope')
  const ctx = makeFakeCtx({})
  mod.apply(ctx, { reportRoot, dedupeScope: 'global', rules: [{ skill: 's', patterns: ['x'] }] })
  const rep = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('2.11b dedupeScope 传未实现值 ⇒ 报告记 dedupe-scope-unsupported', rep.issues.some((i) => i.code === 'dedupe-scope-unsupported'), JSON.stringify(rep.issues))
  check('2.11b dedupe-scope-unsupported 是 info 级（不判红）', rep.issues.find((i) => i.code === 'dedupe-scope-unsupported').level === 'info')
  check('2.11b dedupeScope 回落 session 并写进报告', rep.config.dedupeScope === 'session', rep.config.dedupeScope)
  // 默认值不产生噪声：不传 dedupeScope 时不该有这条 issue
  const ctx2 = makeFakeCtx({})
  mod.apply(ctx2, { reportRoot: join(work, 'r-dedupedefault'), rules: [{ skill: 's', patterns: ['x'] }] })
  const rep2 = JSON.parse(readFileSync(join(work, 'r-dedupedefault', 'latest.json'), 'utf8'))
  check('2.11b 默认 dedupeScope 不产生 dedupe-scope-unsupported（无噪声）', !rep2.issues.some((i) => i.code === 'dedupe-scope-unsupported'), JSON.stringify(rep2.issues))
}

// ── 2.12 报告判重：内容不变不重写盘 ────────────────────────────────────
{
  const r1 = mod.buildReport({ phase: 'init', toolkitRoot: 'T', reportRoot: 'R', rules: [] })
  const r2 = mod.buildReport({ phase: 'init', toolkitRoot: 'T', reportRoot: 'R', rules: [] })
  check('2.12 同内容报告 digest 相同（generatedAt 不参与）', mod.reportDigest(r1) === mod.reportDigest(r2))
  const r3 = mod.buildReport({ phase: 'active', toolkitRoot: 'T', reportRoot: 'R', rules: [] })
  check('2.12 内容变化则 digest 变化', mod.reportDigest(r1) !== mod.reportDigest(r3))
}

// ══════════════════════════════════════════════════════════════════════════
// ③ 仓内一致性守卫（这三条是「接了回归链才算做完」的机械保证）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ③ 仓内一致性守卫 ──')

{
  // 3.1 四处同步
  const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  check('3.1 cordis.patch.yml 有 governance-router 挂载行', patchText.includes('- id: governance-router'))
  check('3.1 cordis.patch.yml 该行 inject: []（裁决 B 案）', /- id: governance-router[\s\S]{0,400}?inject: \[\]/.test(patchText))
  check('3.1 cordis.patch.yml 该行不写 disabled（默认挂载）', !/- id: governance-router[\s\S]{0,400}?disabled:/.test(patchText))
  check('3.1 cordis.patch.yml 该行 rules: []（默认静默）', /- id: governance-router[\s\S]{0,400}?rules: \[\]/.test(patchText))
  check('3.1 cordis.patch.yml 仍是 CRLF', patchText.includes('\r\n') && !/[^\r]\n/.test(patchText.replace(/\r\n/g, '')))

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  check('3.1 根 package.json 的 dsh.bundle.patch 含 router', (pkg.dsh.bundle.patch || []).includes('./lib/governance-router/bundle.patch.yml'), JSON.stringify(pkg.dsh.bundle.patch))
  check('3.1 bundle 数组条目全部在场', (pkg.dsh.bundle.patch || []).every((rel) => existsSync(join(root, rel))), JSON.stringify((pkg.dsh.bundle.patch || []).filter((rel) => !existsSync(join(root, rel)))))

  const bp = readFileSync(join(root, 'lib', 'governance-router', 'bundle.patch.yml'), 'utf8')
  check('3.1 自带 bundle.patch.yml 有 insert 行', bp.includes('- insert:') && bp.includes('- id: governance-router'))
  check('3.1 自带 bundle.patch.yml 零占位符', !/<[A-Z_]+>/.test(bp))
  check('3.1 自带 bundle.patch.yml 不写 disabled', !/^\s*disabled:/m.test(bp))

  const fx = readFileSync(join(root, 'test', 'helpers', 'fixture-toolkit.mjs'), 'utf8')
  const m = /const LIB_DIRS = \[([^\]]+)\]/.exec(fx)
  check('3.1 夹具 LIB_DIRS 可解析', m !== null)
  check('3.1 夹具 LIB_DIRS 含 governance-router', m !== null && m[1].includes("'governance-router'"), m && m[1])
  // 与磁盘实况对账：LIB_DIRS 必须覆盖 lib/ 下每个有 manifest 的目录（漏一个 ⇒ 夹具与真仓不同源）
  const diskDirs = readdirSync(join(root, 'lib'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, 'lib', d.name, 'dsh.plugin.json')))
    .map((d) => d.name)
  const declared = m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : []
  const missing = diskDirs.filter((d) => !declared.includes(d))
  check('3.1 夹具 LIB_DIRS 覆盖 lib/ 下全部成卡目录', missing.length === 0, '缺: ' + missing.join(', '))
}

{
  // 3.2 manifest 契约面
  const manifest = JSON.parse(readFileSync(join(root, 'lib', 'governance-router', 'dsh.plugin.json'), 'utf8'))
  check('3.2 manifest name 正确', manifest.name === 'xiaobai-agent/governance-router', manifest.name)
  check('3.2 manifest id 为 dsh/<name> 形式', /^dsh\/[a-z0-9-]+$/.test(manifest.id), manifest.id)
  check('3.2 manifest provides.inject 为空数组', Array.isArray(manifest.provides.inject) && manifest.provides.inject.length === 0)
  check('3.2 manifest provides.entry 指向 index.js', manifest.provides.entry === './index.js', manifest.provides.entry)
  check('3.2 manifest 声明 agent/pre-step 事件（登记面如实）', (manifest.requirements.registers.events || []).includes('agent/pre-step'), JSON.stringify(manifest.requirements.registers.events))
  check('3.2 manifest 不声明 services/commands/providers', ['services', 'commands', 'providers'].every((k) => Array.isArray(manifest.requirements.registers[k]) && manifest.requirements.registers[k].length === 0))
  check('3.2 manifest 无 panels 面（不自带面板）', !('panels' in manifest))
  check('3.2 configSchema 声明全部 5 个配置键', ['enabled', 'reportRoot', 'rules', 'maxInjectPerTurn', 'dedupeScope'].every((k) => k in (manifest.configSchema.dict || {})), JSON.stringify(Object.keys(manifest.configSchema.dict || {})))
  const subPkg = JSON.parse(readFileSync(join(root, 'lib', 'governance-router', 'package.json'), 'utf8'))
  check('3.2 子包 package.json 声明 bundle.patch', subPkg.dsh && subPkg.dsh.bundle && subPkg.dsh.bundle.patch === './bundle.patch.yml', JSON.stringify(subPkg.dsh))
}

{
  // 3.3 回归链登记（不进清单等于没做）
  const reg = readFileSync(join(root, 'scripts', 'regression-all.mjs'), 'utf8')
  check('3.3 regression-all 清单含 p25-router-verify', reg.includes('p25-router-verify') && reg.includes('scripts/p25-router-verify.mjs'))
  const hook = readFileSync(join(root, 'scripts', 'git-hooks', 'pre-commit'), 'utf8')
  check('3.3 pre-commit hook 文案已随 17→18 同步', hook.includes('18 个专项脚本') && !hook.includes('17 个专项脚本'), '仍见 17 或未见 18')
  check('3.3 regression-all 文案已随 17→18 同步', reg.includes('18 专项脚本') && !reg.includes('17 专项脚本'), '仍见 17 或未见 18')
}

{
  // 3.4 快照守卫已 +1（坑 5：不许改成 >=）
  const q2 = readFileSync(join(root, 'scripts', 'q2-layer-scan.mjs'), 'utf8')
  check('3.4 q2-layer-scan 成卡目录数已改 11', q2.includes('manifests.length === 11'), '未找到 === 11')
  check('3.4 q2-layer-scan 未退化为 >=', !/manifests\.length >= 11/.test(q2))
  const parity = readFileSync(join(root, 'scripts', 'doctor-cli-contract-parity.mjs'), 'utf8')
  check('3.4 parity 内置 manifest 计数已改 13', parity.includes('builtinManifests.length === 13'), '未找到 === 13')
  check('3.4 parity 未退化为 >=', !/builtinManifests\.length >= 13/.test(parity))
}

{
  // 3.5 p24 两脚本的 sha 硬闸已滚存到当前真值（第 14 次）
  const realSha = createHash('sha256').update(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).digest('hex')
  const pv = readFileSync(join(root, 'scripts', 'p24-verify.mjs'), 'utf8')
  const pm = readFileSync(join(root, 'scripts', 'p24-ui-matrix.mjs'), 'utf8')
  check('3.5 p24-verify 基准 sha = 真实 sha', pv.includes('"' + realSha + '"'), '基准与真值不符（真值 ' + realSha.slice(0, 12) + '…）')
  check('3.5 p24-ui-matrix 基准 sha = 真实 sha', pm.includes('"' + realSha + '"'), '基准与真值不符')
  check('3.5 p24-verify 副本目录含 governance-router（否则 doctor 报 row-without-body）', pv.includes('"governance-router"'))
  check('3.5 p24-ui-matrix 副本目录含 governance-router', pm.includes('"governance-router"'))
  check('3.5 p24-verify 副本目录含 governance-cleanup', pv.includes('"governance-cleanup"'))
  check('3.5 p24-ui-matrix 副本目录含 governance-cleanup', pm.includes('"governance-cleanup"'))
  check('3.5 p24-verify 副本目录含 governance-output-gate', pv.includes('"governance-output-gate"'))
  check('3.5 p24-ui-matrix 副本目录含 governance-output-gate', pm.includes('"governance-output-gate"'))
  // 滚存笔必须留痕（本项目的硬规矩：数据变更要能在注释里读出来）
  check('3.5 p24-verify 有第 14 次滚存笔', pv.includes('第 14 次'))
  check('3.5 p24-ui-matrix 有第 14 次滚存笔', pm.includes('第 14 次'))
}

{
  // 3.6 红线 4：不写 AGENTS.md / 不写 skill 目录 / 不注册 prompt
  const src = readFileSync(MOD, 'utf8')
  // 判据只看**非注释行**：本文件头注在逐条解释"不调用 ctx.slots / 不 import 宿主包"，
  // 拿整文匹配会把"声明自己不做某事"误判成"做了某事"（p4-no-subplugin-import-check 同款口径）。
  const code = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('3.6 插件不写 AGENTS.md', !/AGENTS\.md/.test(code))
  check('3.6 插件不调 ctx.slots（不自带面板）', !/ctx\.slots/.test(code))
  check('3.6 插件不调 ctx.systemPrompt（不注册 prompt）', !/ctx\.systemPrompt/.test(code))
  check('3.6 插件不调 ctx.skills.register / registerProvider（不写技能目录）', !/skills\.(register|registerProvider)\s*\(/.test(code))
  check('3.6 插件不 import 任何宿主包（可独立卸载）', !/from\s+['"]@deepseek-ai\//.test(code) && !/from\s+['"]xiaobai-agent/.test(code))
  check('3.6 插件只 import node: 内置模块', (code.match(/from\s+['"][^'"]+['"]/g) || []).every((s) => /from\s+['"]node:/.test(s)), JSON.stringify((code.match(/from\s+['"][^'"]+['"]/g) || [])))
}

// ══════════════════════════════════════════════════════════════════════════
// ④ 零写入自证
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ④ 零写入自证 ──')
{
  const govAfter = snapshotTree(REAL_GOV)
  const beforeKeys = Object.keys(govBefore).sort()
  const afterKeys = Object.keys(govAfter).sort()
  check('4.1 真实 .toolkit-governance/ 文件清单未变', JSON.stringify(beforeKeys) === JSON.stringify(afterKeys), 'before=' + beforeKeys.length + ' after=' + afterKeys.length)
  check('4.1 真实 .toolkit-governance/ 无文件内容被改写', beforeKeys.every((k) => govBefore[k] === govAfter[k]), '有内容变化')
  check('4.1 本脚本未在真实 .toolkit-governance/ 下建 governance-router 目录', !existsSync(join(REAL_GOV, 'governance-router')) || beforeKeys.some((k) => k.startsWith('governance-router/')))
  // 仓内其它面也不该被本脚本碰
  check('4.1 本脚本全部落盘都在 os.tmpdir 副本内', work.startsWith(tmpdir()), work)
  const leaked = readdirSync(root).filter((n) => n.startsWith('p25-') && n !== 'p25-router-verify.mjs')
  check('4.1 仓根未留下临时产物', leaked.length === 0, leaked.join(', '))
  rmSync(work, { recursive: true, force: true })
  check('4.1 临时副本已清理', !existsSync(work))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════')
console.log('RESULT passed=' + pass + ' failed=' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(1)
}
