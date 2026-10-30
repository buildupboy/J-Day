export const DAY = 86400000;
export const KST = 9 * 60 * 60000;

export function minute(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) throw new RangeError('시간은 HH:mm 형식이어야 합니다.');
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function clock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function day(value) {
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) throw new RangeError('유효한 YYYY-MM-DD 날짜가 필요합니다.');
  return result;
}
export function datetime(value) {
  const result = Date.parse(value);
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(result)) throw new RangeError('시간대가 포함된 유효한 일시가 필요합니다.');
  return result;
}
export function timestamp(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError('유효한 now Date가 필요합니다.');
  return now.getTime();
}
export function instant(block, key) {
  return day(block.date) - KST + minute(block[key]) * 60000;
}
export function positive(value, name, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} 값이 올바르지 않습니다.`);
  return value;
}
/** 날짜가 지정된 일정은 그 날에만, 아니면 요일 반복으로 적용한다. */
export function appliesOn(block, date, weekday) {
  return block.date !== undefined ? block.date === date : block.dayOfWeek.includes(weekday);
}
/** 한국 시간 기준 자정부터의 분. */
export function kstMinutes(now) {
  return Math.floor(((timestamp(now) + KST) % DAY) / 60000);
}
export function kstIso(now) {
  return new Date(timestamp(now) + KST).toISOString().replace('Z', '+09:00');
}
