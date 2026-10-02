// toolkit 根入口（P7 嵌入 / REQ-8）：把工具箱以**普通 DSH 插件**的形态对外提供。
//
// 双向兼容（G4 / D1）：任何 dsh 宿主（含 dsh-web-all 类桶）装载 'xiaobai-agent'
// 就得到完整管理面（registry + doctor + 唯一面板的 HTTP 面），零宿主改造；
// 反过来 toolkit 也能把任意 dsh 插件装进来（registry/loader）。
//
// 本文件只做两件事：① 导出自身 manifest（与子插件同一契约，供宿主 doctor 预检形成
// 自描述闭环）；② 把装配工作交给面板插件（panel/index.js 一直是 registry/doctor 的
// 装配点，根入口不复制它的逻辑，避免两个装配现场）。
// 注意：装载本入口与装载 `xiaobai-agent/panel` 是同一个面板的两种入口写法，
// 同一进程内二选一（两个都装 = 两条同名 HTTP 路由注册，前缀不同则各管自己）。

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManifest } from './contract/dist/index.js'
import * as panelPlugin from './panel/index.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * 读盘上的 `dsh.plugin.json` 并按契约校验——manifest 的唯一事实来源是那个 JSON 文件，
 * 这里不另写一份，避免"导出的 manifest"与"盘上的 manifest"漂移。
 * 校验失败即抛：自身 manifest 被改坏时宁可装不上，也不能带着错误的自描述去预检别人。
 * @returns {import('xiaobai-agent/contract').DshSubPluginManifest}
 */
function loadSelfManifest() {
  const raw = JSON.parse(readFileSync(join(here, 'dsh.plugin.json'), 'utf8'));
  const result = validateManifest(raw);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path || '(root)'} ${e.message}`).join('；');
    throw new Error(`dsh/toolkit 自身 manifest 校验失败（根 dsh.plugin.json 被改坏，装配拒绝启动）：${detail}`);
  }
  return result.manifest;
}

export const name = 'xiaobai-agent';

// 依赖面与面板同源：面板要 webServer，根入口就要 webServer。
export const inject = panelPlugin.inject;

export const manifest = loadSelfManifest();

/** @param {any} ctx @param {any} [config] */
export function apply(ctx, config = {}) {
  return panelPlugin.apply(ctx, config);
}
