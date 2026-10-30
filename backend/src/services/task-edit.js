import { randomUUID } from 'node:crypto';
import { computeCorrectionFactors, applyCorrection } from '../scheduler/estimator.js';
import { fail, object, integer, text, iso } from './validation.js';

// 마감 전 알림 간격(분): 하루, 1시간, 30분
export const REMINDER_MINUTES = [1440, 60, 30];

function taskById(db, id) {
  const task = db.tasks.find(task => task.id === id);
  if (!task) fail('작업을 찾을 수 없습니다.', 404);
  return task;
}

function parseReminder(value) {
  object(value, 'reminder');
  if (value.mode === 'beforeDeadline') {
    if (!REMINDER_MINUTES.includes(value.minutes)) fail('마감 전 알림은 하루, 1시간, 30분 중에서 골라 주세요.');
    return { mode: 'beforeDeadline', minutes: value.minutes };
  }
  if (value.mode === 'at') {
    iso(value.at, 'reminder.at');
    return { mode: 'at', at: value.at };
  }
  return fail('알림 방식이 올바르지 않습니다.');
}

/** 알림 목록: 마감 전(beforeDeadline) 항목은 종류별로 하나씩, 직접 고른 일시(at)는 하나. 빈 배열이면 해제. */
export function parseReminders(value) {
  if (!Array.isArray(value) || value.length > 4) fail('알림은 최대 4개까지 설정할 수 있습니다.');
  const reminders = value.map(parseReminder);
  const keys = reminders.map(reminder => reminder.mode === 'at' ? 'at' : reminder.minutes);
  if (new Set(keys).size !== keys.length) fail('같은 알림이 중복되었습니다.');
  return reminders;
}

// 하위작업이 바뀌면 총 추정시간을 하위작업 합계로 다시 맞춘다
function syncEstimate(db, task) {
  if (!task.subtasks?.length) return;
  task.baseEstimatedMinutes = task.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
  task.estimatedMinutes = applyCorrection(task.baseEstimatedMinutes, task.type, computeCorrectionFactors(db.history ?? []));
}

/** 제목·마감·중요도·알림 수정. 배치는 AI가 다시 정하므로 여기서 건드리지 않는다. */
export function updateTask(db, id, input) {
  object(input);
  const task = taskById(db, id);
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !['title', 'deadline', 'importance', 'reminders', 'memo'].includes(key))) fail('수정할 수 있는 항목은 제목, 마감, 중요도, 알림 목록, 메모입니다.');
  if (input.title !== undefined) task.title = text(input.title, 'title');
  if (input.deadline !== undefined) {
    const deadline = iso(input.deadline, 'deadline');
    if (task.notBefore && iso(task.notBefore, 'notBefore') >= deadline) fail('마감은 시작 가능 시각보다 늦어야 합니다.');
    task.deadline = input.deadline;
  }
  if (input.importance !== undefined) task.importance = integer(input.importance, 'importance', 1, 3);
  if (input.memo !== undefined) {
    if (typeof input.memo !== 'string' || input.memo.length > 1000) fail('메모는 1000자 이하여야 합니다.');
    if (input.memo.trim()) task.memo = input.memo; else delete task.memo;
  }
  if (input.reminders !== undefined) {
    const reminders = parseReminders(input.reminders);
    delete task.reminder;
    if (reminders.length) task.reminders = reminders; else delete task.reminders;
  }
  return { task };
}

/** 상위 작업과 그 작업의 배치 블록, 딸린 복습 작업을 함께 지운다. 수행 기록(history)은 보존한다. */
export function deleteTask(db, id) {
  taskById(db, id);
  const removed = new Set([id, ...db.tasks.filter(task => task.reviewOf === id).map(task => task.id)]);
  db.tasks = db.tasks.filter(task => !removed.has(task.id));
  db.scheduledBlocks = (db.scheduledBlocks ?? []).filter(block => !removed.has(block.taskId));
  return { deleted: true, taskIds: [...removed] };
}

function subtaskInput(input, partial) {
  object(input);
  const result = {};
  if (!partial || input.title !== undefined) result.title = text(input.title, 'subtask.title');
  if (!partial || input.estimatedMinutes !== undefined) result.estimatedMinutes = integer(input.estimatedMinutes, 'subtask.estimatedMinutes', 0, 1000000);
  return result;
}

export function addSubtask(db, id, input) {
  const task = taskById(db, id);
  const subtask = { id: randomUUID(), ...subtaskInput(input, false), done: false };
  (task.subtasks ??= []).push(subtask);
  syncEstimate(db, task);
  return { task, subtask };
}

export function updateSubtask(db, id, subtaskId, input) {
  const task = taskById(db, id);
  const subtask = task.subtasks?.find(subtask => subtask.id === subtaskId);
  if (!subtask) fail('하위작업을 찾을 수 없습니다.', 404);
  const patch = subtaskInput(input, true);
  if (!Object.keys(patch).length) fail('수정할 하위작업 항목이 필요합니다.');
  Object.assign(subtask, patch);
  syncEstimate(db, task);
  return { task, subtask };
}

export function deleteSubtask(db, id, subtaskId) {
  const task = taskById(db, id);
  if (!task.subtasks?.some(subtask => subtask.id === subtaskId)) fail('하위작업을 찾을 수 없습니다.', 404);
  task.subtasks = task.subtasks.filter(subtask => subtask.id !== subtaskId);
  db.scheduledBlocks = (db.scheduledBlocks ?? []).filter(block => !(block.taskId === id && block.subtaskId === subtaskId));
  syncEstimate(db, task);
  return { task, deleted: true };
}
