// 날짜·시간 유틸

/** 예: "10월 30일 (금)" */
export function formatKoreanDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

/** 'HH:mm' → 자정 기준 분 */
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 자정 기준 분 → 'HH:mm' */
export function fromMinutes(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** 90 → "1시간 30분", 45 → "45분" */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  return h ? `${h}시간` : `${m}분`;
}

/** 겹치는 구간을 합쳐서, [from, to] 안의 빈 구간 목록을 구한다. minGap(분) 미만 틈은 제외 */
export function freeSlots(blocks, from, to, minGap = 15) {
  const spans = blocks
    .map((b) => [Math.max(toMinutes(b.start), from), Math.min(toMinutes(b.end), to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const slots = [];
  let cursor = from;
  for (const [s, e] of spans) {
    if (s - cursor >= minGap) slots.push({ start: cursor, end: s, minutes: s - cursor });
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= minGap) slots.push({ start: cursor, end: to, minutes: to - cursor });
  return slots;
}

/** 빈 시간의 총합(분) */
export function freeMinutes(blocks, from, to, minGap = 15) {
  return freeSlots(blocks, from, to, minGap).reduce((sum, s) => sum + s.minutes, 0);
}
