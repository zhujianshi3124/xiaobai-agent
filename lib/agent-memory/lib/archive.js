/**
 * .agent 体系 — 归档文件（设计稿 §2.3/§5，约束 D6/E3）
 *
 * archive.md 无硬上限，纯追加式：
 *   - 台账超限：最早已完成条目整体移入，追加 @归档 时间戳；
 *   - 进度超限：最旧里程碑的 已完成步骤/涉及文件 两小节移入，
 *     以 "## 里程碑归档 <ISO> @归档 <now>" 块呈现；
 *     （当前状态/下一步/关键决定 三区块永不归档，留在 progress.md）
 */
import fs from 'node:fs';
import path from 'node:path';
import { archivePath } from './paths.js';

export function initArchive(root, sid) {
  const file = archivePath(root, sid);
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Archive — ${sid}\n\n`, 'utf8');
}

export function readArchive(root, sid) {
  const file = archivePath(root, sid);
  if (!fs.existsSync(file)) return { header: { sid }, lines: [] };
  const raw = fs.readFileSync(file, 'utf8');
  const lines = String(raw).split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('# Archive'));
  return { header: { sid }, lines };
}

/** 追加单行（台账归档条目，调用方保证已在锁内或单写者场景） */
export function appendEntryLine(root, sid, line) {
  initArchive(root, sid);
  fs.appendFileSync(archivePath(root, sid), line + '\n', 'utf8');
}

/** 追加进度归档块：最旧里程碑的 已完成步骤/涉及文件 小节 */
export function appendProgressBlock(root, sid, { msIso, completedSteps = [], files = [], archivedAtIso }) {
  initArchive(root, sid);
  const lines = [
    `## 里程碑归档 ${msIso} @归档 ${archivedAtIso}`,
    `- 已完成步骤: ${completedSteps.join('、')}`,
    `- 涉及文件: ${files.join('; ')}`,
    '',
  ];
  fs.appendFileSync(archivePath(root, sid), lines.join('\n'), 'utf8');
}
