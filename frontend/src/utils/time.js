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
