import { minute } from './time.js';

// 고정 휴식도 매일 반복되는 점유 구간으로 계산하고 자정 경계에서 나눈다.
export function restIntervals(settings) {
  const periods = settings.restPeriods === undefined ? [] : settings.restPeriods;
  if (!Array.isArray(periods) || periods.length > 8) throw new RangeError('지정 휴식은 최대 8개까지 등록할 수 있어요.');
  return periods.flatMap((period) => {
    if (!period || typeof period !== 'object' || Array.isArray(period) || Object.keys(period).some((key) => !['start', 'end'].includes(key))) throw new RangeError('지정 휴식 형식이 올바르지 않아요.');
    const start = minute(period.start), end = minute(period.end);
    if (start >= 1440 || start === end) throw new RangeError('휴식 시작과 종료를 서로 다르게 설정해 주세요.');
    if (start < end) return [{ start: period.start, end: period.end }];
    return [...(end > 0 ? [{ start: '00:00', end: period.end }] : []), { start: period.start, end: '24:00' }];
  });
}
