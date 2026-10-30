import { allocate } from './allocator.js';

import { DAY, KST, instant, timestamp, datetime } from './time.js';
const reasons = new Set(['new_task', 'missed', 'progress', 'manual']);

/** 종료 시각이 지났지만 완료되지 않은 planned 블록. 진행률만으로 개별 완료를 추정하지 않는다. */
export function detectMissedBlocks(scheduledBlocks, tasks, now) {
  const time = timestamp(now);
  const byId = new Map(tasks.map(task => [task.id, task]));
  return scheduledBlocks.filter(block => {
    const task = byId.get(block.taskId);
    return block.status === 'planned' && instant(block, 'end') <= time
      && task && task.status !== 'done' && task.progress < 1
      && !(task.subtasks?.length && task.subtasks.every(subtask => subtask.done))
      && !task.subtasks?.some(subtask => subtask.id === block.subtaskId && subtask.done);
  }).map(block => ({ ...block }));
}

/**
 * 지난/진행 중/완료 기록을 보존하고 미래 planned 블록을 재계산한다.
 * DB 저장과 이벤트 호출은 호출자 책임. 입력을 변경하지 않는다.
 * @param {object} db
 * @param {{now: Date, reason: 'new_task'|'missed'|'progress'|'manual'}} options
 * @returns {{scheduledBlocks: Array, changes: Array, unplaced: Array}}
 */
export function reschedule(db, { now, reason }) {
  const time = timestamp(now);
  if (!reasons.has(reason)) throw new RangeError('지원하지 않는 재배치 사유입니다.');
  const original = db.scheduledBlocks ?? [];
  const missed = new Set(detectMissedBlocks(original, db.tasks, now).map(block => block.id));
  const preserved = original.filter(block => block.status !== 'planned' || instant(block, 'start') < time)
    .map(block => ({ ...block, status: missed.has(block.id) ? 'missed' : block.status }));
  const today = new Date(time + KST).toISOString().slice(0, 10);
  const first = Date.parse(today + 'T00:00:00Z');
  let last = first;
  for (const task of db.tasks.filter(task => task.status !== 'done')) {
    last = Math.max(last, Math.floor((datetime(task.deadline) + KST) / DAY) * DAY);
  }
  // 진행 중 블록은 now 이후 예약분만 남은 작업량에서 차감한다.
  const { blocks: generated, unplaced } = allocate(db.tasks, db.fixedBlocks, {
    from: today, to: new Date(last).toISOString().slice(0, 10), settings: db.user.settings,
    existingBlocks: preserved, now,
  });
  const scheduledBlocks = [...preserved, ...generated].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const before = new Map(original.map(block => [block.id, block]));
  const after = new Map(scheduledBlocks.map(block => [block.id, block]));
  const changes = [];
  for (const block of original) {
    const next = after.get(block.id);
    if (!next) changes.push({ type: 'removed', reason, before: { ...block } });
    else if (['taskId', 'subtaskId', 'date', 'start', 'end', 'status'].some(key => block[key] !== next[key])) {
      changes.push({ type: 'updated', reason, before: { ...block }, after: { ...next } });
    }
  }
  for (const block of scheduledBlocks) {
    if (!before.has(block.id)) changes.push({ type: 'added', reason, after: { ...block } });
  }
  return { scheduledBlocks, changes, unplaced };
}
