import { allocate } from './allocator.js';

const DAY = 86400000;
const KST = 9 * 60 * 60000;
const reasons = new Set(['new_task', 'missed', 'progress', 'manual']);

function timestamp(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError('유효한 now Date가 필요합니다.');
  return now.getTime();
}

function instant(block, key) {
  return Date.parse(`${block.date}T00:00:00+09:00`) + minutes(block[key]) * 60000;
}

function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 종료 시각이 지났지만 완료되지 않은 planned 블록. 진행률만으로 개별 완료를 추정하지 않는다. */
export function detectMissedBlocks(scheduledBlocks, tasks, now) {
  const time = timestamp(now);
  const byId = new Map(tasks.map(task => [task.id, task]));
  return scheduledBlocks.filter(block => {
    const task = byId.get(block.taskId);
    return block.status === 'planned' && instant(block, 'end') <= time
      && task && task.status !== 'done' && task.progress < 1;
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
  // 과거 planned는 이력으로 보존하되 미래 예약 시간으로 차감하지 않는다.
  const reservations = preserved.map(block => instant(block, 'end') <= time && block.status === 'planned'
    ? { ...block, status: 'done' } : block);
  const local = new Date(time + KST);
  const today = local.toISOString().slice(0, 10);
  const first = Date.parse(`${today}T00:00:00Z`);
  let last = first;
  for (const task of db.tasks.filter(task => task.status !== 'done')) {
    const deadline = Date.parse(task.deadline);
    if (!Number.isFinite(deadline)) throw new RangeError('유효한 deadline이 필요합니다.');
    last = Math.max(last, Math.floor((deadline + KST) / DAY) * DAY);
  }
  const generated = [];
  let unplaced = [];
  for (let dateStamp = first; dateStamp <= last; dateStamp += DAY) {
    const date = new Date(dateStamp).toISOString().slice(0, 10);
    const settings = { ...db.user.settings };
    if (dateStamp === first) {
      const start = Math.max(minutes(settings.dayStart), Math.ceil((time + KST - first) / 60000));
      // 오늘 운영 시간이 끝났으면 빈 하루로 계산하여 미배치 시간만 얻는다.
      if (start < minutes(settings.dayEnd)) settings.dayStart = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
      else {
        const blockedDay = { dayOfWeek: [new Date(dateStamp).getUTCDay()], start: settings.dayStart, end: settings.dayEnd };
        unplaced = allocate(db.tasks, [...db.fixedBlocks, blockedDay], { from: date, to: date, settings, existingBlocks: [...reservations, ...generated] }).unplaced;
        continue;
      }
    }
    const result = allocate(db.tasks, db.fixedBlocks, { from: date, to: date, settings, existingBlocks: [...reservations, ...generated] });
    generated.push(...result.blocks);
    unplaced = result.unplaced;
    if (unplaced.length === 0) break;
  }
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
