import { DAY, KST, minute, clock, day, datetime, positive, timestamp } from './time.js';
import { remainingWork } from './workload.js';

function bounds(settings) {
  const start = minute(settings.dayStart), end = minute(settings.dayEnd);
  if (start >= end) throw new RangeError('dayStart는 dayEnd보다 빨라야 합니다.');
  positive(settings.minSlotMinutes, 'minSlotMinutes');
  return [start, end];
}

/** 특정 날짜의 고정 일정과 기존 블록을 제외한 HH:mm 빈 구간 목록. */
export function findFreeSlots(date, fixedBlocks, scheduledBlocks, settings) {
  const weekday = new Date(day(date)).getUTCDay();
  const [start, end] = bounds(settings);
  const occupied = [
    ...fixedBlocks.filter(block => block.dayOfWeek.includes(weekday)),
    ...scheduledBlocks.filter(block => block.date === date),
  ].map(block => {
    const left = minute(block.start), right = minute(block.end);
    if (left >= right) throw new RangeError('블록 종료는 시작보다 늦어야 합니다.');
    return [Math.max(start, left), Math.min(end, right)];
  }).filter(([left, right]) => left < right).sort((a, b) => a[0] - b[0]);
  const slots = [];
  let cursor = start;
  for (const [left, right] of [...occupied, [end, end]]) {
    if (left - cursor >= settings.minSlotMinutes) slots.push({ start: clock(cursor), end: clock(left) });
    cursor = Math.max(cursor, right);
  }
  return slots;
}

/** 마감 → 중요도 → 남은 작업량. 하위작업은 배열 순서대로 배치한다. 입력은 변경하지 않는다. */
export function allocate(tasks, fixedBlocks, { from, to, settings, existingBlocks = [], now }) {
  const first = day(from), last = day(to);
  if (first > last) throw new RangeError('from은 to보다 늦을 수 없습니다.');
  const [dayStart, dayEnd] = bounds(settings);
  const current = now === undefined ? -Infinity : Math.ceil(timestamp(now) / 60000) * 60000;
  const max = positive(settings.maxBlockMinutes, 'maxBlockMinutes');
  const rest = positive(settings.breakMinutes, 'breakMinutes', 0);
  const dailyLimit = settings.maxDailyMinutes === undefined ? 1440 : positive(settings.maxDailyMinutes, 'maxDailyMinutes', 0);
  const buffer = settings.bufferMinutes === undefined ? 0 : positive(settings.bufferMinutes, 'bufferMinutes', 0);
  const distribution = settings.distribution ?? 'early';
  if (!['early', 'balanced'].includes(distribution)) throw new RangeError('distribution은 early 또는 balanced여야 합니다.');
  if (dailyLimit > 1440 || buffer > 1440) throw new RangeError('하루 작업량과 여유 시간은 1440분 이하여야 합니다.');
  if (max < settings.minSlotMinutes) throw new RangeError('maxBlockMinutes는 minSlotMinutes 이상이어야 합니다.');
  const pending = tasks.filter(task => task.status !== 'done').map(task => {
    const importance = task.importance === undefined ? 2 : task.importance;
    if (!Number.isInteger(importance) || importance < 1 || importance > 3) throw new RangeError('importance는 1, 2, 3 중 하나여야 합니다.');
    const units = remainingWork(task, existingBlocks, now);
    return { task, importance, deadline: datetime(task.deadline),
      notBefore: task.notBefore === undefined ? -Infinity : datetime(task.notBefore), units,
      remaining: units.reduce((n, unit) => n + unit.remaining, 0) };
  }).sort((a, b) => a.deadline - b.deadline || b.importance - a.importance || b.remaining - a.remaining);
  const blocks = [], usedIds = new Set(existingBlocks.map(block => block.id));
  const occupied = existingBlocks.map(block => ({ ...block,
    start: clock(Math.max(0, minute(block.start) - rest)), end: clock(Math.min(1440, minute(block.end) + rest)),
  }));
  const dailyUsed = new Map();
  for (const block of existingBlocks) {
    if (block.status === 'planned' || block.status === 'done') dailyUsed.set(block.date, (dailyUsed.get(block.date) ?? 0) + minute(block.end) - minute(block.start));
  }
  const bufferedDates = new Set();
  function slotsFor(stamp) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    const start = Math.max(dayStart, (current - (stamp - KST)) / 60000);
    if (start >= dayEnd) return [];
    const dailySettings = { ...settings, dayStart: clock(start) };
    if (!bufferedDates.has(date)) {
      bufferedDates.add(date);
      let remainingBuffer = buffer;
      if (remainingBuffer > 0) {
        for (const slot of findFreeSlots(date, fixedBlocks, occupied, { ...dailySettings, minSlotMinutes: 1 }).reverse()) {
          const end = minute(slot.end), length = Math.min(remainingBuffer, end - minute(slot.start));
          if (length === 0) break;
          occupied.push({ date, start: clock(end - length), end: clock(end) });
          remainingBuffer -= length;
        }
      }
    }
    return findFreeSlots(date, fixedBlocks, occupied, dailySettings);
  }
  for (const item of pending) {
    if (item.remaining === 0) continue;
    const dates = [];
    for (let stamp = first; stamp <= last && stamp - KST < item.deadline; stamp += DAY) {
      if (stamp - KST + DAY <= Math.max(current, item.notBefore)) continue;
      dates.push(stamp);
    }
    // 배치 가능한 날짜 수로 과제별 목표량을 나눈다. 부족 시 아래에서 early 결과와 비교한다.
    const availableDays = dates.filter(stamp => slotsFor(stamp).some(slot => {
      const start = Math.max(minute(slot.start), Math.ceil((item.notBefore - (stamp - KST)) / 60000));
      const end = Math.min(minute(slot.end), Math.floor((item.deadline - (stamp - KST)) / 60000));
      return end - start >= settings.minSlotMinutes;
    })).length;
    const target = distribution === 'balanced' ? Math.ceil(item.remaining / Math.max(1, availableDays)) : Infinity;
    let unitIndex = 0, readyAfter = item.notBefore;
    function nextUnit() {
      while (unitIndex < item.units.length && item.units[unitIndex].remaining === 0) {
        const unit = item.units[unitIndex++];
        if (unit.subtaskId !== undefined) readyAfter = Math.max(readyAfter, unit.reservedUntil + rest * 60000);
      }
      return item.units[unitIndex];
    }
    for (const stamp of dates) {
      const date = new Date(stamp).toISOString().slice(0, 10), midnight = stamp - KST;
      const cutoff = Math.min(dayEnd, Math.floor((item.deadline - midnight) / 60000));
      let placedToday = 0;
      for (const slot of slotsFor(stamp)) {
        let cursor = minute(slot.start);
        const end = Math.min(minute(slot.end), cutoff);
        while (item.remaining > 0 && placedToday < target && (dailyUsed.get(date) ?? 0) < dailyLimit) {
          const unit = nextUnit();
          if (!unit) break;
          cursor = Math.max(cursor, Math.ceil((readyAfter - midnight) / 60000));
          if (end - cursor < settings.minSlotMinutes) break;
          const length = Math.min(max, unit.remaining, end - cursor, dailyLimit - (dailyUsed.get(date) ?? 0), target - placedToday);
          const base = `sb-${item.task.id}-${date}-${cursor}`;
          let id = base;
          for (let suffix = 1; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
          usedIds.add(id);
          const block = { id, taskId: item.task.id, date, start: clock(cursor), end: clock(cursor + length), status: 'planned' };
          if (unit.subtaskId !== undefined) block.subtaskId = unit.subtaskId;
          blocks.push(block);
          occupied.push({ ...block, start: clock(Math.max(0, cursor - rest)), end: clock(Math.min(1440, cursor + length + rest)) });
          dailyUsed.set(date, (dailyUsed.get(date) ?? 0) + length);
          item.remaining -= length;
          unit.remaining -= length;
          placedToday += length;
          cursor += length + rest;
          if (unit.subtaskId !== undefined) readyAfter = Math.max(readyAfter, midnight + cursor * 60000);
        }
      }
      if (item.remaining === 0) break;
    }
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const result = { blocks, unplaced: pending.filter(item => item.remaining > 0).map(item => ({ taskId: item.task.id, remainingMinutes: item.remaining })) };
  if (distribution === 'balanced' && result.unplaced.length > 0) {
    const early = allocate(tasks, fixedBlocks, { from, to, settings: { ...settings, distribution: 'early' }, existingBlocks, now });
    // 마감/중요도 우선순위가 높은 과제의 미배치량을 먼저 비교한다.
    for (const item of pending) {
      const balancedMissing = result.unplaced.find(entry => entry.taskId === item.task.id)?.remainingMinutes ?? 0;
      const earlyMissing = early.unplaced.find(entry => entry.taskId === item.task.id)?.remainingMinutes ?? 0;
      if (earlyMissing !== balancedMissing) return earlyMissing < balancedMissing ? early : result;
    }
  }
  return result;
}
