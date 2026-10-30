import { DAY, day, minute, clock, occursOn } from './time.js';
import { sleepIntervals } from './sleep.js';
import { restIntervals } from './rest.js';

/** 빈 시간 계산과 결과 검증에서 동일한 수면·휴식·고정 일정·이동 제약을 사용한다. */
export function blockedWindows(date, fixedBlocks, settings) {
  const stamp = day(date), previousDate = new Date(stamp - DAY).toISOString().slice(0, 10);
  const result = [...sleepIntervals(settings).map(b => ({ ...b, date, kind: 'sleep' })),
    ...restIntervals(settings).map(b => ({ ...b, date, kind: 'rest' }))];
  for (const fixed of fixedBlocks) {
    const travel = fixed.travelMinutes ?? settings.travelMinutes ?? 0;
    if (!Number.isSafeInteger(travel) || travel < 0 || travel > 1440) throw new RangeError('이동시간은 0~1440분 정수여야 합니다.');
    if (occursOn(fixed, date)) result.push({ date, start: fixed.start,
      end: clock(Math.min(1440, minute(fixed.end) + travel)), kind: 'fixed_and_travel', title: fixed.title });
    if (occursOn(fixed, previousDate) && minute(fixed.end) + travel > 1440) result.push({ date, start: '00:00', end: clock(minute(fixed.end) + travel - 1440), kind: 'travel' });
  }
  return result;
}
