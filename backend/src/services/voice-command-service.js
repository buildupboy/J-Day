import { randomUUID, createHash } from 'node:crypto';
import * as llm from './llm.js';
import { INTERPRET_SCHEMA, BREAKDOWN_SCHEMA, TASK_TYPES } from '../prompts/schemas.js';
import { computeCorrectionFactors, applyCorrection } from '../scheduler/estimator.js';
import { enqueueSchedule, dispatchPending } from './scheduler-gateway.js';
import { assertSchema, fail, validText, integer, date, deadline } from './voice-validation.js';

const kstDate = now => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const kstInstant = now => new Date(now.getTime() + 9 * 3600000).toISOString().replace('Z', '+09:00');

export function validateVoiceRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('body는 객체여야 합니다.');
  const text = validText(body.text, 'text');
  const requestId = validText(body.requestId, 'requestId', 100);
  const conversation = body.conversation ?? [];
  if (!Array.isArray(conversation) || conversation.length > 12) fail('conversation은 최대 12개 메시지 배열이어야 합니다.');
  const messages = conversation.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role)) fail('대화 역할은 user/assistant만 가능합니다.');
    return { role: message.role, content: validText(message.content, 'conversation.content', 2000) };
  });
  return { text, requestId, conversation: messages,
    hash: createHash('sha256').update(JSON.stringify({ text, conversation: messages })).digest('hex') };
}

function replay(db, request) {
  const previous = (db.voiceCommands ?? []).find(command => command.id === request.requestId);
  if (!previous) return null;
  if (previous.hash !== request.hash) fail('같은 requestId로 다른 발화를 처리할 수 없습니다.', 409);
  return { ...previous.response, replayed: true,
    ...(previous.response.schedulerRequest ? { schedulerRequest: db.schedulerRequests.find(item => item.id === previous.response.schedulerRequest.id) } : {}) };
}

function validateTask(slots) {
  const title = validText(slots.title, 'title');
  if (!TASK_TYPES.includes(slots.type)) fail('지원하지 않는 작업 유형입니다.');
  deadline(slots.deadline);
  if (slots.baseEstimatedMinutes !== null) integer(slots.baseEstimatedMinutes, 'baseEstimatedMinutes', 1);
  if (slots.importance !== null) integer(slots.importance, 'importance', 1, 3);
  return { title, type: slots.type, deadline: slots.deadline,
    baseEstimatedMinutes: slots.baseEstimatedMinutes, importance: slots.importance ?? 2 };
}

function createTask(db, input, breakdown, now) {
  const factors = computeCorrectionFactors(db.history ?? []);
  const task = { id: randomUUID(), title: input.title, type: input.type, deadline: input.deadline,
    importance: input.importance, baseEstimatedMinutes: breakdown.baseEstimatedMinutes,
    estimatedMinutes: applyCorrection(breakdown.baseEstimatedMinutes, input.type, factors),
    subtasks: breakdown.subtasks.map(subtask => ({ id: randomUUID(), ...subtask, done: false })),
    progress: 0, status: 'todo', actualMinutes: 0, createdAt: kstInstant(now) };
  db.tasks.push(task);
  return task;
}

// 명세의 누적 actualMinutes와 0~1 progress를 유지한다. 블록 수행 판정은 스케줄러 담당.
async function updateProgress(db, slots, now, progressReporter = null) {
  const task = db.tasks.find(task => task.id === slots.taskId);
  if (!task) fail('진행 보고할 작업을 찾을 수 없습니다. 다시 지정해 주세요.', 404);
  if (slots.progress === null && slots.actualMinutes === null) fail('진행률 또는 실제 작업시간이 필요합니다.');
  if (slots.progress !== null && (slots.progress < 0 || slots.progress > 1)) fail('진행률은 0~1이어야 합니다.');
  if (slots.progress !== null && slots.progress < task.progress) fail('기존 진행률보다 낮게 보고할 수 없습니다.', 409);
  let actual = task.actualMinutes ?? 0;
  if (slots.actualMinutes !== null) {
    integer(slots.actualMinutes, 'actualMinutes');
    if (!['increment', 'cumulative'].includes(slots.actualMinutesMode)) fail('실제시간이 누적인지 추가인지 확인해야 합니다.');
    actual = slots.actualMinutesMode === 'increment' ? (task.actualMinutes ?? 0) + slots.actualMinutes : slots.actualMinutes;
    integer(actual, 'actualMinutes');
  }
  // 통합 환경에서는 친구의 기존 진행 처리기로 블록 상태·완료 기록·재배치를 일관되게 처리한다.
  if (progressReporter) return (await progressReporter(db, task.id, {
    ...(slots.progress !== null ? { progress: slots.progress } : {}),
    ...(slots.actualMinutes !== null ? { actualMinutes: actual } : {}),
  }, { now })).task;
  task.actualMinutes = actual;
  const subtaskTotal = (task.subtasks ?? []).reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const completedMinutes = (task.subtasks ?? []).reduce((sum, item) => sum + (item.done ? item.estimatedMinutes : 0), 0);
  task.progress = Math.max(slots.progress ?? task.progress, subtaskTotal > 0 ? completedMinutes / subtaskTotal : 0);
  task.status = task.progress === 1 ? 'done' : task.progress > 0 || task.actualMinutes > 0 ? 'in_progress' : 'todo';
  if (task.progress === 1) {
    task.subtasks?.forEach(subtask => { subtask.done = true; });
    if (!task.reviewOf) {
      const id = `history-${task.id}`;
      const previous = (db.history ??= []).find(record => record.id === id);
      if (previous) previous.actualMinutes = task.actualMinutes ?? 0;
      else db.history.push({ id, taskId: task.id, taskTitle: task.title, type: task.type,
        estimatedMinutes: task.baseEstimatedMinutes ?? task.estimatedMinutes,
        actualMinutes: task.actualMinutes ?? 0, completedAt: kstInstant(now) });
    }
  }
  return task;
}

function updateTask(db, slots, now) {
  const task = db.tasks.find(item => item.id === slots.taskId);
  if (!task) fail('변경할 작업을 찾을 수 없습니다. 다시 지정해 주세요.', 404);
  const fields = ['title', 'type', 'deadline', 'baseEstimatedMinutes', 'importance'];
  if (!fields.some(key => slots[key] !== null)) fail('변경할 내용을 알려 주세요.');
  const input = validateTask({ ...task, ...Object.fromEntries(fields.filter(key => slots[key] !== null).map(key => [key, slots[key]])) });
  if (slots.baseEstimatedMinutes !== null) {
    const total = (task.subtasks ?? []).reduce((sum, item) => sum + item.estimatedMinutes, 0);
    if (total > 0) {
      let allocated = 0, cumulative = 0;
      for (const item of task.subtasks) {
        cumulative += item.estimatedMinutes;
        const end = Math.round(cumulative / total * input.baseEstimatedMinutes);
        item.estimatedMinutes = end - allocated;
        allocated = end;
      }
    }
    task.baseEstimatedMinutes = input.baseEstimatedMinutes;
  }
  Object.assign(task, { title: input.title, type: input.type, deadline: input.deadline, importance: input.importance,
    estimatedMinutes: applyCorrection(task.baseEstimatedMinutes, input.type, computeCorrectionFactors(db.history ?? [])),
    updatedAt: kstInstant(now) });
  return task;
}

export function createVoiceService({ readDb, updateDb, interpreter = llm.interpretUtterance,
  breakdownTask = llm.breakdownTask, scheduler = null, progressReporter = null, now = () => new Date() }) {
  // 같은 requestId의 병렬 요청은 모델을 한 번만 호출한다. 저장 직전에도 중복을 검사한다.
  const inFlight = new Map();
  async function execute(request) {
    const snapshot = await readDb();
    const saved = replay(snapshot, request);
    if (saved) return saved;
    const current = now();
    const context = { now: kstInstant(current), today: kstDate(current), timezone: 'Asia/Seoul',
      tasks: snapshot.tasks.map(({ id, title, type, deadline, progress, actualMinutes, status, baseEstimatedMinutes, importance }) => ({ id, title, type, deadline, progress, actualMinutes, status, baseEstimatedMinutes, importance })) };
    const extracted = await interpreter(request.text, context, request.conversation);
    assertSchema(extracted, INTERPRET_SCHEMA);
    const { intent, slots } = extracted;
    if (['clarify', 'unsupported'].includes(intent)) return { requestId: request.requestId, intent,
      status: intent === 'clarify' ? 'needs_clarification' : 'unsupported', reply: extracted.reply, assumptions: extracted.assumptions, result: null };
    if (intent === 'query_schedule') {
      const target = slots.date === null ? kstDate(now()) : date(slots.date);
      const latest = await readDb();
      const weekday = new Date(`${target}T00:00:00Z`).getUTCDay();
      return { requestId: request.requestId, intent, status: 'read_only', reply: '저장된 일정을 조회했어요.',
        result: { date: target, fixedBlocks: latest.fixedBlocks.filter(block => block.dayOfWeek.includes(weekday)),
          scheduledBlocks: latest.scheduledBlocks.filter(block => block.date === target) } };
    }
    const duplicateQuestion = tasks => {
      const matches = tasks.filter(task => task.id === slots.taskId || (slots.title && task.title.replace(/\s/g, '').toLowerCase() === slots.title.replace(/\s/g, '').toLowerCase()));
      if (!matches.length) return null;
      return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification',
        reply: matches.length === 1 ? `이미 등록된 일정 ‘${matches[0].title}’ (${matches[0].deadline})이에요. 기존 일정을 변경할까요?` : '같은 이름의 일정이 여러 개예요. 어떤 날짜의 일정을 변경할까요?',
        assumptions: extracted.assumptions, result: null };
    };
    if (intent === 'add_task') {
      const question = duplicateQuestion(snapshot.tasks);
      if (question) return question;
    }
    if (intent === 'update_task' && !slots.taskId) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 일정을 변경할까요?', result: null };
    let input, breakdown;
    if (intent === 'add_task') {
      if (!slots.title || !slots.deadline) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 작업을 언제까지 해야 하나요?', result: null };
      input = validateTask(slots);
      breakdown = await breakdownTask({ ...input, utterance: request.text, conversation: request.conversation });
      assertSchema(breakdown, BREAKDOWN_SCHEMA);
      integer(breakdown.baseEstimatedMinutes, 'baseEstimatedMinutes', 1);
      if (!breakdown.subtasks.length || breakdown.subtasks.length > 20) fail('하위작업은 1~20개여야 합니다.', 502);
      for (const subtask of breakdown.subtasks) { subtask.title = validText(subtask.title, 'subtask.title'); integer(subtask.estimatedMinutes, 'subtask.estimatedMinutes', 1); }
      if (breakdown.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0) !== breakdown.baseEstimatedMinutes) fail('AI 추정시간과 하위작업 합계가 일치하지 않습니다.', 502);
      if (input.baseEstimatedMinutes !== null && breakdown.baseEstimatedMinutes !== input.baseEstimatedMinutes) fail('사용자가 지정한 예상시간이 변경됐습니다.', 502);
      if (breakdown.rangeMinutes.length !== 2 || !breakdown.rangeMinutes.every(Number.isSafeInteger) || breakdown.rangeMinutes[0] < 1 || breakdown.rangeMinutes[0] > breakdown.baseEstimatedMinutes || breakdown.rangeMinutes[1] < breakdown.baseEstimatedMinutes || breakdown.rangeMinutes[1] > 1000000) fail('추정시간 범위가 올바르지 않습니다.', 502);
    }
    if (intent === 'report_progress' && !slots.taskId) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 작업의 진행 상황인가요?', result: null };
    let response;
    await updateDb(async db => {
      const duplicate = replay(db, request);
      if (duplicate) { response = duplicate; return db; }
      if (intent === 'add_task') { const question = duplicateQuestion(db.tasks); if (question) { response = question; return db; } }
      const committedAt = now();
      let progressResult;
      const task = intent === 'add_task' ? createTask(db, input, breakdown, committedAt)
        : intent === 'update_task' ? updateTask(db, slots, committedAt)
        : intent === 'report_progress' ? await updateProgress(db, slots, committedAt, scheduler && progressReporter ? async (...args) => {
          progressResult = await progressReporter(...args); return progressResult;
        } : null) : null;
      const reason = intent === 'add_task' ? 'new_task' : intent === 'report_progress' ? 'progress' : intent === 'update_task' ? 'manual' : 'manual';
      const schedulerRequest = enqueueSchedule(db, { commandId: request.requestId, taskId: task?.id, reason, now: committedAt });
      const scheduling = scheduler ? await dispatchPending(db, { scheduler: progressResult ? () => progressResult : scheduler, now: committedAt }) : { rescheduled: false };
      response = { requestId: request.requestId, intent, status: scheduling.rescheduled ? 'scheduled' : 'pending_schedule',
        reply: scheduling.rescheduled ? (scheduling.unplaced.length ? '저장했어요. 마감 전에 배치하지 못한 작업시간이 있어요.' : '저장하고 일정을 다시 배치했어요.') : '저장했어요. AI 자동배치를 기다리고 있어요.',
        assumptions: [...extracted.assumptions, ...(breakdown?.assumptions ?? [])],
        result: { task, ...scheduling, ...(breakdown ? { estimate: { baseEstimatedMinutes: breakdown.baseEstimatedMinutes, rangeMinutes: breakdown.rangeMinutes } } : {}) },
        schedulerRequest };
      (db.voiceCommands ??= []).push({ id: request.requestId, hash: request.hash, createdAt: committedAt.toISOString(), response });
      return db;
    });
    return response;
  }
  async function interpret(body) {
    const request = validateVoiceRequest(body);
    const pending = inFlight.get(request.requestId);
    if (pending) { if (pending.hash !== request.hash) fail('같은 requestId에 다른 요청이 처리 중입니다.', 409); return pending.promise; }
    const promise = execute(request);
    inFlight.set(request.requestId, { hash: request.hash, promise });
    try { return await promise; } finally { inFlight.delete(request.requestId); }
  }
  async function dispatch() {
    let result;
    await updateDb(async db => { result = await dispatchPending(db, { scheduler, now: now() }); return db; });
    return result;
  }
  return { interpret, dispatch };
}
