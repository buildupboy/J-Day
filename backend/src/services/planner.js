import { reschedule } from '../scheduler/rescheduler.js';
import { minute, day } from '../scheduler/time.js';
import { fail } from './validation.js';

/** 미래 planned 블록을 다시 계산해 db에 반영한다. 저장은 호출자의 updateDb가 담당한다. */
export function replan(db, now, reason = 'manual') {
  const result = reschedule(db, { now, reason });
  db.scheduledBlocks = result.scheduledBlocks;
  return { rescheduled: true, changes: result.changes, unplaced: result.unplaced };
}

export function hhmm(value, name) {
  try { minute(value); } catch { fail(`${name}는 HH:mm 형식이어야 합니다.`); }
  return value;
}
export function ymd(value, name) {
  try { day(value); } catch { fail(`${name}는 YYYY-MM-DD 형식이어야 합니다.`); }
  return value;
}
