import { DAY, KST, day, timestamp } from './time.js';
import { explainSchedule } from './explanations.js';

export function todayKst(now) { return new Date(timestamp(now) + KST).toISOString().slice(0, 10); }
export function timeline(db, date, { explain = false, now } = {}) {
  const weekday = new Date(day(date)).getUTCDay();
  const tasks = new Map(db.tasks.map(task => [task.id, task]));
  const scheduled = (db.scheduledBlocks ?? []).filter(block => block.date === date);
  const items = [
    ...db.fixedBlocks.filter(block => block.dayOfWeek.includes(weekday)).map(block => ({
      source: 'fixed', id: block.id, kind: block.kind, title: block.title,
      start: block.start, end: block.end, ...(block.location === undefined ? {} : { location: block.location }),
    })),
    ...scheduled.map(block => {
      const task = tasks.get(block.taskId), subtask = task?.subtasks?.find(subtask => subtask.id === block.subtaskId);
      return { ...block, source: 'scheduled', ...(block.source ? { placementSource: block.source } : {}), title: subtask?.title ?? task?.title ?? block.taskId };
    }),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.source.localeCompare(b.source));
  const result = { date, items };
  if (explain) result.explanations = explainSchedule(db.tasks, { scheduledBlocks: scheduled }, { settings: db.user.settings, now });
  return result;
}
export function weekTimeline(db, from, options = {}) {
  const start = day(from);
  const days = Array.from({length: 7}, (_, index) => timeline(db, new Date(start + index * DAY).toISOString().slice(0, 10), options));
  return { from, to: days[6].date, days };
}
export function mondayKst(now) {
  const date = todayKst(now), stamp = day(date);
  const offset = (new Date(stamp).getUTCDay() + 6) % 7;
  return new Date(stamp - offset * DAY).toISOString().slice(0, 10);
}
