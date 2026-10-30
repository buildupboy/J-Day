// 캘린더 날짜 계산 (월요일 시작)

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** 해당 날짜가 속한 주의 월~일 7일 */
export function getWeekDays(date) {
  const offset = (date.getDay() + 6) % 7;
  const monday = addDays(date, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 월간 달력용: 해당 월을 덮는 주 단위 날짜 배열 (월~일 × n주) */
export function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = getWeekDays(first)[0];
  const end = getWeekDays(last)[6];
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}
