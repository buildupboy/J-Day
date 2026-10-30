import { randomUUID } from 'node:crypto';
import { computeCorrectionFactors, applyCorrection } from '../scheduler/estimator.js';
import { createExamReviewTasks } from '../scheduler/reviews.js';
import { reschedule, diffScheduledBlocks } from '../scheduler/rescheduler.js';
import { explainSchedule } from '../scheduler/explanations.js';
import { instant } from '../scheduler/time.js';
import { enqueueSchedule } from './scheduler-gateway.js';
import { fail, object, integer, text, iso, memo } from './validation.js';

const types = new Set(['report','coding','exam','presentation','reading','etc']);
const kst = date => new Date(date.getTime() + 9 * 3600000).toISOString().replace('Z', '+09:00');

function taskById(db, id) {
  const task = db.tasks.find(task => task.id === id);
  if (!task) fail('작업을 찾을 수 없습니다.', 404);
  return task;
}
async function schedule(db, now, reason, previousBlocks, explain, planner) {
  const result = await planner(db, { now, reason });
  if (previousBlocks) result.changes = diffScheduledBlocks(previousBlocks, result.scheduledBlocks, reason);
  db.scheduledBlocks = result.scheduledBlocks;
  if (result.planningContext && !result.rescheduled) db.aiScheduling = { status: 'pending', context: result.planningContext };
  if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now });
  return result;
}

function addReviews(db, task, options) {
  if (options !== true) object(options, 'review');
  const config = options === true ? {} : options;
  if (config.daysBefore !== undefined && (!Array.isArray(config.daysBefore) || config.daysBefore.length === 0 || config.daysBefore.length > 30)) fail('daysBefore는 1~30개 간격 배열이어야 합니다.');
  config.daysBefore?.forEach(day => integer(day, 'daysBefore', 1, 365));
  if (config.minutes !== undefined) integer(config.minutes, 'review.minutes', 1, 1440);
  if (task.type !== 'exam') fail('시험 작업만 복습을 등록할 수 있습니다.');
  const reviews = createExamReviewTasks(task, config);
  return reviews.map(review => {
    const existing = db.tasks.find(candidate => candidate.id === review.id);
    if (existing) {
      if (existing.reviewOf !== task.id || existing.deadline !== review.deadline || existing.estimatedMinutes !== review.estimatedMinutes) fail('기존 복습과 설정이 충돌합니다.', 409);
      return existing;
    }
    db.tasks.push(review);
    return review;
  });
}

/** 구조화된 LLM/UI 입력을 검증하여 저장 가능한 Task와 배치 결과를 만든다. */
export async function registerTask(db, input, { now, explain = false, planner = reschedule, deferScheduling = false }) {
  object(input);
  const title = text(input.title, 'title');
  if (!types.has(input.type)) fail('지원하지 않는 과제 유형입니다.');
  const deadline = iso(input.deadline, 'deadline');
  const base = integer(input.baseEstimatedMinutes, 'baseEstimatedMinutes', 0, 1000000);
  const importance = input.importance === undefined ? 2 : integer(input.importance, 'importance', 1, 3);
  if (input.notBefore !== undefined && iso(input.notBefore, 'notBefore') >= deadline) fail('notBefore는 마감보다 빨라야 합니다.');
  const subtasks = input.subtasks ?? [];
  if (!Array.isArray(subtasks) || subtasks.length > 1000) fail('subtasks는 최대 1000개 배열이어야 합니다.');
  const ids = new Set();
  const normalized = subtasks.map(subtask => {
    object(subtask, 'subtask');
    const id = subtask.id === undefined ? randomUUID() : text(subtask.id, 'subtask.id');
    if (ids.has(id)) fail('하위작업 ID가 중복됩니다.');
    ids.add(id);
    if (subtask.done !== undefined && subtask.done !== false) fail('새 하위작업의 done은 false여야 합니다.');
    return { id, title: text(subtask.title, 'subtask.title'), estimatedMinutes: integer(subtask.estimatedMinutes, 'subtask.estimatedMinutes', 0, 1000000), done: false };
  });
  if (base > 0 && normalized.length && normalized.every(subtask => subtask.estimatedMinutes === 0)) fail('하위작업 추정시간 합계가 0입니다.');
  if (input.progress !== undefined && input.progress !== 0) fail('새 작업의 progress는 0이어야 합니다.');
  if (input.status !== undefined && input.status !== 'todo') fail('새 작업의 status는 todo여야 합니다.');
  const id = input.id === undefined ? randomUUID() : text(input.id, 'id');
  if (db.tasks.some(task => task.id === id)) fail('이미 존재하는 작업 ID입니다.', 409);
  const task = { id, title, type: input.type, deadline: input.deadline, importance, subtasks: normalized,
    baseEstimatedMinutes: base, estimatedMinutes: applyCorrection(base, input.type, computeCorrectionFactors(db.history ?? [])),
    actualMinutes: 0, progress: 0, status: 'todo', createdAt: kst(now) };
  if (input.notBefore !== undefined) task.notBefore = input.notBefore;
  if (input.breakAfterMinutes !== undefined) task.breakAfterMinutes = integer(input.breakAfterMinutes, 'breakAfterMinutes', 0, 1440);
  const note = memo(input.memo);
  if (note) task.memo = note;
  db.tasks.push(task);
  const reviewTasks = input.review === undefined || input.review === false ? [] : addReviews(db, task, input.review);
  // 배치(AI 호출)는 오래 걸리므로 저장만 하고 요청을 대기열에 넣는다. 호출자가 뒤에서 배치를 시작한다.
  if (deferScheduling) {
    enqueueSchedule(db, { commandId: id, taskId: id, reason: 'new_task', now });
    return { task, reviewTasks, rescheduled: false, deferred: true, schedulingInBackground: true, scheduledBlocks: db.scheduledBlocks ?? [], changes: [], unplaced: [] };
  }
  const result = await schedule(db, now, 'new_task', undefined, explain, planner);
  return { task, reviewTasks, ...result };
}

export async function registerReviews(db, id, options, { now, explain = false, planner = reschedule }) {
  const task = taskById(db, id);
  const reviewTasks = addReviews(db, task, options);
  return { task, reviewTasks, ...await schedule(db, now, 'new_task', undefined, explain, planner) };
}

/** actualMinutesは累計。繰り返した同じ報告で時間を二重加算しない。 */
export async function reportProgress(db, id, input, { now, explain = false, planner = reschedule }) {
  object(input);
  const task = taskById(db, id);
  const previousBlocks = structuredClone(db.scheduledBlocks ?? []);
  const has = key => Object.hasOwn(input, key);
  if (!['progress','actualMinutes','subtaskDone','blockStatus'].some(has)) fail('갱신할 진행 데이터가 필요합니다.');
  if (has('progress') && (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 1)) fail('progress는 0~1이어야 합니다.');
  if (has('progress') && input.progress < task.progress) fail('진행률을 낮출 수 없습니다.', 409);
  if (has('actualMinutes')) task.actualMinutes = integer(input.actualMinutes, 'actualMinutes', 0, 1000000);
  let subtask;
  if (has('subtaskId')) {
    subtask = task.subtasks?.find(subtask => subtask.id === input.subtaskId);
    if (!subtask) fail('하위작업을 찾을 수 없습니다.', 404);
  }
  if (has('subtaskDone')) {
    if (!subtask || typeof input.subtaskDone !== 'boolean') fail('subtaskId와 boolean subtaskDone이 필요합니다.');
    if (subtask.done && !input.subtaskDone) fail('완료한 하위작업을 되돌릴 수 없습니다.', 409);
    subtask.done = input.subtaskDone;
  }
  if (has('blockId') || has('blockStatus')) {
    const block = db.scheduledBlocks?.find(block => block.id === input.blockId && block.taskId === id);
    if (!block) fail('작업 블록을 찾을 수 없습니다.', 404);
    if (!['done','missed'].includes(input.blockStatus)) fail('blockStatus는 done 또는 missed여야 합니다.');
    // 미리 완료는 받는다. 아직 시작하지 않은 블록을 미수행으로 볼 수는 없다.
    if (input.blockStatus === 'missed' && instant(block, 'start') >= now.getTime()) fail('아직 시작하지 않은 블록을 미수행으로 보고할 수 없습니다.');
    if (block.status === 'done' && input.blockStatus !== 'done') fail('완료 블록은 되돌릴 수 없습니다.', 409);
    // 예정 종료 전에 끝낸 블록은 완료 시각을 남겨 재배치 때 남은 시간을 비운다.
    if (input.blockStatus === 'done' && block.status !== 'done' && instant(block, 'end') > now.getTime()) block.completedAt = kst(now);
    block.status = input.blockStatus;
  }
  if (has('reschedule') && typeof input.reschedule !== 'boolean') fail('reschedule은 boolean이어야 합니다.');
  let progress = input.progress ?? task.progress;
  if (task.subtasks?.length) {
    const sum = task.subtasks.reduce((n, subtask) => n + subtask.estimatedMinutes, 0);
    const done = task.subtasks.reduce((n, subtask) => n + (subtask.done ? subtask.estimatedMinutes : 0), 0);
    if (sum > 0) progress = Math.max(progress, done / sum);
    if (task.subtasks.every(subtask => subtask.done)) progress = 1;
  }
  task.progress = progress;
  task.status = progress === 1 ? 'done' : progress > 0 || (task.actualMinutes ?? 0) > 0 ? 'in_progress' : 'todo';
  if (progress === 1) task.subtasks?.forEach(subtask => { subtask.done = true; });
  for (const block of db.scheduledBlocks ?? []) {
    if (block.taskId === id && block.status === 'planned' && instant(block, 'start') < now.getTime()
      && (progress === 1 || task.subtasks?.some(subtask => subtask.id === block.subtaskId && subtask.done))) block.status = 'done';
  }
  let historyRecorded = false;
  if (progress === 1 && !task.reviewOf) {
    db.history ??= [];
    const historyId = `history-${id}`;
    let history = db.history.find(record => record.id === historyId);
    if (!history) {
      history = { id: historyId, taskId: id, taskTitle: task.title, type: task.type,
        estimatedMinutes: task.baseEstimatedMinutes ?? task.estimatedMinutes,
        actualMinutes: task.actualMinutes ?? 0, completedAt: kst(now) };
      db.history.push(history);
    } else if (has('actualMinutes')) history.actualMinutes = task.actualMinutes;
    historyRecorded = true;
  }
  // reschedule:false면 기록만 저장하고 재배치는 호출자가 POST /api/schedule/reschedule로 나중에 요청한다.
  if (input.reschedule === false) {
    return { task, historyRecorded, rescheduled: false, deferred: true, scheduledBlocks: db.scheduledBlocks ?? [],
      changes: diffScheduledBlocks(previousBlocks, db.scheduledBlocks ?? [], 'progress'), unplaced: [] };
  }
  return { task, historyRecorded, ...await schedule(db, now, 'progress', previousBlocks, explain, planner) };
}
