import { DAY, day, minute, clock } from './time.js';
import { sleepIntervals } from './sleep.js';
import { restIntervals } from './rest.js';
import { fixedOccursOn } from './fixed-occurrence.js';

/**
 * 빈 시간 계산과 결과 검증에서 동일한 수면·휴식·고정 일정·이동 제약을 사용한다.
 * 고정 일정(수업·알바·루틴) 앞뒤로 작업 사이 휴식(breakMinutes)만큼 비워 두어 작업과 붙지 않게 한다.
 */
export function blockedWindows(date, fixedBlocks, settings) {
  const stamp = day(date);
  const result = [...sleepIntervals(settings).map(b => ({ ...b, date, kind: 'sleep' })),
    ...restIntervals(settings).map(b => ({ ...b, date, kind: 'rest' }))];
  if ((settings.unavailableDates ?? []).includes(date)) result.push({ date, start: '00:00', end: '24:00', kind: 'day_off' });
  for (const fixed of fixedBlocks) {
    const travel = fixed.travelMinutes ?? settings.travelMinutes ?? 0;
    if (!Number.isSafeInteger(travel) || travel < 0 || travel > 1440) throw new RangeError('이동시간은 0~1440분 정수여야 합니다.');
    const pad = settings.breakMinutes ?? 0;
    if (fixedOccursOn(fixed, date)) result.push({ date, start: clock(Math.max(0, minute(fixed.start) - pad)),
      end: clock(Math.min(1440, minute(fixed.end) + travel + pad)), kind: 'fixed_and_travel', title: fixed.title });
    if (fixedOccursOn(fixed, new Date(stamp - DAY).toISOString().slice(0, 10)) && minute(fixed.end) + travel + pad > 1440) result.push({ date, start: '00:00', end: clock(minute(fixed.end) + travel + pad - 1440), kind: 'travel' });
  }
  return result;
}
