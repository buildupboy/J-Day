import { minute } from '../scheduler/time.js';
import { fail, object, integer } from './validation.js';
import { replan, hhmm } from './planner.js';

const defaults = { preferredTime: null, notifications: { enabled: true, beforeMinutes: 10, freeTime: true } };
const preferred = new Set(['morning', 'afternoon', 'evening', 'night']);
const allowed = ['dayStart', 'dayEnd', 'minSlotMinutes', 'maxBlockMinutes', 'breakMinutes', 'maxDailyMinutes',
  'bufferMinutes', 'distribution', 'preferredTime', 'notifications'];

export function getMe(db) { return { id: db.user.id, name: db.user.name }; }
export function getSettings(db) {
  const { notifications, ...rest } = db.user.settings;
  return { ...defaults, ...rest, notifications: { ...defaults.notifications, ...notifications } };
}

/** 스케줄러가 쓰는 값(작업 가능 시간·휴게·작업 스타일)은 바꾸면 바로 재배치한다. */
export function patchSettings(db, input, { now }) {
  object(input);
  const next = { ...db.user.settings };
  const unknown = Object.keys(input).filter(key => !allowed.includes(key));
  if (unknown.length) fail(`바꿀 수 없는 설정입니다: ${unknown.join(', ')}`);
  if (input.dayStart !== undefined) next.dayStart = hhmm(input.dayStart, 'dayStart');
  if (input.dayEnd !== undefined) next.dayEnd = hhmm(input.dayEnd, 'dayEnd');
  if (input.minSlotMinutes !== undefined) next.minSlotMinutes = integer(input.minSlotMinutes, 'minSlotMinutes', 5, 240);
  if (input.maxBlockMinutes !== undefined) next.maxBlockMinutes = integer(input.maxBlockMinutes, 'maxBlockMinutes', 5, 480);
  if (input.breakMinutes !== undefined) next.breakMinutes = integer(input.breakMinutes, 'breakMinutes', 0, 120);
  if (input.maxDailyMinutes !== undefined) next.maxDailyMinutes = integer(input.maxDailyMinutes, 'maxDailyMinutes', 0, 1440);
  if (input.bufferMinutes !== undefined) next.bufferMinutes = integer(input.bufferMinutes, 'bufferMinutes', 0, 600);
  if (input.distribution !== undefined) {
    if (!['early', 'balanced'].includes(input.distribution)) fail('distribution은 early 또는 balanced여야 합니다.');
    next.distribution = input.distribution;
  }
  if (input.preferredTime !== undefined) {
    if (input.preferredTime !== null && !preferred.has(input.preferredTime)) fail('preferredTime은 morning, afternoon, evening, night 또는 null이어야 합니다.');
    next.preferredTime = input.preferredTime;
  }
  if (input.notifications !== undefined) {
    const { enabled, beforeMinutes, freeTime, ...extra } = object(input.notifications, 'notifications');
    if (Object.keys(extra).length) fail('notifications에는 enabled, beforeMinutes, freeTime만 쓸 수 있습니다.');
    if (enabled !== undefined && typeof enabled !== 'boolean') fail('enabled는 boolean이어야 합니다.');
    if (freeTime !== undefined && typeof freeTime !== 'boolean') fail('freeTime은 boolean이어야 합니다.');
    if (beforeMinutes !== undefined) integer(beforeMinutes, 'beforeMinutes', 0, 120);
    const given = Object.fromEntries(Object.entries({ enabled, beforeMinutes, freeTime }).filter(([, value]) => value !== undefined));
    next.notifications = { ...defaults.notifications, ...next.notifications, ...given };
  }
  if (minute(next.dayStart) >= minute(next.dayEnd)) fail('dayStart는 dayEnd보다 빨라야 합니다.');
  if (next.maxBlockMinutes < next.minSlotMinutes) fail('maxBlockMinutes는 minSlotMinutes 이상이어야 합니다.');
  db.user.settings = next;
  return { settings: getSettings(db), ...replan(db, now) };
}
