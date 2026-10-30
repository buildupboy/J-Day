import { randomUUID } from 'node:crypto';
import { minute, clock, datetime, instant, timestamp } from './time.js';

export const SHORT_BLOCK_MINUTES = 30;
export const MERGED_TASK_TITLE = '기타 작업';

const length = block => minute(block.end) - minute(block.start);
const DEFAULT_BREAK_MINUTES = 10;
const restAfter = (task, settings) => task.breakAfterMinutes ?? settings.breakMinutes ?? DEFAULT_BREAK_MINUTES;

/** 남은 작업 전체가 하나의 짧은 블록에 들어 있고 아직 손대지 않은 작업만 묶을 수 있다. 내부 하위작업은 하나로 합친다. */
function absorbable(block, db, now) {
  if (block.status !== 'planned' || instant(block, 'start') < timestamp(now) || length(block) >= SHORT_BLOCK_MINUTES) return null;
  // 작업 종료 화면에서 이미 이어서 하기로 연결한 블록·묶인 작업은 다시 묻지 않는다.
  if (block.continuationOf || (db.scheduledBlocks ?? []).some(item => item.continuationOf === block.id)) return null;
  const task = db.tasks.find(item => item.id === block.taskId);
  if (!task || task.status === 'done' || task.progress > 0 || task.reviewOf || task.sourceTasks?.length || task.skipInnerBreak || task.estimatedMinutes !== length(block)) return null;
  const planned = (db.scheduledBlocks ?? []).filter(item => item.taskId === task.id && item.status === 'planned');
  if (planned.length !== 1 || (db.scheduledBlocks ?? []).some(item => item.taskId === task.id && item.status !== 'planned')) return null;
  return task;
}

export const groupId = blockIds => [...blockIds].sort().join('+');

/**
 * 짧은 블록(30분 미만)이 쉬는 시간만 두고 나란히 있는 묶음을 찾는다. 순수 함수이며 DB를 바꾸지 않는다.
 * 서로 다른 작업이 2개 이상 이어진 경우만 후보가 되고, 사용자가 거절한 묶음은 제외한다.
 */
export function findShortMergeGroups(db, { now, declined = db.shortMergeDeclined ?? [] } = {}) {
  const settings = db.user?.settings ?? {};
  const byDate = new Map();
  for (const block of db.scheduledBlocks ?? []) {
    const task = absorbable(block, db, now);
    if (task) (byDate.get(block.date) ?? byDate.set(block.date, []).get(block.date)).push({ block, task });
  }
  const groups = [];
  for (const [date, items] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    items.sort((a, b) => minute(a.block.start) - minute(b.block.start));
    let chain = [];
    const flush = () => {
      if (chain.length >= 2) {
        const blockIds = chain.map(item => item.block.id);
        if (!declined.includes(groupId(blockIds))) groups.push({ id: groupId(blockIds), date, blockIds,
          taskIds: chain.map(item => item.task.id), titles: chain.map(item => item.task.title),
          minutes: chain.map(item => length(item.block)), totalMinutes: chain.reduce((sum, item) => sum + length(item.block), 0) });
      }
      chain = [];
    };
    for (const item of items) {
      const previous = chain.at(-1);
      const gap = previous ? minute(item.block.start) - minute(previous.block.end) : 0;
      if (previous && (gap < 0 || gap > restAfter(previous.task, settings))) flush();
      chain.push(item);
    }
    flush();
  }
  return groups;
}

/** 안내 문구. 한 번에 하나의 묶음만 묻는다. */
export function mergeQuestion(group) {
  const names = group.titles.map((title, index) => `‘${title}’ ${group.minutes[index]}분`).join(', ');
  return `${names}이(가) 짧게 이어져 있어요. 쉬는 시간 없이 이어서 하시겠어요?`;
}

/**
 * 묶음을 적용한다. 작업들을 '기타 작업' 하나의 하위작업으로 옮기고, 블록은 쉬는 시간 없이 이어 붙인다.
 * 첫 블록의 시작 시각은 유지하고 남는 시간은 비워 둔다. db를 직접 바꾼다(호출자의 updateDb 트랜잭션).
 */
export function applyShortMerge(db, blockIds, { now }) {
  if (!Array.isArray(blockIds) || blockIds.length < 2) throw Object.assign(new Error('묶을 블록을 2개 이상 지정하세요.'), { status: 400 });
  const blocks = blockIds.map(id => (db.scheduledBlocks ?? []).find(block => block.id === id));
  if (blocks.some(block => !block)) throw Object.assign(new Error('묶을 블록을 찾을 수 없습니다. 일정이 바뀌었을 수 있어요.'), { status: 404 });
  const current = findShortMergeGroups(db, { now, declined: [] }).find(group => groupId(group.blockIds) === groupId(blockIds));
  if (!current) throw Object.assign(new Error('이미 일정이 바뀌어 묶을 수 없어요.'), { status: 409 });
  const ordered = current.blockIds.map(id => db.scheduledBlocks.find(block => block.id === id));
  const tasks = ordered.map(block => db.tasks.find(task => task.id === block.taskId));
  const total = current.totalMinutes;
  const parent = { id: randomUUID(), title: MERGED_TASK_TITLE, type: 'etc',
    deadline: tasks.map(task => task.deadline).sort((a, b) => datetime(a) - datetime(b))[0],
    importance: Math.max(...tasks.map(task => task.importance ?? 2)),
    baseEstimatedMinutes: total, estimatedMinutes: total,
    subtasks: tasks.map((task, index) => ({ id: randomUUID(), title: task.title, estimatedMinutes: current.minutes[index], done: false })),
    progress: 0, status: 'todo', actualMinutes: 0, skipInnerBreak: true,
    mergedFrom: tasks.map(task => ({ taskId: task.id, title: task.title })), createdAt: new Date(timestamp(now) + 9 * 3600000).toISOString().replace('Z', '+09:00') };
  const notBefore = tasks.map(task => task.notBefore).filter(Boolean).sort((a, b) => datetime(b) - datetime(a))[0];
  if (notBefore) parent.notBefore = notBefore;
  let cursor = minute(ordered[0].start);
  ordered.forEach((block, index) => {
    const span = current.minutes[index];
    Object.assign(block, { taskId: parent.id, subtaskId: parent.subtasks[index].id, start: clock(cursor), end: clock(cursor + span), mergedShort: true });
    cursor += span;
  });
  const removed = new Set(tasks.map(task => task.id));
  db.tasks = db.tasks.filter(task => !removed.has(task.id));
  db.tasks.push(parent);
  return { task: parent, blocks: ordered };
}

export function declineShortMerge(db, id) {
  if (typeof id !== 'string' || !id) throw Object.assign(new Error('거절할 묶음 ID가 필요합니다.'), { status: 400 });
  const declined = db.shortMergeDeclined ??= [];
  if (!declined.includes(id)) declined.push(id);
  return { declined: true };
}
