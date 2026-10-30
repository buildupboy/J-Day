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

/** 겹치는 구간을 합쳐서, [from, to] 안에서 비어 있는 시간(분)을 구한다. 15분 미만 틈은 제외 */
export function freeMinutes(blocks, from, to, minGap = 15) {
  const spans = blocks
    .map((b) => [Math.max(toMinutes(b.start), from), Math.min(toMinutes(b.end), to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let cursor = from;
  let free = 0;
  for (const [s, e] of spans) {
    if (s - cursor >= minGap) free += s - cursor;
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= minGap) free += to - cursor;
  return free;
}
