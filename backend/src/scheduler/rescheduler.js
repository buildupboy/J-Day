import { preparePlanningContext } from './planning-context.js';

import { instant, timestamp, datetime, clock, day, KST } from './time.js';
const reasons = new Set(['new_task', 'missed', 'progress', 'manual']);

/** 예정 종료 뒤 이만큼은 아직 하는 중으로 보고 미수행으로 바꾸지 않는다. 그동안 홈에서 '시간이 더 필요하세요?'를 묻는다. */
export const MISSED_GRACE_MINUTES = 30;

/** 종료 시각에서 유예 시간이 지났지만 완료되지 않은 planned 블록. 진행률만으로 개별 완료를 추정하지 않는다. */
export function detectMissedBlocks(scheduledBlocks, tasks, now, { graceMinutes = MISSED_GRACE_MINUTES } = {}) {
  const time = timestamp(now) - graceMinutes * 60000;
  const byId = new Map(tasks.map(task => [task.id, task]));
  return scheduledBlocks.filter(block => {
    const task = byId.get(block.taskId);
    return block.status === 'planned' && instant(block, 'end') <= time
      && task && task.status !== 'done' && task.progress < 1
      && !(task.subtasks?.length && task.subtasks.every(subtask => subtask.done))
      && !task.subtasks?.some(subtask => subtask.id === block.subtaskId && subtask.done);
  }).map(block => ({ ...block }));
}

/** 미리 완료한 블록이 차지하던 나머지 시간을 비운다. 시작 전에 끝냈으면 released로 표시해 시간을 차지하지 않게 하고(완료 기록은 남긴다), 진행 중에 끝냈으면 완료 시각까지로 줄인다. */
function releaseEarlyDone(block) {
  if (block.status !== 'done' || !block.completedAt) return block;
  const done = datetime(block.completedAt);
  if (done >= instant(block, 'end')) return block;
  if (done <= instant(block, 'start')) return block.released ? block : { ...block, released: true };
  return { ...block, plannedEnd: block.plannedEnd ?? block.end, end: clock(Math.ceil((done - (day(block.date) - KST)) / 60000)) };
}

/**
 * 기록을 보존하고 AI에 전달할 우선순위·잔여량·빈 시간·제약을 준비한다.
 * DB 저장과 이벤트 호출은 호출자 책임. 입력을 변경하지 않는다.
 * @param {object} db
 * @param {{now: Date, reason: 'new_task'|'missed'|'progress'|'manual'}} options
 * @returns {{scheduledBlocks: Array, changes: Array, unplaced: Array}}
 */
export function reschedule(db, { now, reason, horizonDays = 14 }) {
  const time = timestamp(now);
  if (!reasons.has(reason)) throw new RangeError('지원하지 않는 재배치 사유입니다.');
  const original = db.scheduledBlocks ?? [];
  const missed = new Set(detectMissedBlocks(original, db.tasks, now).map(block => block.id));
  // 미완료 작업의 기존 미래 계획은 AI 결과가 검증될 때까지 보존한다.
  const scheduledBlocks = original.map(block => releaseEarlyDone({ ...block, status: missed.has(block.id) ? 'missed' : block.status }))
    .filter(block => {
      if (block.status !== 'planned' || instant(block, 'start') < time) return true;
      const task = db.tasks.find(task => task.id === block.taskId);
      return !task || (task.status !== 'done' && task.progress < 1
        && !task.subtasks?.some(subtask => subtask.id === block.subtaskId && subtask.done)
        && !(task.subtasks?.length && task.subtasks.every(subtask => subtask.done)));
    });
  const planningContext = preparePlanningContext({ ...db, scheduledBlocks }, { now, reason, horizonDays });
  return { rescheduled: false, schedulingStatus: 'awaiting_ai', planningContext,
    scheduledBlocks, changes: diffScheduledBlocks(original, scheduledBlocks, reason), unplaced: [] };
}

export function diffScheduledBlocks(original, scheduledBlocks, reason) {
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
  return changes;
}
