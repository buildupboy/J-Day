import { DAY, day, minute, kstMinutes } from '../scheduler/time.js';
import { timeline, todayKst } from '../scheduler/timeline.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { priorityOf } from './task-extras.js';
import { describeChanges, saveProposal } from './blocks-service.js';

const dayDiff = (from, to) => Math.round((day(to) - day(from)) / DAY);
const dateOf = iso => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
const timeOf = iso => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(11, 16);
const mondayOf = date => new Date(day(date) - ((new Date(day(date)).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
const view = item => ({ blockId: item.id, source: item.source, kind: item.kind, title: item.title, start: item.start, end: item.end,
  ...(item.openEnded ? { openEnded: true } : {}) });

/** 지금 진행 중인 일정·다음 일정·알림. 작업 블록을 고정 일정보다 먼저 현재로 본다. */
export function nowState(db, now) {
  const date = todayKst(now), minutes = kstMinutes(now);
  const items = timeline(db, date).items;
  const active = items.filter(item => minute(item.start) <= minutes && minutes < minute(item.end));
  const current = active.find(item => item.source === 'scheduled' && !item.endedAt) ?? active.find(item => item.source === 'fixed') ?? null;
  const next = items.find(item => minute(item.start) > minutes && item !== current) ?? null;
  let alert = null;
  const overdue = items.find(item => item.source === 'scheduled' && item.startedAt && !item.endedAt && minute(item.end) <= minutes);
  if (overdue) alert = { type: 'time_up', blockId: overdue.id, title: overdue.title };
  else {
    const free = (db.events ?? []).find(event => event.date === date && event.openEnded && !event.returnedAt
      && !event.freePlan && minute(event.start) <= minutes);
    if (free) alert = { type: 'free_time', eventId: free.id, title: free.title };
  }
  return {
    current: current && { ...view(current), remainingMin: minute(current.end) - minutes },
    next: next && { blockId: next.id, title: next.title, start: next.start },
    alert,
  };
}

/** 홈: 지금 · 다음 · 오늘 할 일 · 임박한 마감. */
export function todayView(db, now) {
  const date = todayKst(now);
  const { items } = timeline(db, date);
  const todos = items.filter(item => item.source === 'scheduled').map(item => ({
    blockId: item.id, taskId: item.taskId, title: item.title, start: item.start, end: item.end,
    done: item.status === 'done', status: item.status,
  }));
  const dueSoon = db.tasks.filter(task => task.status !== 'done').map(task => ({ id: task.id, title: task.title, deadline: task.deadline,
    dDay: dayDiff(date, dateOf(task.deadline)), priority: priorityOf(task), progress: task.progress }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  const { current, next } = nowState(db, now);
  return { date, current, next, todos, dueSoon, timeline: items };
}

/** 다가오는 일정: 일정(Event)과 작업 마감을 날짜순으로 합쳐 주 단위로 묶는다. */
export function upcoming(db, now) {
  const today = todayKst(now);
  const events = (db.events ?? []).filter(event => event.date >= today && !event.auto).map(event => ({
    kind: 'event', id: event.id, title: event.title, date: event.date, start: event.start, end: event.end ?? null,
    openEnded: Boolean(event.openEnded), dDay: dayDiff(today, event.date), must: false }));
  const tasks = db.tasks.filter(task => task.status !== 'done' && dateOf(task.deadline) >= today).map(task => ({
    kind: 'task', id: task.id, title: task.title, date: dateOf(task.deadline), start: timeOf(task.deadline), end: null,
    deadline: task.deadline, dDay: dayDiff(today, dateOf(task.deadline)), must: task.importance === 3,
    priority: priorityOf(task), progress: task.progress }));
  const items = [...events, ...tasks].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const weeks = new Map();
  for (const item of items) {
    const weekStart = mondayOf(item.date);
    if (!weeks.has(weekStart)) weeks.set(weekStart, { weekStart, weekEnd: new Date(day(weekStart) + 6 * DAY).toISOString().slice(0, 10), items: [] });
    weeks.get(weekStart).items.push(item);
  }
  return { today, weeks: [...weeks.values()] };
}

const hm = minutes => (minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ` : '') + (minutes % 60 || minutes < 60 ? `${minutes % 60}분` : '');

/** 아침 브리핑 문장. 재배치할 게 있으면 제안으로 저장해 proposalId를 돌려준다. */
export function briefing(db, now) {
  const { date, todos, dueSoon } = todayView(db, now);
  const workMin = todos.reduce((sum, todo) => sum + minute(todo.end) - minute(todo.start), 0);
  const sentences = [];
  if (todos.length) sentences.push(`오늘은 작업 ${todos.length}개, 총 ${hm(workMin).trim()} 해야 해요. 첫 작업은 ${todos[0].start}에 '${todos[0].title}'이에요.`);
  else sentences.push('오늘은 배치된 작업이 없어요.');
  const nearest = dueSoon[0];
  if (nearest) sentences.push(nearest.dDay === 0 ? `'${nearest.title}' 마감이 오늘이에요.` : `가장 가까운 마감은 '${nearest.title}'(D-${nearest.dDay})이에요.`);
  let proposalId = null;
  const result = reschedule(structuredClone(db), { now, reason: 'manual' });
  const changes = describeChanges(db, result.changes);
  if (changes.length) {
    sentences.push('밀린 작업이 있어서 다시 배치해 봤어요. 괜찮으면 확인해 주세요.');
    proposalId = saveProposal(db, { kind: 'briefing', message: sentences.at(-1), changes, afterBlocks: result.scheduledBlocks, now }).id;
  }
  return { date, text: sentences.join(' '), proposalId, changes };
}
