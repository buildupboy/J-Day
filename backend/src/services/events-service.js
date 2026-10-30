import { randomUUID } from 'node:crypto';
import { clock, minute, kstMinutes } from '../scheduler/time.js';
import { todayKst } from '../scheduler/timeline.js';
import { fail, object, text } from './validation.js';
import { replan, hhmm, ymd } from './planner.js';

function eventById(db, id) {
  const event = (db.events ?? []).find(event => event.id === id);
  if (!event) fail('일정을 찾을 수 없습니다.', 404);
  return event;
}

/** 새 입력과 기존 값을 합쳐 검증한다. openEnded이면 end는 비운다. */
function build(input, base = {}) {
  object(input);
  const merged = { ...base, ...input };
  const event = { id: base.id ?? (input.id === undefined ? randomUUID() : text(input.id, 'id')),
    title: text(merged.title, 'title'), date: ymd(merged.date, 'date'), start: hhmm(merged.start, 'start') };
  if (merged.openEnded === true) {
    event.openEnded = true;
    if (minute(event.start) >= 1440) fail('start 값이 올바르지 않습니다.');
  } else {
    event.end = hhmm(merged.end, 'end');
    if (minute(event.start) >= minute(event.end)) fail('end는 start보다 늦어야 합니다.');
  }
  for (const key of ['location', 'memo', 'category']) {
    if (merged[key] !== undefined && merged[key] !== null && merged[key] !== '') event[key] = text(merged[key], key);
  }
  for (const key of ['freePlan', 'freeUntil', 'returnedAt', 'auto']) if (base[key] !== undefined) event[key] = base[key];
  return event;
}

export function listEvents(db, { from, to } = {}) {
  if (from !== undefined) ymd(from, 'from');
  if (to !== undefined) ymd(to, 'to');
  return (db.events ?? []).filter(event => (from === undefined || event.date >= from) && (to === undefined || event.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function createEvent(db, input, { now }) {
  const event = build(input);
  db.events ??= [];
  if (db.events.some(existing => existing.id === event.id)) fail('이미 존재하는 일정 ID입니다.', 409);
  db.events.push(event);
  return { event, ...replan(db, now) };
}

export function updateEvent(db, id, input, { now }) {
  const event = eventById(db, id);
  object(input);
  const base = { ...event };
  if (input.openEnded === false || (input.end !== undefined && input.openEnded === undefined)) delete base.openEnded;
  if (input.openEnded === true) delete base.end;
  const next = build({ ...input, id: undefined }, base);
  db.events[db.events.indexOf(event)] = next;
  return { event: next, ...replan(db, now) };
}

export function deleteEvent(db, id, { now }) {
  const event = eventById(db, id);
  db.events = db.events.filter(candidate => candidate !== event);
  return { deleted: id, ...replan(db, now) };
}

/** 자유 시간 시작: 남은 작업을 내일로 넘기거나 지정한 시각 이후로 미룬다. */
export function setFreePlan(db, id, input, { now }) {
  const event = eventById(db, id);
  object(input);
  if (!event.openEnded) fail('끝 시간이 없는 일정에만 쓸 수 있습니다.');
  if (input.action === 'tomorrow') {
    event.freePlan = 'tomorrow';
    delete event.freeUntil;
  } else if (input.action === 'after') {
    const time = hhmm(input.time, 'time');
    if (minute(time) <= minute(event.start)) fail('time은 일정 시작보다 늦어야 합니다.');
    event.freePlan = 'after';
    event.freeUntil = time;
  } else fail('action은 tomorrow 또는 after여야 합니다.');
  return { event, ...replan(db, now) };
}

/** "돌아왔어요": 지금 시각으로 자유 시간을 끝내고 남은 일정을 다시 배치한다. */
export function returnFromFree(db, id, { now }) {
  const event = eventById(db, id);
  if (event.returnedAt) fail('이미 돌아온 일정입니다.', 409);
  if (!event.openEnded) fail('끝 시간이 없는 일정에만 쓸 수 있습니다.');
  const start = minute(event.start);
  const today = todayKst(now);
  const end = event.date !== today ? Math.min(1440, start + 1) : Math.min(1440, Math.max(start + 1, kstMinutes(now)));
  event.end = clock(end);
  event.returnedAt = now.toISOString();
  delete event.openEnded;
  delete event.freeUntil;
  return { event, ...replan(db, now) };
}
