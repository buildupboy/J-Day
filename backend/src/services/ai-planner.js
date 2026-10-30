import { randomUUID } from 'node:crypto';
import { complete } from './llm.js';
import { PLANNING_SYSTEM_PROMPT, PLANNING_SCHEMA } from '../prompts/planning.js';
import { assertSchema } from './voice-validation.js';
import { remainingWork } from '../scheduler/workload.js';
import { detectMissedBlocks, diffScheduledBlocks } from '../scheduler/rescheduler.js';
import { DAY, KST, day, minute, clock, datetime, instant } from '../scheduler/time.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 422 }); };
const key = (taskId, subtaskId) => JSON.stringify([taskId, subtaskId ?? null]);
export function normalizePlanningSettings(input = {}) {
  const settings = { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90,
    breakMinutes: 10, maxDailyMinutes: 1440, bufferMinutes: 0, distribution: 'early', travelMinutes: 0, restWindows: [], ...input };
  if (minute(settings.dayStart) >= minute(settings.dayEnd)) invalid('작업 가능 시간의 시작은 종료보다 빨라야 합니다.');
  for (const name of ['minSlotMinutes', 'maxBlockMinutes', 'breakMinutes', 'maxDailyMinutes', 'bufferMinutes', 'travelMinutes']) {
    if (!Number.isSafeInteger(settings[name]) || settings[name] < (name.includes('Slot') || name.includes('Block') ? 1 : 0) || settings[name] > 1440) invalid(`${name}은 0~1440 범위의 정수 분이어야 합니다.`);
  }
  settings.dailyRestMinutes ??= settings.bufferMinutes;
  if (!Number.isSafeInteger(settings.dailyRestMinutes) || settings.dailyRestMinutes < 0 || settings.dailyRestMinutes > 1440) invalid('dailyRestMinutes를 확인해 주세요.');
  if (settings.maxBlockMinutes < settings.minSlotMinutes || !['early', 'balanced'].includes(settings.distribution)) invalid('작업 단위 또는 분산 설정이 올바르지 않습니다.');
  if (!Array.isArray(settings.restWindows) || settings.restWindows.length > 50) invalid('restWindows는 최대 50개 배열이어야 합니다.');
  for (const window of settings.restWindows) {
    if (minute(window.start) >= minute(window.end)) invalid('휴식 구간의 시작과 종료를 확인해 주세요.');
    if (window.date !== undefined) day(window.date);
    else if (!Array.isArray(window.dayOfWeek) || !window.dayOfWeek.length || window.dayOfWeek.some(d => !Number.isInteger(d) || d < 0 || d > 6)) invalid('휴식 구간의 날짜 또는 요일이 필요합니다.');
  }
  return settings;
}

// 이 단계는 배치하지 않는다. 순위와 정확한 잔량만 만든다.
export function buildPlanningContext(db, { now, reason }) {
  const settings = normalizePlanningSettings(db.user.settings);
  const time = now.getTime();
  const missed = new Set(detectMissedBlocks(db.scheduledBlocks ?? [], db.tasks, now).map(b => b.id));
  const preservedBlocks = (db.scheduledBlocks ?? []).filter(b => b.status !== 'planned' || instant(b, 'start') < time)
    .map(b => ({ ...b, status: missed.has(b.id) ? 'missed' : b.status }));
  const priorities = db.tasks.filter(t => t.status !== 'done' && t.progress < 1).map(task => {
    const units = remainingWork(task, preservedBlocks, now).map(u => ({ subtaskId: u.subtaskId ?? null, remaining: u.remaining,
      reservedUntil: Number.isFinite(u.reservedUntil) ? new Date(u.reservedUntil).toISOString() : null }));
    return { ...task, units, remainingMinutes: units.reduce((sum, u) => sum + u.remaining, 0) };
  }).filter(t => t.remainingMinutes > 0).sort((a, b) => datetime(a.deadline) - datetime(b.deadline) || (b.importance ?? 2) - (a.importance ?? 2) || a.remainingMinutes - b.remainingMinutes)
    .map((t, i) => ({ ...t, rank: i + 1 }));
  const planningFrom = new Date(time + KST).toISOString().slice(0, 10);
  const last = Math.max(day(planningFrom), ...priorities.map(t => day(new Date(datetime(t.deadline) + KST).toISOString().slice(0, 10))));
  if ((last - day(planningFrom)) / DAY > 366) invalid('AI 계획 범위는 최대 1년입니다.');
  const occupiedWindows = [];
  for (let stamp = day(planningFrom); stamp <= last; stamp += DAY) {
    const date = new Date(stamp).toISOString().slice(0, 10), weekday = new Date(stamp).getUTCDay();
    for (const block of db.fixedBlocks ?? []) {
      if (!block.dayOfWeek.includes(weekday)) continue;
      const travel = block.travelMinutes ?? settings.travelMinutes;
      if (!Number.isSafeInteger(travel) || travel < 0 || travel > 1440) invalid('일정의 이동시간이 올바르지 않습니다.');
      occupiedWindows.push({ date, start: block.start, end: clock(Math.min(1440, minute(block.end) + travel)), source: 'fixed_and_travel', title: block.title, fixedEnd: block.end, travelMinutes: travel });
      if (minute(block.end) + travel > 1440) occupiedWindows.push({ date: new Date(stamp + DAY).toISOString().slice(0, 10), start: '00:00', end: clock(minute(block.end) + travel - 1440), source: 'travel' });
    }
    for (const rest of settings.restWindows) if (rest.date === date || (rest.date === undefined && rest.dayOfWeek.includes(weekday))) occupiedWindows.push({ date, start: rest.start, end: rest.end, source: 'rest' });
  }
  return { now: now.toISOString(), timezone: 'Asia/Seoul', reason, planningFrom, planningTo: new Date(last).toISOString().slice(0, 10), settings,
    priorities, preservedBlocks, occupiedWindows, fixedBlocks: db.fixedBlocks ?? [],
    previousFutureBlocks: (db.scheduledBlocks ?? []).filter(b => b.status === 'planned' && instant(b, 'start') >= time),
    deletedCalendarItems: db.deletedCalendarItems ?? [] };
}

function unionMinutes(windows, left, right) {
  let end = left, total = 0;
  for (const [a, b] of windows.sort((x, y) => x[0] - y[0])) {
    const start = Math.max(left, end, a), stop = Math.min(right, b);
    if (stop > start) { total += stop - start; end = stop; }
  }
  return total;
}
export function validatePlan(plan, context) {
  // 배치 전용 스키마는 수백 개 블록을 허용한다. 공통 음성 스키마의 50개 제한과 분리한다.
  if (!plan || !Array.isArray(plan.blocks) || plan.blocks.length > 2000 || !Array.isArray(plan.omissions) || plan.omissions.length > 2000) invalid('AI 계획 항목 수가 올바르지 않습니다.');
  assertSchema({ ...plan, blocks: [], omissions: [] }, PLANNING_SCHEMA);
  for (const item of plan.blocks) assertSchema(item, PLANNING_SCHEMA.properties.blocks.items);
  for (const item of plan.omissions) assertSchema(item, PLANNING_SCHEMA.properties.omissions.items);
  const { settings, priorities, preservedBlocks, occupiedWindows } = context;
  const tasks = new Map(priorities.map(t => [t.id, t]));
  const remaining = new Map(priorities.flatMap(t => t.units.map(u => [key(t.id, u.subtaskId), u.remaining])));
  const used = new Map(), finishes = new Map();
  const restAfter = b => tasks.get(b.taskId)?.breakAfterMinutes ?? settings.breakMinutes;
  const blocks = plan.blocks.map(b => ({ ...b, status: 'planned' })).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const now = Math.ceil(Date.parse(context.now) / 60000) * 60000;
  for (const block of blocks) {
    const task = tasks.get(block.taskId), id = key(block.taskId, block.subtaskId);
    if (!task || !remaining.has(id) || remaining.get(id) <= 0) invalid('존재하지 않거나 완료된 작업/하위작업이 배치됐습니다.');
    day(block.date);
    const start = instant(block, 'start'), end = instant(block, 'end'), length = (end - start) / 60000;
    if (block.date < context.planningFrom || block.date > context.planningTo || start < now || length <= 0 || end > datetime(task.deadline) || (task.notBefore && start < datetime(task.notBefore))) invalid('계획 범위·현재 시각·마감·시작 가능일을 위반했습니다.');
    if (minute(block.start) < minute(settings.dayStart) || minute(block.end) > minute(settings.dayEnd) || length > settings.maxBlockMinutes) invalid('작업 가능 시간 또는 최대 연속 작업시간을 위반했습니다.');
    const nextUsed = (used.get(id) ?? 0) + length;
    if (nextUsed > remaining.get(id) || (length < settings.minSlotMinutes && nextUsed !== remaining.get(id))) invalid('잔여 작업량 또는 최소 블록 길이를 위반했습니다.');
    const unitIndex = task.units.findIndex(u => key(task.id, u.subtaskId) === id);
    for (const earlier of task.units.slice(0, unitIndex)) {
      const earlierId = key(task.id, earlier.subtaskId);
      if ((used.get(earlierId) ?? 0) !== earlier.remaining) invalid('선행 하위작업이 남아 있습니다.');
      const available = Math.max(finishes.get(earlierId) ?? -Infinity, earlier.reservedUntil ? Date.parse(earlier.reservedUntil) : -Infinity);
      if (available > start) invalid('선행 하위작업이 끝나기 전에 다음 작업이 시작됐습니다.');
    }
    const unit = task.units[unitIndex];
    if (unit.reservedUntil && start < Date.parse(unit.reservedUntil)) invalid('진행 중 작업과 새 블록이 겹칩니다.');
    const rest = restAfter(block);
    if (!Number.isSafeInteger(rest) || rest < 0 || rest > 1440) invalid('업무 후 휴식시간이 올바르지 않습니다.');
    for (const other of occupiedWindows) {
      const a = instant(other, 'start'), b = instant(other, 'end');
      if (start < b && end + rest * 60000 > a) invalid('고정 일정·이동·휴식 구간과 충돌합니다.');
    }
    used.set(id, nextUsed); finishes.set(id, end);
  }
  const all = [...preservedBlocks, ...blocks].sort((a, b) => instant(a, 'start') - instant(b, 'start'));
  for (const block of blocks) for (const other of all) {
    if (block === other || ['missed', 'cancelled'].includes(other.status)) continue;
    const a = instant(block, 'start'), b = instant(other, 'start');
    if (a <= b ? instant(block, 'end') + restAfter(block) * 60000 > b : instant(other, 'end') + restAfter(other) * 60000 > a) invalid('업무 블록끼리 겹치거나 업무 후 휴식이 부족합니다.');
  }
  for (const date of new Set(blocks.map(b => b.date))) {
    const daily = all.filter(b => b.date === date && ['planned', 'done'].includes(b.status));
    if (daily.reduce((sum, b) => sum + minute(b.end) - minute(b.start), 0) > settings.maxDailyMinutes) invalid('하루 최대 작업량을 초과했습니다.');
    const left = Math.max(minute(settings.dayStart), date === context.planningFrom ? (now - (day(date) - KST)) / 60000 : 0);
    const right = minute(settings.dayEnd);
    const busy = [...occupiedWindows.filter(b => b.date === date).map(b => [minute(b.start), minute(b.end)]), ...daily.map(b => [minute(b.start), Math.min(1440, minute(b.end) + restAfter(b))])];
    if (right - left - unionMinutes(busy, left, right) < settings.dailyRestMinutes) invalid('하루 여유 휴식시간이 부족합니다.');
  }
  const omissions = new Map();
  for (const omission of plan.omissions) {
    const id = key(omission.taskId, omission.subtaskId);
    if (!remaining.has(id) || !omission.reason.trim()) invalid('미배치 사유의 작업 ID 또는 이유가 올바르지 않습니다.');
    omissions.set(id, omission.reason);
  }
  const unplaced = [];
  for (const task of priorities) {
    let total = 0; const reasons = [];
    for (const unit of task.units) {
      const id = key(task.id, unit.subtaskId), missing = unit.remaining - (used.get(id) ?? 0);
      if (missing > 0) {
        if (!omissions.has(id)) invalid('배치하지 않은 잔여 작업에 구체적인 사유가 필요합니다.');
        total += missing; reasons.push(omissions.get(id));
      }
    }
    if (total) unplaced.push({ taskId: task.id, remainingMinutes: total, reason: [...new Set(reasons)].join(' ') });
  }
  return { blocks, unplaced };
}

export function createAiPlanner({ completeFn = complete } = {}) {
  return async function planSchedule(db, options) {
    const context = buildPlanningContext(db, options);
    if (!context.priorities.length) return { scheduledBlocks: context.preservedBlocks,
      changes: diffScheduledBlocks(db.scheduledBlocks ?? [], context.preservedBlocks, options.reason), unplaced: [] };
    const messages = [{ role: 'user', content: JSON.stringify(context) }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = await completeFn({ system: PLANNING_SYSTEM_PROMPT, schema: PLANNING_SCHEMA, name: 'schedule_plan', messages });
      try {
        const plan = JSON.parse(content);
        const { blocks, unplaced } = validatePlan(plan, context);
        const generated = blocks.map(({ subtaskId, ...b }) => {
          const previous = context.previousFutureBlocks.find(p => p.taskId === b.taskId && (p.subtaskId ?? null) === subtaskId && p.date === b.date && p.start === b.start && p.end === b.end);
          return { ...b, id: previous?.id ?? randomUUID(), ...(subtaskId === null ? {} : { subtaskId }) };
        });
        const scheduledBlocks = [...context.preservedBlocks, ...generated].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        return { scheduledBlocks, changes: diffScheduledBlocks(db.scheduledBlocks ?? [], scheduledBlocks, options.reason), unplaced,
          planning: { engine: 'ai', summary: plan.summary } };
      } catch (error) {
        if (attempt === 1) throw Object.assign(new Error(`AI 일정이 조건을 충족하지 못했어요. 기존 일정은 유지됩니다. ${error.message}`), { status: 502 });
        messages.push({ role: 'assistant', content }, { role: 'user', content: JSON.stringify({ validationErrors: [error.message], instruction: '전체 계획을 조건에 맞게 다시 작성하세요.' }) });
      }
    }
  };
}
export const planSchedule = createAiPlanner();
