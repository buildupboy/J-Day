import { minute } from './time.js';

/**
 * 반복 고정 일정에 날짜가 지정된 일정(events)을 합친다. 순수 함수.
 * 끝 시간이 없는 일정은 freeUntil, 없으면 하루 끝까지 비워 둔다.
 */
export function fixedWithEvents(db) {
  const dayEnd = db.user.settings.dayEnd;
  const events = (db.events ?? []).map(event => ({
    id: event.id, kind: 'event', title: event.title, date: event.date,
    start: event.start, end: event.end ?? event.freeUntil ?? dayEnd,
    ...(event.location ? { location: event.location } : {}), ...(event.end ? {} : { openEnded: true }),
  })).filter(event => minute(event.start) < minute(event.end));
  return [...db.fixedBlocks, ...events];
}
