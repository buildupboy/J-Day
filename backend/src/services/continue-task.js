import { randomUUID } from 'node:crypto';
import { blockedWindows } from '../scheduler/blocked-windows.js';
import { instant, minute, clock, datetime } from '../scheduler/time.js';
import { fail } from './validation.js';

// Only the accepted transition skips a break; later blocks keep normal rest settings.
export function continueTask(db, task, input, now) {
  const block = db.scheduledBlocks.find(item => item.id === input.blockId && item.taskId === task.id);
  const next = db.scheduledBlocks.find(item => item.id === input.continueBlockId);
  const target = db.tasks.find(item => item.id === next?.taskId);
  if (!block || minute(block.end) - minute(block.start) >= 30 || instant(block, 'start') > now.getTime()) fail('시작한 30분 미만 작업만 이어서 진행할 수 있습니다.');
  if (!next || next.id === block.id || next.status !== 'planned' || !target || target.status === 'done' || next.date !== block.date || instant(next, 'start') < now.getTime()) fail('이어서 진행할 다음 작업을 찾을 수 없습니다.', 409);
  if (task.type === 'exam' || target.type === 'exam' || task.reviewOf || target.reviewOf) fail('시험·복습 작업은 기타 작업으로 묶을 수 없습니다.');
  if (target.id !== task.id && (target.progress > 0 || target.actualMinutes > 0)) fail('이미 진행한 작업은 새 묶음으로 이동할 수 없습니다.', 409);
  const start = Math.ceil((now.getTime() - instant({ ...block, start: '00:00' }, 'start')) / 60000);
  const length = minute(next.end) - minute(next.start);
  if (length <= 0 || length > db.user.settings.maxBlockMinutes) fail('다음 작업의 길이가 올바르지 않습니다.');
  const end = start + length;
  const settings = db.user.settings;
  const candidate = { ...next, start: clock(start), end: clock(end) };
  if (end > 1440 || start < minute(settings.dayStart) || end > minute(settings.dayEnd) || instant(candidate, 'end') > datetime(target.deadline) || (target.notBefore && instant(candidate, 'start') < datetime(target.notBefore))) fail('작업 가능 시간·마감 조건 때문에 바로 이어서 진행할 수 없습니다.', 409);
  if (blockedWindows(block.date, db.fixedBlocks, settings).some(item => start < minute(item.end) && minute(item.start) < end)) fail('고정 일정이나 지정 휴식과 겹쳐 이어서 진행할 수 없습니다.', 409);
  for (const other of db.scheduledBlocks) {
    if (other.id === block.id || other.id === next.id) continue;
    const gap = instant(other, 'start') - instant(candidate, 'end');
    const before = instant(candidate, 'start') - instant(other, 'end');
    if (gap < (target.breakAfterMinutes ?? settings.breakMinutes) * 60000 && before < (db.tasks.find(t => t.id === other.taskId)?.breakAfterMinutes ?? settings.breakMinutes) * 60000) fail('다른 작업과 겹치거나 휴게 시간이 부족합니다.', 409);
  }
  const work = db.scheduledBlocks.filter(item => item.date === block.date && ['planned', 'done'].includes(item.status)).reduce((sum, item) => sum + minute(item.end) - minute(item.start), 0);
  if (settings.maxDailyMinutes !== undefined && work > settings.maxDailyMinutes) fail('하루 작업량 한도를 초과했습니다.', 409);

  function units(source) {
    if (source.subtasks?.length) {
      const total = source.subtasks.reduce((sum, item) => sum + item.estimatedMinutes, 0);
      let assigned = 0;
      return source.subtasks.map((unit, index) => {
        const cumulative = source.subtasks.slice(0, index + 1).reduce((sum, item) => sum + item.estimatedMinutes, 0);
        const allocation = total ? Math.round(source.estimatedMinutes * cumulative / total) : 0;
        const result = { ...unit, estimatedMinutes: allocation - assigned };
        assigned = allocation;
        return result;
      });
    }
    const blocks = db.scheduledBlocks.filter(item => item.taskId === source.id);
    const completed = source.status === 'done' ? source.estimatedMinutes : Math.min(source.estimatedMinutes, blocks.filter(item => item.status === 'done').reduce((sum, item) => sum + minute(item.end) - minute(item.start), 0));
    const done = { id: randomUUID(), title: source.title, estimatedMinutes: completed, done: true };
    const remaining = { id: randomUUID(), title: source.title, estimatedMinutes: source.estimatedMinutes - completed, done: false };
    for (const item of blocks) item.subtaskId = item.status === 'done' ? done.id : remaining.id;
    return [done, remaining].filter(unit => unit.estimatedMinutes > 0);
  }
  task.sourceTasks ??= [{ ...structuredClone(task), sourceTasks: undefined }];
  const own = units(task);
  if (target.id !== task.id) {
    task.sourceTasks.push(structuredClone(target));
    const incoming = units(target).map(unit => {
      const id = randomUUID();
      for (const item of db.scheduledBlocks.filter(item => item.taskId === target.id && item.subtaskId === unit.id)) item.subtaskId = id;
      return { ...unit, id };
    });
    task.subtasks = [...own, ...incoming];
    for (const item of db.scheduledBlocks.filter(item => item.taskId === target.id)) {
      item.taskId = task.id;
      item.breakAfterMinutes = target.breakAfterMinutes ?? settings.breakMinutes;
    }
    db.tasks = db.tasks.filter(item => item.id !== target.id);
    task.deadline = datetime(task.deadline) < datetime(target.deadline) ? task.deadline : target.deadline;
    task.importance = Math.max(task.importance ?? 2, target.importance ?? 2);
  } else task.subtasks = own;
  task.title = '기타 작업';
  task.type = 'etc';
  task.baseEstimatedMinutes = task.subtasks.reduce((sum, unit) => sum + unit.estimatedMinutes, 0);
  task.estimatedMinutes = task.baseEstimatedMinutes;
  const done = task.subtasks.reduce((sum, unit) => sum + (unit.done ? unit.estimatedMinutes : 0), 0);
  task.progress = task.estimatedMinutes ? done / task.estimatedMinutes : 0;
  task.status = 'in_progress';
  // Preserve the completed interval and pin the accepted next interval immediately.
  block.end = clock(start);
  block.completedAt = now.toISOString();
  block.breakAfterMinutes = 0;
  next.start = candidate.start;
  next.end = candidate.end;
  next.continuationOf = block.id;
  return next;
}

