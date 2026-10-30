import { blockedWindows } from './blocked-windows.js';
import { minute, day, datetime, timestamp, instant } from './time.js';
import { fingerprint, schedulingRevision, availableWindows } from './planning-context.js';
import { diffScheduledBlocks } from './rescheduler.js';
import { fail, object, text } from '../services/validation.js';

/** AI가 선택한 시각을 검사한다. 보정·이동·빈 구간 자동 채우기를 하지 않는다. */
export function acceptAiPlan(db, input, { now }) {
  object(input);
  const state = db.aiScheduling;
  if (!state?.context || input.contextId !== state.context.contextId) fail('현재 AI 배치 요청과 contextId가 다릅니다. 새 요청을 준비하세요.', 409);
  if (!Array.isArray(input.blocks) || input.blocks.length > 1000) fail('blocks는 최대 1000개의 배열이어야 합니다.');
  const planHash = fingerprint(input.blocks);
  if (state.status === 'applied') {
    if (state.planHash !== planHash || state.appliedRevision !== schedulingRevision(db)) fail('이미 적용했거나 변경된 배치 요청입니다.', 409);
    return { rescheduled: true, schedulingStatus: 'applied', scheduledBlocks: structuredClone(db.scheduledBlocks ?? []), changes: [], unplaced: structuredClone(state.unplaced), aiScheduling: state };
  }
  const context = state.context;
  if (context.sourceRevision !== schedulingRevision(db)) fail('작업·일정·설정이 변경됐습니다. AI 배치 입력을 다시 준비하세요.', 409);
  const current = Math.ceil(timestamp(now) / 60000) * 60000;
  const originals = db.scheduledBlocks ?? [], protectedIds = new Set(context.protectedBlocks.map(block => block.id));
  if (originals.some(block => context.replaceableBlockIds.includes(block.id) && instant(block, 'start') < timestamp(now))) fail('기존 예정 블록이 시작됐습니다. AI 배치 입력을 갱신하세요.', 409);
  const ids = new Set(protectedIds), tasks = new Map(context.rankedTasks.map(task => [task.taskId, task]));
  const allocated = new Map(), allocatedUnits = new Map();
  const normalized = input.blocks.map((value, index) => {
    object(value, 'block');
    const subtaskId = value.subtaskId ?? undefined;
    const task = tasks.get(value.taskId);
    if (!task) fail('배치할 수 없는 작업 ID입니다.');
    const id = value.id === undefined ? `ai-${context.contextId.slice(0, 20)}-${index}` : text(value.id, 'block.id');
    if (ids.has(id)) fail('블록 ID가 중복되거나 보존 기록과 충돌합니다.');
    ids.add(id);
    let start, end;
    try { day(value.date); start = minute(value.start); end = minute(value.end); } catch { fail('AI 블록의 날짜·시간 형식이 올바르지 않습니다.'); }
    if (value.date < context.window.from || value.date > context.window.to || start >= end || start < minute(context.settings.dayStart) || end > minute(context.settings.dayEnd)) fail('배치 범위 또는 하루 운영 시간을 벗어났습니다.');
    if (value.status !== undefined && value.status !== 'planned') fail('AI는 planned 블록만 제안할 수 있습니다.');
    const block = { id, taskId: value.taskId, date: value.date, start: value.start, end: value.end, status: 'planned', source: 'ai' };
    if ((context.unavailableDates ?? context.settings.unavailableDates ?? []).includes(value.date)) fail('사용자가 쉬기로 한 날짜에는 새 작업을 배치할 수 없습니다.');
    const length = end - start;
    if (instant(block, 'start') < current || instant(block, 'end') > datetime(task.deadline) || (task.notBefore && instant(block, 'start') < datetime(task.notBefore))) fail('현재 시각·시작 가능 시각·마감 조건을 벗어났습니다.');
    if (length > context.settings.maxBlockMinutes) fail('최대 작업 블록 길이를 초과했습니다.');
    const unit = task.subtasks.find(unit => unit.subtaskId === subtaskId);
    if (!unit || (task.subtasks.some(unit => unit.subtaskId !== undefined) && subtaskId === undefined)) fail('하위작업 ID가 없거나 올바르지 않습니다.');
    if (subtaskId !== undefined) block.subtaskId = subtaskId;
    if (value.placementReason !== undefined) block.placementReason = text(value.placementReason, 'placementReason');
    const unitKey = JSON.stringify([task.taskId, subtaskId ?? null]);
    allocated.set(task.taskId, (allocated.get(task.taskId) ?? 0) + length);
    allocatedUnits.set(unitKey, (allocatedUnits.get(unitKey) ?? 0) + length);
    if (allocated.get(task.taskId) > task.remainingMinutes || allocatedUnits.get(unitKey) > unit.remainingMinutes) fail('남은 작업량보다 많이 배치했습니다.');
    return block;
  });
  const all = [...context.protectedBlocks, ...normalized];
  for (const block of normalized) {
    const weekday = new Date(day(block.date)).getUTCDay(), start = minute(block.start), end = minute(block.end);
    for (const fixed of blockedWindows(block.date, context.fixedBlocks, context.settings)) {
      if (start < minute(fixed.end) && minute(fixed.start) < end) fail('고정 일정·이동·수면·지정 휴식과 겹칩니다.');
    }
    for (const other of all.filter(other => other.id !== block.id)) {
      if (other.date !== block.date) {
        const earlier = instant(block, 'start') < instant(other, 'start') ? block : other;
        const later = earlier === block ? other : block;
        const rest = db.tasks.find(task => task.id === earlier.taskId)?.breakAfterMinutes ?? context.settings.breakMinutes;
        if (instant(later, 'start') - instant(earlier, 'end') < rest * 60000) fail('날짜 경계의 작업 간 휴식이 부족합니다.');
        continue;
      }
      const gap = Math.max(minute(other.start) - end, start - minute(other.end));
      const earlier = start >= minute(other.end) ? other : block;
      const earlierTask = db.tasks.find(task => task.id === earlier.taskId);
      // 짧은 작업을 묶은 작업은 하위작업 블록 사이에 쉬는 시간을 두지 않는다. 마지막 블록 뒤에는 그대로 적용한다.
      const rest = earlier.taskId === block.taskId && earlierTask?.skipInnerBreak ? 0 : earlierTask?.breakAfterMinutes ?? context.settings.breakMinutes;
      if (gap < rest) fail('다른 블록과 겹치거나 휴식 시간이 부족합니다.');
      if (start < minute(other.end) && minute(other.start) < end) fail('다른 블록과 겹칩니다.');
    }
  }
  for (const date of new Set(normalized.map(block => block.date))) {
    const work = all.filter(block => block.date === date && ['planned', 'done'].includes(block.status)).reduce((sum, block) => sum + minute(block.end) - minute(block.start), 0);
    if (work > context.settings.maxDailyMinutes) fail('하루 작업량 한도를 초과했습니다.');
    const baseline = availableWindows(date, context.fixedBlocks, context.protectedBlocks, context.settings, now).reduce((sum, slot) => sum + minute(slot.end) - minute(slot.start), 0);
    const remaining = availableWindows(date, context.fixedBlocks, all, context.settings, now).reduce((sum, slot) => sum + minute(slot.end) - minute(slot.start), 0);
    if (remaining < Math.min(context.settings.bufferMinutes, baseline)) fail('돌발 상황용 여유 시간이 부족합니다.');
  }
  for (const task of context.rankedTasks) {
    let precedingEnd = -Infinity, precedingIncomplete = false;
    // 짧은 작업을 묶은 작업은 하위작업 사이에 쉬는 시간을 요구하지 않는다.
    const successorGap = (task.skipInnerBreak ? 0 : context.settings.breakMinutes) * 60000;
    for (const unit of task.subtasks) {
      const blocks = normalized.filter(block => block.taskId === task.taskId && block.subtaskId === unit.subtaskId);
      if (unit.subtaskId !== undefined && blocks.length && (precedingIncomplete || blocks.some(block => instant(block, 'start') < precedingEnd))) fail('하위작업 순서 또는 선행 작업 완료 조건을 위반했습니다.');
      const placed = allocatedUnits.get(JSON.stringify([task.taskId, unit.subtaskId ?? null])) ?? 0;
      if (unit.subtaskId !== undefined) {
        if (unit.remainingMinutes > placed) precedingIncomplete = true;
        precedingEnd = Math.max(precedingEnd, ...blocks.map(block => instant(block, 'end') + successorGap), unit.reservedUntil ? datetime(unit.reservedUntil) + successorGap : -Infinity);
      }
    }
  }
  const scheduledBlocks = all.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const unplaced = context.rankedTasks.map(task => ({ taskId: task.taskId, remainingMinutes: task.remainingMinutes - (allocated.get(task.taskId) ?? 0) })).filter(item => item.remainingMinutes > 0);
  const aiScheduling = { ...state, status: 'applied', planHash, appliedAt: now.toISOString(), unplaced,
    appliedRevision: schedulingRevision({ ...db, scheduledBlocks }) };
  return { rescheduled: true, schedulingStatus: 'applied', scheduledBlocks, changes: diffScheduledBlocks(originals, scheduledBlocks, context.reason), unplaced, aiScheduling };
}
