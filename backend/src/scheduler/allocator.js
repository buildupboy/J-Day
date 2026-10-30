import { DAY, KST, minute, clock, day, datetime, positive, timestamp } from './time.js';
import { remainingWork } from './workload.js';
import { sleepIntervals } from './sleep.js';
import { restIntervals } from './rest.js';
import { prioritizeSlots } from './preferred-period.js';

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
    ...sleepIntervals(settings),
    ...restIntervals(settings),
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

/** 규칙 기반 배치는 제거됨. AI 입력 준비와 결과 검증을 사용한다. */
export function allocate() {
  const error = new Error('규칙 기반 배치는 비활성화되었습니다. preparePlanningContext와 AI 배치 결과 API를 사용하세요.');
  error.code = 'RULE_BASED_ALLOCATION_DISABLED';
  throw error;
}
