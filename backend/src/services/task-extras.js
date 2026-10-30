import { computeCorrectionFactors, applyCorrection } from '../scheduler/estimator.js';
import { breakdownTask } from './llm.js';
import { reportProgress } from './task-service.js';
import { replan } from './planner.js';
import { fail, object, text, integer, iso } from './validation.js';

const priorityToImportance = { must: 3, should: 2, could: 1 };
const importanceToPriority = { 3: 'must', 2: 'should', 1: 'could' };
export const priorityOf = task => importanceToPriority[task.importance ?? 2];

/** 명세의 입력(priority, estimateMin, 시간대 없는 마감)을 내부 형식으로 바꾼다. */
export function normalizeTaskInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const task = { ...input };
  if (task.priority !== undefined) {
    if (!Object.hasOwn(priorityToImportance, task.priority)) fail('priority는 must, should, could 중 하나여야 합니다.');
    task.importance = priorityToImportance[task.priority];
    delete task.priority;
  }
  if (task.estimateMin !== undefined) {
    task.baseEstimatedMinutes = task.estimateMin;
    delete task.estimateMin;
  }
  if (typeof task.deadline === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(task.deadline)) task.deadline += 'T23:59:00+09:00';
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.deadline)) task.deadline += ':00+09:00';
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(task.deadline)) task.deadline += '+09:00';
  }
  if (task.type === undefined) task.type = guessType(`${task.title ?? ''} ${task.description ?? ''}`);
  return task;
}

/** 등록 시 선택 항목(설명·첨부)을 task에 붙인다. 이미 만든 task를 변경한다. */
export function attachExtras(task, input) {
  if (input?.description !== undefined) task.description = text(input.description, 'description');
  if (input?.fileIds !== undefined) {
    if (!Array.isArray(input.fileIds) || input.fileIds.length > 10 || input.fileIds.some(id => typeof id !== 'string')) fail('fileIds는 최대 10개의 문자열 배열이어야 합니다.');
    task.fileIds = input.fileIds;
  }
}

export function guessType(content) {
  if (/시험|퀴즈|중간고사|기말/.test(content)) return 'exam';
  if (/코딩|구현|프로그래|개발|알고리즘/.test(content)) return 'coding';
  if (/발표|PPT|ppt|피티/.test(content)) return 'presentation';
  if (/읽기|독서|논문|책/.test(content)) return 'reading';
  if (/보고서|리포트|레포트|과제|에세이/.test(content)) return 'report';
  return 'etc';
}

function taskById(db, id) {
  const task = db.tasks.find(task => task.id === id);
  if (!task) fail('작업을 찾을 수 없습니다.', 404);
  return task;
}

export function updateTask(db, id, rawInput, { now }) {
  object(rawInput);
  const input = normalizeTaskInput({ ...rawInput, type: rawInput.type ?? 'etc' });
  if (rawInput.type === undefined) delete input.type;
  const task = taskById(db, id);
  if (task.status === 'done') fail('완료한 작업은 수정할 수 없습니다.', 409);
  if (input.title !== undefined) task.title = text(input.title, 'title');
  if (input.deadline !== undefined) { iso(input.deadline, 'deadline'); task.deadline = input.deadline; }
  if (input.importance !== undefined) task.importance = integer(input.importance, 'importance', 1, 3);
  if (input.notBefore !== undefined) { iso(input.notBefore, 'notBefore'); task.notBefore = input.notBefore; }
  if (input.type !== undefined) {
    if (!['report', 'coding', 'exam', 'presentation', 'reading', 'etc'].includes(input.type)) fail('지원하지 않는 과제 유형입니다.');
    task.type = input.type;
  }
  if (input.baseEstimatedMinutes !== undefined) {
    task.baseEstimatedMinutes = integer(input.baseEstimatedMinutes, 'baseEstimatedMinutes', 0, 1000000);
    task.estimatedMinutes = applyCorrection(task.baseEstimatedMinutes, task.type, computeCorrectionFactors(db.history ?? []));
  }
  if (task.notBefore !== undefined && Date.parse(task.notBefore) >= Date.parse(task.deadline)) fail('notBefore는 마감보다 빨라야 합니다.');
  attachExtras(task, input);
  return { task, ...replan(db, now) };
}

/** 작업과 그 복습 작업, 배치된 블록을 지운다. 완료 기록(history)은 분석용으로 남긴다. */
export function deleteTask(db, id, { now }) {
  const task = taskById(db, id);
  const ids = new Set([task.id, ...db.tasks.filter(other => other.reviewOf === task.id).map(other => other.id)]);
  db.tasks = db.tasks.filter(other => !ids.has(other.id));
  db.scheduledBlocks = (db.scheduledBlocks ?? []).filter(block => !ids.has(block.taskId));
  return { deleted: id, ...replan(db, now) };
}

export function completeTask(db, id, { now }) {
  return reportProgress(db, id, { progress: 1 }, { now });
}

const baseMinutes = { report: 180, coding: 240, exam: 240, presentation: 180, reading: 90, etc: 60 };
const typeLabel = { report: '보고서', coding: '코딩', exam: '시험', presentation: '발표', reading: '읽기', etc: '일반' };

/** AI로 소요 시간을 추정하고, 연결이 안 되면 규칙 기반으로 대신한다. 개인 보정 계수는 항상 적용한다. */
export async function estimateTask(db, input, { breakdown = breakdownTask } = {}) {
  object(input);
  const title = text(input.title, 'title');
  const description = input.description === undefined || input.description === '' ? '' : text(input.description, 'description');
  const fileIds = Array.isArray(input.fileIds) ? input.fileIds : [];
  const type = input.type ?? guessType(`${title} ${description}`);
  let base, range, reasons, source;
  try {
    const result = await breakdown({ title, description, type, attachments: fileIds.length });
    base = result.baseEstimatedMinutes;
    range = result.rangeMinutes?.length === 2 ? result.rangeMinutes : [Math.round(base * 0.8), Math.round(base * 1.2)];
    reasons = result.assumptions?.length ? [result.assumptions.join(', ')] : [];
    source = 'ai';
  } catch {
    base = baseMinutes[type] + Math.floor(description.length / 100) * 30;
    range = [Math.round(base * 0.8), Math.round(base * 1.25)];
    reasons = [`${typeLabel[type]} 유형 기본 시간에 설명 길이를 더해 추정했어요`];
    source = 'rule';
  }
  const factors = computeCorrectionFactors(db.history ?? []);
  const factor = Object.hasOwn(factors, type) ? factors[type] : 1;
  if (factor !== 1) reasons.push(`지난 ${typeLabel[type]} 과제 기록 반영 (x${factor.toFixed(2)})`);
  return { estimateMin: applyCorrection(base, type, factors), rangeMin: applyCorrection(range[0], type, factors),
    rangeMax: applyCorrection(range[1], type, factors), reason: reasons.join(' · '), type, source };
}
