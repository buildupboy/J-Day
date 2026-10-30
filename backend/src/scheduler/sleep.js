import { minute } from './time.js';

// 수면은 고정 일정 목록에 넣지 않고 매일 반복되는 점유 구간으로만 계산한다.
export function sleepIntervals(settings) {
  if (settings.sleep == null) return [];
  const start = minute(settings.sleep.start), end = minute(settings.sleep.end);
  if (start >= 1440 || end >= 1440 || start === end) throw new RangeError('취침과 기상은 서로 다른 00:00~23:59 시각이어야 합니다.');
  if (start < end) return [{ start: settings.sleep.start, end: settings.sleep.end }];
  return [...(end > 0 ? [{ start: '00:00', end: settings.sleep.end }] : []), { start: settings.sleep.start, end: '24:00' }];
}
