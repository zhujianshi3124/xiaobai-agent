/**
 * @local/agent-memory — 脚本执行护栏（2026-09-10 事故修复，fail-closed）
 *
 * 事故：smoke-final.mjs / record-d7-fix.mjs 默认根 = resolveDataRoot()
 *       = <主目录>/.agent-memory（生产根），无护栏，两次把测试内容写进生产根
 *       （20260910-ad0997ee、20260910-afb2e128），且真实验收数据连带被毁。
 *
 * 修复原则（用户拍板，结构性 fail-closed，不是流程提醒）：
 *   1. 极性反转：测试/冒烟/狗粮脚本默认根 = 脚本内写死的沙箱路径，
 *      不依赖调用方设置的任何环境变量；
 *   2. 解析出的根 == 生产根、且未显式 opt-in（--allow-production 专用旗标）
 *      → 立即中止（exit 3），默认拒绝；
 *   3. --clean 对生产根永远禁止（即使在 production opt-in 之后）；
 *   4. 演示脚本（demos.mjs）语义更严：永远只允许沙箱，不开放 production opt-in。
 */
import path from 'node:path';
import os from 'node:os';

/** 生产根（全局数据根默认位置）。任何脚本默认都不得写这里。 */
export const PRODUCTION_ROOT = path.resolve(path.join(os.homedir(), '.agent-memory'));

/** 冒烟/狗粮脚本的默认沙箱根（脚本内写死，不读 env）。 */
export const SANDBOX_ROOT = path.resolve(path.join(os.homedir(), '.agent-memory-sandbox'));

/** 演示脚本的默认沙箱根（demos.mjs 专用，永远禁止生产根）。 */
export const DEMO_SANDBOX_ROOT = path.resolve(path.join(os.homedir(), '.agent-memory-demo'));

/**
 * 解析脚本数据根（极性反转版）。
 *
 * @param argv 脚本进程命令行参数（process.argv 或子集）
 * @param opts.sandboxRoot 默认沙箱路径（覆盖测试用）
 * @param opts.productionRoot 生产根路径（覆盖测试用）
 * @param opts.allowProductionOptIn 是否允许 --allow-production 旗标（默认 true；
 *        演示脚本传 false：永远不允许生产根）
 * @returns { root, isProduction, clean, allowProduction }
 * @throws {Error} code=PRODUCTION_ROOT_DENIED / PRODUCTION_ROOT_CLEAN_DENIED
 */
export function parseScriptRoot(argv = [], opts = {}) {
  const args = [...argv];
  const sandboxRoot = path.resolve(opts.sandboxRoot ?? SANDBOX_ROOT);
  const productionRoot = path.resolve(opts.productionRoot ?? PRODUCTION_ROOT);
  const allowProductionOptIn = opts.allowProductionOptIn !== false;

  const clean = args.includes('--clean');
  const productionFlagPresent = args.includes('--allow-production')
    || opts.env?.AGENT_MEMORY_ALLOW_PRODUCTION === '1';
  const allowProduction = allowProductionOptIn && productionFlagPresent;

  // 显式 --root <path> / --root=<path> 优先；否则默认沙箱根（极性反转：绝不再默认生产根）
  let root = sandboxRoot;
  const i = args.indexOf('--root');
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) {
    root = path.resolve(args[i + 1]);
  } else {
    for (const a of args) {
      if (a.startsWith('--root=')) { root = path.resolve(a.slice('--root='.length)); break; }
    }
  }
  root = path.resolve(root);
  const isProduction = root === productionRoot;
  if (!allowProductionOptIn && (isProduction || productionFlagPresent)) {
    const e = new Error(
      `PRODUCTION_ROOT_FORBIDDEN: 此脚本永远禁止生产根 ${productionRoot}；请删去 --allow-production`
    );
    e.code = 'PRODUCTION_ROOT_FORBIDDEN';
    throw e;
  }
  if (isProduction && !allowProduction) {
    const e = new Error(
      `PRODUCTION_ROOT_DENIED: 脚本默认只写沙箱根 ${sandboxRoot}；` +
      `解析到生产根 ${productionRoot} 但未显式 --allow-production，已中止`
    );
    e.code = 'PRODUCTION_ROOT_DENIED';
    throw e;
  }
  if (isProduction && clean) {
    const e = new Error(`PRODUCTION_ROOT_CLEAN_DENIED: 禁止对生产根 ${productionRoot} 执行 --clean`);
    e.code = 'PRODUCTION_ROOT_CLEAN_DENIED';
    throw e;
  }
  return { root, isProduction, clean, allowProduction, sandboxRoot, productionRoot };
}

/**
 * 脚本统一入口的错误处理：护栏错误 → 打印到 stderr 并 exit(3)；其他错误原样抛出。
 * 所有冒烟/狗粮/演示脚本的 main 应包一层该函数。
 */
export function handleScriptGuardError(err) {
  if (err && typeof err.code === 'string' && err.code.startsWith('PRODUCTION_ROOT_')) {
    console.error(`[护栏] ${err.message}`);
    process.exit(3);
  }
  throw err;
}