// 묶음은 배치 단위이고, 분류·마감·완료·수행 기록은 원래 작업별로 유지한다.
export function sourceOfBlock(task, block) {
  const unit = task?.subtasks?.find(item => item.id === block.subtaskId);
  return task?.sourceTasks?.find(source => source.id === unit?.sourceTaskId) ?? task;
}

export function syncGroupedTask(db, task, now) {
  if (!task.sourceTasks?.length) return;
  for (const source of task.sourceTasks) {
    const units = task.subtasks.filter(unit => unit.sourceTaskId === source.id);
    if (!units.length) continue;
    const total = units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0);
    const done = units.reduce((sum, unit) => sum + (unit.done ? unit.estimatedMinutes : 0), 0);
    source.progress = total ? done / total : source.progress;
    source.status = units.every(unit => unit.done) ? 'done' : source.progress > 0 || source.actualMinutes > 0 ? 'in_progress' : 'todo';
    const reported = units.reduce((sum, unit) => sum + (unit.actualMinutes ?? 0), 0);
    source.actualMinutes = Math.max(source.actualMinutes ?? 0, reported);
    for (const original of source.subtasks ?? []) {
      const parts = units.filter(unit => unit.sourceSubtaskId === original.id);
      if (parts.length) original.done = parts.every(unit => unit.done);
    }
    if (source.status !== 'done' || source.reviewOf) continue;
    db.history ??= [];
    const id = 'history-' + source.id;
    const record = db.history.find(item => item.id === id);
    const details = { taskId: source.id, taskTitle: source.title, type: source.type,
      estimatedMinutes: source.baseEstimatedMinutes ?? source.estimatedMinutes, actualMinutes: source.actualMinutes ?? 0 };
    if (record) Object.assign(record, details);
    else db.history.push({ id, ...details, completedAt: now.toISOString() });
  }
  const pending = task.sourceTasks.filter(source => source.status !== 'done');
  if (pending.length) task.deadline = pending.reduce((first, source) => Date.parse(source.deadline) < Date.parse(first) ? source.deadline : first, pending[0].deadline);
}
