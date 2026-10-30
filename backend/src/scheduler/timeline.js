import { DAY, KST, day, timestamp } from './time.js';
import { explainSchedule } from './explanations.js';
import { fixedOccursOn } from './fixed-occurrence.js';
import { restIntervals } from './rest.js';
import { sleepIntervals } from './sleep.js';

export function todayKst(now) { return new Date(timestamp(now) + KST).toISOString().slice(0, 10); }
export function timeline(db, date, { explain = false, now } = {}) {
  const tasks = new Map(db.tasks.map(task => [task.id, task]));
  const scheduled = (db.scheduledBlocks ?? []).filter(block => block.date === date);
  const items = [
    ...db.fixedBlocks.filter(block => fixedOccursOn(block, date)).map(block => ({
      source: 'fixed', id: block.id, kind: block.kind, title: block.title,
      ...(block.date ? { fixedDate: block.date } : {}),
      start: block.start, end: block.end, dayOfWeek: block.dayOfWeek, ...(block.location === undefined ? {} : { location: block.location }),
      ...(block.memo === undefined ? {} : { memo: block.memo }),
    })),
    // 매일 꼭 쉬고 싶은 시간(마이 > 휴게 시간)은 캘린더에 휴식으로 보여 준다
    ...restIntervals(db.user?.settings ?? {}).map((period, index) => ({ source: 'rest', id: `rest-${index}`, kind: 'break', title: '휴식', start: period.start, end: period.end })),
    // 수면 시간(마이 > 수면)도 캘린더에 보여 준다. 자정을 넘기면 그날의 00:00~기상, 취침~24:00 두 칸으로 나뉜다
    ...sleepIntervals(db.user?.settings ?? {}).map((period, index) => ({ source: 'sleep', id: `sleep-${index}`, kind: 'sleep', title: '🌙 수면', start: period.start, end: period.end })),
    ...scheduled.map(block => {
      const task = tasks.get(block.taskId), subtask = task?.subtasks?.find(subtask => subtask.id === block.subtaskId);
      return { ...block, source: 'scheduled', ...(block.source ? { placementSource: block.source } : {}), title: subtask?.title ?? task?.title ?? block.taskId };
    }),
  ].filter(item => !(db.deletedCalendarItems ?? []).some(deleted => deleted.source === item.source && deleted.id === item.id && deleted.date === date)).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.source.localeCompare(b.source));
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
