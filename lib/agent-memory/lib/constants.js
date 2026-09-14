/**
 * @local/agent-memory — 常量（设计稿 §1/§5/§7/§10 拍板值 + 2026-09-10 全局化修订）
 *
 * 全局化修订（2026-09-10）：数据根目录移到机器级全局目录（默认用户主目录下，
 * 环境变量 AGENT_MEMORY_ROOT 覆盖）；registry 留存上限 50 → 100；其余拍板值不变。
 */

/** 全局数据根目录默认目录名（位于用户主目录下） */
export const DATA_DIR = '.agent-memory';
/** 兼容别名：旧值为工作区内 .agent */
export const AGENT_DIR = DATA_DIR;

/** 数据根目录环境变量（新）；AGENT_ROOT 为兼容别名（旧冒烟脚本用过） */
export const DATA_ROOT_ENV = 'AGENT_MEMORY_ROOT';
export const DATA_ROOT_ENV_LEGACY = 'AGENT_ROOT';

export const SESSIONS_DIR = 'sessions';
export const LOCKS_DIR = '.locks';

/** 全局注册表锁名（生成 .locks/registry.lock） */
export const REGISTRY_LOCK_NAME = 'registry';

/** 会话 ID 格式：YYYYMMDD-xxxxxxxx（8 位日期 + 8 位小写字母/数字；兼容旧 8 位随机）
 *  或 YYYYMMDD-xxxxxxxxxxxx（8 位日期 + 12 位小写 hex = 宿主 UUID 派生候选，二阶段后半） */
export const SID_RE = /^\d{8}-[a-z0-9]{8,12}$/;

/** 宿主会话 ID（dshSessionId）格式：通用 UUID（8-4-4-4-12 位 hex，大小写均可）。
 *  真实 dsh 会话 id 为 `session-<uuid>`（2026-09-11 真机定位）：lib/normalize.js 会先
 *  剥离 `session-` 前缀、再按本裸 UUID 正则归一化；宿主 ID 只经 normalize.js 进入（二阶段后半）。 */
export const HOST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ledger.md / progress.md 头部 schemaVersion（2026-09-10 新增，格式变更时有据可迁） */
export const SCHEMA_VERSION = 1;

/** ledger.md 硬上限（拍板 §10-1） */
export const LEDGER_MAX_BYTES = 32 * 1024;

/** progress.md 硬上限（拍板 §10-2；v13 正式修订：16K→32K，L-002「16K 上限」扩容，见 phase2-design §12.8） */
export const PROGRESS_MAX_BYTES = 32 * 1024;

/** 门禁新鲜度：3 个模型回合，写死常量（拍板 §10-3/§10-8，缺口 b） */
export const FRESHNESS_TURNS = 3;

/** 锁最大寿命：崩溃残留判定阈值（缺口 c，建议 5 分钟） */
export const LOCK_MAX_AGE_MS = 5 * 60 * 1000;

/** 活跃锁等待超时（默认 3 秒，可配） */
export const LOCK_WAIT_MS = 3000;

/** 自动归档阈值：lastActiveAt 超过 30 天（拍板 §10-4） */
export const AUTO_ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** registry 留存上限（拍板 §10-5；2026-09-10 全局化修订 50 → 100） */
export const REGISTRY_MAX_SESSIONS = 100;

/** 冷启动列候选上限：最近 10 条活跃（拍板 §10-5） */
export const CANDIDATE_LIMIT = 10;

/** 已完成条目折叠后描述最大字符数 */
export const FOLD_MAX_CHARS = 80;

/** 承接"原文复制"检测的最短匹配长度（避免短词误伤，长于该长度即视为复制） */
export const COPY_MIN_CHARS = 12;

/** 会话状态枚举（设计稿 §3） */
export const SESSION_STATUSES = ['活跃', '已完成', '已归档', '已移交'];

/** 条目状态枚举（设计稿 §2.1） */
export const ENTRY_STATUSES = ['待办', '进行中', '已完成', '已搁置'];

/** 条目编号正则 */
export const ENTRY_NO_RE = /^L-\d+$/;

/** 永久指令区默认条目（v1 内追加能力；新会话 initLedger 固化，checkpoint 正典副本/冷启动恢复双路携带） */
export const DEFAULT_PERMANENT_INSTRUCTIONS = [
  '始终用中文回复',
  '指令先落账：收到多步指令先把要点写入台账再执行；每轮结束先写回执',
];

/** 永久指令条数上限（防台账膨胀挤占条目预算） */
export const PERMANENT_MAX_ITEMS = 20;

/** 单条永久指令最大字符数 */
export const PERMANENT_MAX_CHARS = 200;

/** 状态迁移合法表（C4：活跃→已完成/已归档/已移交；已完成→已归档；已移交不可回活跃） */
export const STATUS_TRANSITIONS = {
  活跃: ['已完成', '已归档', '已移交'],
  已完成: ['已归档'],
  已归档: [],
  已移交: [],
};