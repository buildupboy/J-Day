import { instant, positive, timestamp } from './time.js';

// 보정된 총 작업량을 하위작업 가중치로 배분한다. 나머지는 입력 순서로 배분한다.
function distribute(total, subtasks) {
  const sum = subtasks.reduce((n, subtask) => n + subtask.estimatedMinutes, 0);
  if (sum === 0) {
    if (total > 0) throw new RangeError('하위작업 추정시간 합계가 0입니다.');
    return subtasks.map(() => 0);
  }
  const values = subtasks.map(subtask => Math.floor(total * subtask.estimatedMinutes / sum));
  let extra = total - values.reduce((a, b) => a + b, 0);
  for (let i = 0; i < values.length && extra > 0; i++) {
    if (subtasks[i].estimatedMinutes > 0) { values[i]++; extra--; }
  }
  return values;
}

function consume(units, amount) {
  for (const unit of units) {
    const used = Math.min(unit.remaining, amount);
    unit.remaining -= used;
    amount -= used;
  }
}

/** Task.progress와 Subtask.done을 중복 차감하지 않고 남은 하위작업을 계산한다. */
export function remainingWork(task, existingBlocks = [], now) {
  positive(task.estimatedMinutes, 'estimatedMinutes', 0);
  if (!Number.isFinite(task.progress) || task.progress < 0 || task.progress > 1) throw new RangeError('progress는 0~1이어야 합니다.');
  const time = now === undefined ? -Infinity : Math.ceil(timestamp(now) / 60000) * 60000;
  const subtasks = task.subtasks ?? [];
  if (!Array.isArray(subtasks)) throw new RangeError('subtasks는 배열이어야 합니다.');
  const ids = new Set();
  for (const subtask of subtasks) {
    if (typeof subtask.id !== 'string' || !subtask.id || ids.has(subtask.id) || typeof subtask.done !== 'boolean') throw new RangeError('하위작업 ID와 완료 상태를 확인하세요.');
    ids.add(subtask.id);
    positive(subtask.estimatedMinutes, 'subtask.estimatedMinutes', 0);
  }
  const estimates = distribute(task.estimatedMinutes, subtasks.length ? subtasks : [{ estimatedMinutes: task.estimatedMinutes }]);
  const units = subtasks.length
    ? subtasks.map((subtask, i) => ({ subtaskId: subtask.id, remaining: subtask.done ? 0 : estimates[i], reservedUntil: -Infinity }))
    : [{ remaining: task.estimatedMinutes, reservedUntil: -Infinity }];
  if (task.status === 'done' || task.progress === 1) units.forEach(unit => { unit.remaining = 0; });
  const byProgress = Math.ceil(task.estimatedMinutes * (1 - task.progress));
  // done과 전체 진행률 중 더 많은 완료량을 채택한다. 추가 진행량은 앞 하위작업부터 소진한다.
  consume(units, Math.max(0, units.reduce((n, unit) => n + unit.remaining, 0) - byProgress));
  let legacyReserved = 0;
  for (const block of existingBlocks.filter(block => block.taskId === task.id && block.status === 'planned')) {
    const start = instant(block, 'start'), end = instant(block, 'end');
    if (start >= end) throw new RangeError('기존 블록 시간이 올바르지 않습니다.');
    const reserved = Math.max(0, Math.floor((end - Math.max(start, time)) / 60000));
    const unit = units.find(unit => unit.subtaskId === block.subtaskId);
    if (block.subtaskId !== undefined && !unit) throw new RangeError('기존 블록의 subtaskId가 작업에 없습니다.');
    if (unit) {
      unit.remaining = Math.max(0, unit.remaining - reserved);
      if (reserved > 0) unit.reservedUntil = Math.max(unit.reservedUntil, end);
    } else legacyReserved += reserved;
  }
  consume(units, legacyReserved);
  return units;
}
