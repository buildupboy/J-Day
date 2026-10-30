import { unavailableDates } from '../services/scheduling-constraints.js';
import { blockedWindows } from './blocked-windows.js';
import { createHash } from 'node:crypto';
import { DAY, KST, day, minute, clock, datetime, timestamp, positive, instant } from './time.js';
import { remainingWork } from './workload.js';
import { findFreeSlots } from './allocator.js';

export function fingerprint(value) {
  function stable(item) {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, stable(item[key])]));
    return item;
  }
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function schedulingRevision(db) {
  return fingerprint({ tasks: db.tasks, fixedBlocks: db.fixedBlocks, settings: db.user?.settings, schedulingConstraints: db.schedulingConstraints ?? {}, scheduledBlocks: db.scheduledBlocks ?? [] });
}
export function planningSettings(settings) {
  const start = minute(settings.dayStart), end = minute(settings.dayEnd);
  if (start >= end) throw new RangeError('dayStart는 dayEnd보다 빨라야 합니다.');
  const min = positive(settings.minSlotMinutes, 'minSlotMinutes');
  const max = positive(settings.maxBlockMinutes, 'maxBlockMinutes');
  const rest = positive(settings.breakMinutes, 'breakMinutes', 0);
  const limit = settings.maxDailyMinutes === undefined ? 1440 : positive(settings.maxDailyMinutes, 'maxDailyMinutes', 0);
  const buffer = settings.bufferMinutes === undefined ? 0 : positive(settings.bufferMinutes, 'bufferMinutes', 0);
  if (max < min || limit > 1440 || buffer > 1440) throw new RangeError('작업시간 설정을 확인하세요.');
  const travelMinutes = settings.travelMinutes ?? 0;
  if (!Number.isSafeInteger(travelMinutes) || travelMinutes < 0 || travelMinutes > 1440) throw new RangeError('이동시간은 0~1440분이어야 합니다.');
  return { ...settings, travelMinutes, minSlotMinutes: min, maxBlockMinutes: max, breakMinutes: rest, maxDailyMinutes: limit, bufferMinutes: buffer };
}

/** AI가 참고할 작업 순서만 계산한다. 시작·종료 시각을 생성하지 않는다. */
export function rankTasks(tasks, { existingBlocks = [], now } = {}) {
  return tasks.filter(task => task.status !== 'done').map(task => {
    const importance = task.importance === undefined ? 2 : task.importance;
    if (!Number.isInteger(importance) || importance < 1 || importance > 3) throw new RangeError('importance는 1~3이어야 합니다.');
    datetime(task.deadline);
    if (task.notBefore !== undefined) datetime(task.notBefore);
    const units = remainingWork(task, existingBlocks, now);
    return { taskId: task.id, title: task.title, type: task.type, deadline: task.deadline, importance,
      ...(task.breakAfterMinutes === undefined ? {} : { breakAfterMinutes: task.breakAfterMinutes }),
      progress: task.progress, estimatedMinutes: task.estimatedMinutes,
      ...(task.notBefore === undefined ? {} : { notBefore: task.notBefore }),
      ...(task.reviewOf === undefined ? {} : { reviewOf: task.reviewOf }),
      remainingMinutes: units.reduce((sum, unit) => sum + unit.remaining, 0),
      subtasks: units.map(unit => ({ ...(unit.subtaskId === undefined ? {} : { subtaskId: unit.subtaskId }),
        title: task.subtasks?.find(subtask => subtask.id === unit.subtaskId)?.title ?? task.title,
        ...(task.subtasks?.find(subtask => subtask.id === unit.subtaskId)?.notBefore ? { notBefore: task.subtasks.find(subtask => subtask.id === unit.subtaskId).notBefore } : {}),
        remainingMinutes: unit.remaining, reservedUntil: Number.isFinite(unit.reservedUntil) ? new Date(unit.reservedUntil).toISOString() : null })) };
  }).filter(task => task.remainingMinutes > 0)
    .sort((a, b) => datetime(a.deadline) - datetime(b.deadline) || b.importance - a.importance || a.remainingMinutes - b.remainingMinutes)
    .map((task, index) => ({ ...task, priorityRank: index + 1 }));
}

export function protectedBlocks(db, now, window) {
  const time = timestamp(now);
  return (db.scheduledBlocks ?? []).filter(block => block.status !== 'planned' || (block.continuationOf && instant(block, 'start') <= Math.ceil(time / 60000) * 60000) || day(block.date) - KST + minute(block.start) * 60000 < time
    || (window && (block.date < window.from || block.date > window.to)));
}
export function availableWindows(date, fixedBlocks, occupied, settings, now) {
  const start = Math.max(minute(settings.dayStart), Math.ceil((timestamp(now) - (day(date) - KST)) / 60000));
  if (start >= minute(settings.dayEnd)) return [];
  const midnight = day(date) - KST;
  const padded = occupied.map(block => ({ date,
    start: clock(Math.max(0, Math.min(1440, (instant(block, 'start') - midnight) / 60000 - settings.breakMinutes))),
    end: clock(Math.max(0, Math.min(1440, (instant(block, 'end') - midnight) / 60000 + (block.breakAfterMinutes ?? settings.taskRestMinutes?.[block.taskId] ?? settings.breakMinutes))))
  })).filter(block => block.start < block.end);
  return findFreeSlots(date, fixedBlocks, padded, { ...settings, dayStart: clock(start), minSlotMinutes: 1 });
}

/** 일정 후보와 제약을 전달한다. 빈 시간을 작업 블록으로 채우지 않는다. */
export function preparePlanningContext(db, { now, reason = 'manual', horizonDays = 14 }) {
  const time = timestamp(now), settings = planningSettings(db.user.settings);
  settings.unavailableDates = unavailableDates(db);
  settings.taskRestMinutes = Object.fromEntries(db.tasks.filter(task => task.breakAfterMinutes !== undefined).map(task => [task.id, task.breakAfterMinutes]));
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) throw new RangeError('horizonDays는 1~31이어야 합니다.');
  const first = day(new Date(time + KST).toISOString().slice(0, 10));
  const daysOff = settings.unavailableDates.filter(value => day(value) >= first && day(value) < first + 31 * DAY);
  horizonDays = Math.max(horizonDays, ...daysOff.map(value => (day(value) - first) / DAY + 1));
  const window = { from: new Date(first).toISOString().slice(0, 10), to: new Date(first + (horizonDays - 1) * DAY).toISOString().slice(0, 10) };
  const preserved = protectedBlocks(db, now, window);
  const preservedIds = new Set(preserved.map(block => block.id));
  const days = Array.from({ length: horizonDays }, (_, index) => {
    const date = new Date(first + index * DAY).toISOString().slice(0, 10);
    const slots = availableWindows(date, db.fixedBlocks, preserved, settings, now);
    const freeMinutes = slots.reduce((sum, slot) => sum + minute(slot.end) - minute(slot.start), 0);
    const usedMinutes = preserved.filter(block => block.date === date && ['planned', 'done'].includes(block.status))
      .reduce((sum, block) => sum + minute(block.end) - minute(block.start), 0);
    return { date, slots, freeMinutes, existingWorkMinutes: usedMinutes,
      remainingDailyMinutes: Math.max(0, settings.maxDailyMinutes - usedMinutes),
      requiredBufferMinutes: Math.min(settings.bufferMinutes, freeMinutes) };
  });
  const body = { schemaVersion: 1, timezone: 'Asia/Seoul', reason,
    generatedAt: new Date(time + KST).toISOString().replace('Z', '+09:00'),
    sourceRevision: schedulingRevision(db), window: { from: days[0].date, to: days.at(-1).date }, settings,
    priorityPolicy: ['deadline_ascending', 'importance_descending', 'remaining_minutes_ascending', 'input_order'],
    priorityIsAdvisory: true, recommendedSlotMinutes: settings.minSlotMinutes, rankedTasks: rankTasks(db.tasks, { existingBlocks: preserved, now }),
    unavailableDates: settings.unavailableDates,
    fixedBlocks: structuredClone(db.fixedBlocks), protectedBlocks: structuredClone(preserved),
    blockedWindows: days.flatMap(({ date }) => blockedWindows(date, db.fixedBlocks, settings)),
    existingFutureBlocks: structuredClone((db.scheduledBlocks ?? []).filter(block => !preservedIds.has(block.id))),
    replaceableBlockIds: (db.scheduledBlocks ?? []).filter(block => !preservedIds.has(block.id)).map(block => block.id), days,
    planningInstructions: ['빈 시간은 모두 작업으로 채울 목표가 아닙니다.', '식사·개인 시간·휴식과 사용자 선호를 고려해 실행 가능한 양만 제안하세요.',
      '남은 작업을 전부 넣지 않아도 됩니다. 미배치 시간은 서버가 계산합니다.', '날짜와 시작·종료 시각의 선택은 AI가 담당합니다.'] };
  return { ...body, contextId: fingerprint(body) };
}
