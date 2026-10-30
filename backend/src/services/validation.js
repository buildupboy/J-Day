import { datetime } from '../scheduler/time.js';

export function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export function object(value, name = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}는 객체여야 합니다.`);
  return value;
}
export function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${name} 값이 올바르지 않습니다.`);
  return value;
}
export function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) fail(`${name} 값이 올바르지 않습니다.`);
  return value.trim();
}
export function iso(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${name}는 시간대가 포함된 ISO 일시여야 합니다.`);
  const date = value.slice(0, 10), time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) fail(`${name} 날짜가 올바르지 않습니다.`);
  try { return datetime(value); } catch { fail(`${name} 값이 올바르지 않습니다.`); }
}
export function explainRequested(query) {
  if (query.explain === undefined || query.explain === 'false') return false;
  if (query.explain === 'true') return true;
  fail('explain은 true 또는 false여야 합니다.');
}
