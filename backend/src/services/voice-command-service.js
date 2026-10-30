import { updateAvailability, availabilityReply } from './scheduling-constraints.js';
import { MAX_TASK_STEPS } from '../prompts/task-granularity.js';
import { randomUUID, createHash } from 'node:crypto';
import * as llm from './llm.js';
import { INTERPRET_SCHEMA, BREAKDOWN_SCHEMA, TASK_TYPES, MAX_UTTERANCE_TASKS } from '../prompts/schemas.js';
import { computeCorrectionFactors, applyCorrection } from '../scheduler/estimator.js';
import { normalizeBreakdown } from './estimate-rounding.js';
import { schedulingRevision } from '../scheduler/planning-context.js';
import { enqueueSchedule, dispatchPending } from './scheduler-gateway.js';
import { occursOn } from '../scheduler/time.js';
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
    baseEstimatedMinutes: slots.baseEstimatedMinutes, importance: slots.importance ?? 2, estimateByAi: slots.estimateByAi === true, distinctFromExisting: slots.distinctFromExisting === true };
}

const titleKey = title => title.replace(/\s/g, '').toLowerCase();

// 사용자가 기존 과제와 다른 과제라고 확인하면 제목 뒤에 번호를 붙여 구분한다. 예: 알고리즘 과제 → 알고리즘 과제 2
function uniqueTitle(title, tasks) {
  const taken = new Set(tasks.map(task => titleKey(task.title)));
  if (!taken.has(titleKey(title))) return title;
  let number = 2;
  while (taken.has(titleKey(`${title} ${number}`))) number++;
  return `${title} ${number}`;
}

// 저장된 과제와 이름이 같은 항목은 새로 만들지 않고 따로 모은다. 같은 발화 안의 같은 이름은 하나만 둔다.
function partitionDuplicates(inputs, tasks, previous = []) {
  const seen = new Set(), fresh = [], duplicates = [...previous];
  for (const input of inputs) {
    const key = titleKey(input.title);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = tasks.find(task => titleKey(task.title) === key);
    if (!existing || input.distinctFromExisting) fresh.push(input);
    else if (!duplicates.some(item => item.id === existing.id)) duplicates.push(existing);
  }
  return { fresh, duplicates };
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
  breakdownTask = llm.breakdownTask, scheduler = null, progressReporter = null, now = () => new Date(), backgroundScheduling = false }) {
  // 같은 requestId의 병렬 요청은 모델을 한 번만 호출한다. 저장 직전에도 중복을 검사한다.
  const inFlight = new Map();
  // 배치(AI 호출)는 오래 걸리므로 저장을 먼저 끝내고 뒤에서 한 번에 하나씩 실행한다.
  // 저장소 잠금 밖에서 사본으로 계획한 뒤, 그동안 일정이 바뀌지 않았을 때만 짧게 반영한다.
  let scheduleRun = null, scheduleError = null, rerun = false;
  async function scheduleOnce() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await readDb();
      if (!(snapshot.schedulerRequests ?? []).some(item => item.status === 'pending')) return;
      const draft = structuredClone(snapshot);
      await dispatchPending(draft, { scheduler, now: now() });
      let applied = false;
      await updateDb(async db => {
        if (schedulingRevision(db) !== schedulingRevision(snapshot)) return db;
        db.scheduledBlocks = draft.scheduledBlocks;
        if (draft.aiScheduling) db.aiScheduling = draft.aiScheduling;
        const processed = new Map((draft.schedulerRequests ?? []).filter(item => item.status === 'processed').map(item => [item.id, item]));
        db.schedulerRequests = (db.schedulerRequests ?? []).map(item => processed.get(item.id) ?? item);
        applied = true;
        return db;
      });
      if (applied) return;
    }
    throw new Error('배치하는 동안 일정이 계속 바뀌었어요. 잠시 후 다시 시도해 주세요.');
  }
  function startScheduling() {
    if (typeof scheduler !== 'function') return null;
    if (scheduleRun) { rerun = true; return scheduleRun; }
    scheduleError = null;
    scheduleRun = (async () => {
      try {
        do { rerun = false; await scheduleOnce(); } while (rerun);
      } catch (error) {
        scheduleError = error.message || '일정을 배치하지 못했어요.';
      } finally { scheduleRun = null; }
    })();
    return scheduleRun;
  }
  async function schedulingStatus() {
    const db = await readDb();
    return { running: Boolean(scheduleRun), error: scheduleError, pending: (db.schedulerRequests ?? []).filter(item => item.status === 'pending').length };
  }
  async function estimate(input, request) {
    const { estimateByAi, ...task } = input;
    const breakdown = await breakdownTask({ ...task, utterance: request.text, conversation: request.conversation });
    assertSchema(breakdown, BREAKDOWN_SCHEMA);
    integer(breakdown.baseEstimatedMinutes, 'baseEstimatedMinutes', 1);
    if (!breakdown.subtasks.length || breakdown.subtasks.length > MAX_TASK_STEPS) fail('하위작업은 큰 단계 1~4개여야 합니다.', 502);
    for (const subtask of breakdown.subtasks) { subtask.title = validText(subtask.title, 'subtask.title'); integer(subtask.estimatedMinutes, 'subtask.estimatedMinutes', 1); }
    if (breakdown.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0) !== breakdown.baseEstimatedMinutes) fail('AI 추정시간과 하위작업 합계가 일치하지 않습니다.', 502);
    if (input.baseEstimatedMinutes !== null && breakdown.baseEstimatedMinutes !== input.baseEstimatedMinutes) fail('사용자가 지정한 예상시간이 변경됐습니다.', 502);
    if (breakdown.rangeMinutes.length !== 2 || !breakdown.rangeMinutes.every(Number.isSafeInteger) || breakdown.rangeMinutes[0] < 1 || breakdown.rangeMinutes[0] > breakdown.baseEstimatedMinutes || breakdown.rangeMinutes[1] < breakdown.baseEstimatedMinutes || breakdown.rangeMinutes[1] > 1000000) fail('추정시간 범위가 올바르지 않습니다.', 502);
    return normalizeBreakdown(breakdown, input.baseEstimatedMinutes);
  }
  async function execute(request) {
    const snapshot = await readDb();
    const saved = replay(snapshot, request);
    if (saved) return saved;
    const current = now();
    const context = { now: kstInstant(current), today: kstDate(current), timezone: 'Asia/Seoul',
      tasks: snapshot.tasks.map(({ id, title, type, deadline, progress, actualMinutes, status, baseEstimatedMinutes, importance }) => ({ id, title, type, deadline, progress, actualMinutes, status, baseEstimatedMinutes, importance })) };
    const extracted = await interpreter(request.text, context, request.conversation);
    // 기존 의도 해석기/테스트 응답도 호환하며 새 모델 스키마는 두 필드를 필수 반환한다.
    if (extracted?.slots) extracted.slots = { unavailableDates: null, availabilityAction: null, estimateByAi: false, distinctFromExisting: false, ...extracted.slots };
    if (extracted && typeof extracted === 'object' && !Object.hasOwn(extracted, 'extraTasks')) extracted.extraTasks = [];
    if (Array.isArray(extracted?.extraTasks)) extracted.extraTasks = extracted.extraTasks.map(task => task && typeof task === 'object' ? { estimateByAi: false, distinctFromExisting: false, ...task } : task);
    assertSchema(extracted, INTERPRET_SCHEMA);
    let { intent } = extracted;
    const { slots } = extracted;
    const sameOrDifferent = ['다른 과제예요', '같은 과제예요, 수정해 주세요'];
    // 이미 있는 과제와 다른 새 과제인지 먼저 묻고, 새 과제라면 빠진 마감·예상시간도 같이 안내한다.
    const missingInfo = item => [!item.deadline && '마감일', item.baseEstimatedMinutes === null && !item.estimateByAi && '예상 소요시간'].filter(Boolean);
    const duplicateQuestion = tasks => {
      const byId = slots.taskId ? tasks.find(task => task.id === slots.taskId) : null;
      const matches = byId ? [byId] : tasks.filter(task => slots.title && titleKey(task.title) === titleKey(slots.title));
      if (!matches.length || (slots.distinctFromExisting && !slots.taskId)) return null;
      const missing = missingInfo(slots);
      return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification',
        reply: matches.length === 1 ? `이미 등록된 과제 ‘${matches[0].title}’가 있어요. 위 과제와 다른 새 과제인가요?${missing.length ? ` 다른 과제라면 ${missing.join('과 ')}도 알려 주세요.` : ''}` : '같은 이름의 과제가 여러 개예요. 어떤 날짜의 과제를 수정할까요?',
        assumptions: extracted.assumptions,
        result: matches.length === 1 ? { task: structuredClone(matches[0]), cardMode: 'existing', quickReplies: sameOrDifferent } : null };
    };
    const duplicateReply = existing => ({ requestId: request.requestId, intent: 'clarify', status: 'needs_clarification',
      reply: existing.length === 1 ? `이미 등록된 과제 ‘${existing[0].title}’가 있어요. 위 과제와 다른 새 과제인가요?` : `이미 등록된 과제예요: ${existing.map(task => `‘${task.title}’`).join(', ')}. 각각 위 과제와 다른 새 과제인가요?`,
      assumptions: extracted.assumptions, result: { task: existing.length === 1 ? structuredClone(existing[0]) : null, duplicates: structuredClone(existing), cardMode: 'existing', quickReplies: sameOrDifferent } });
    // 모델이 중복 등록을 clarify로 분류한 경우도 서버의 실제 저장 카드로 안내한다.
    if (intent === 'clarify' && /수정|변경/.test(extracted.reply)) {
      const named = [slots, ...extracted.extraTasks].filter(task => task.title);
      if (named.length > 1) {
        // 여러 과제 중 일부만 중복이면 새 과제는 저장하고 중복만 안내한다. 새 과제 정보가 부족하면 중복 안내만 한다.
        const found = partitionDuplicates(named, snapshot.tasks);
        if (found.duplicates.length) {
          if (found.fresh.every(task => task.deadline && TASK_TYPES.includes(task.type))) intent = 'add_task';
          else return duplicateReply(found.duplicates);
        }
      } else {
        const question = duplicateQuestion(snapshot.tasks);
        if (question) return question;
      }
    }
    if (['clarify', 'unsupported'].includes(intent)) return { requestId: request.requestId, intent,
      status: intent === 'clarify' ? 'needs_clarification' : 'unsupported', reply: extracted.reply, assumptions: extracted.assumptions, result: null };
    if (intent === 'query_schedule') {
      const target = slots.date === null ? kstDate(now()) : date(slots.date);
      const latest = await readDb();
      return { requestId: request.requestId, intent, status: 'read_only', reply: '저장된 일정을 조회했어요.',
        result: { date: target, fixedBlocks: latest.fixedBlocks.filter(block => occursOn(block, target)),
          scheduledBlocks: latest.scheduledBlocks.filter(block => block.date === target) } };
    }
    // 한 발화의 여러 작업: 첫 작업은 slots, 나머지는 extraTasks. 하나뿐이면 기존 흐름과 같다.
    const candidates = intent === 'add_task' ? [slots, ...extracted.extraTasks] : [];
    const multi = candidates.length > 1;
    if (candidates.length > MAX_UTTERANCE_TASKS) fail(`한 번에 ${MAX_UTTERANCE_TASKS}개까지만 등록할 수 있어요.`);
    if (intent === 'add_task' && !multi) {
      const question = duplicateQuestion(snapshot.tasks);
      if (question) return question;
    }
    if (intent === 'update_task' && !slots.taskId) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 일정을 변경할까요?', result: null };
    let inputs = [], duplicates = [];
    const breakdownOf = new Map();
    if (intent === 'add_task') {
      if (!multi && (!slots.title || !slots.deadline)) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 작업을 언제까지 해야 하나요?', result: null };
      if (multi) {
        // 이미 등록된 과제는 정보가 비어 있어도 걸러내고, 새 과제만 마감을 확인한다.
        const untitled = candidates.filter(task => !task.title);
        const split = partitionDuplicates(candidates.filter(task => task.title), snapshot.tasks);
        duplicates = split.duplicates;
        const incomplete = [...untitled, ...split.fresh.filter(task => !task.deadline)];
        if (incomplete.length) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification',
          reply: incomplete.every(task => task.title) ? `${incomplete.map(task => `‘${task.title}’`).join(', ')}의 마감은 언제까지인가요?` : '각 작업의 이름과 마감을 알려 주세요.', result: null };
        inputs = split.fresh.map(validateTask);
        if (!inputs.length) return duplicateReply(duplicates);
      } else inputs = candidates.map(validateTask);
      // 시간을 말하지 않았고 제이의 추정도 요청하지 않은 과제는 저장 전에 한 번에 묻는다.
      const needTime = inputs.filter(input => input.baseEstimatedMinutes === null && !input.estimateByAi);
      if (needTime.length) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification',
        reply: needTime.length === 1 && inputs.length === 1 ? `‘${needTime[0].title}’은(는) 얼마나 걸릴 것 같나요? 시간을 알려 주시거나 “제이가 정해줘”라고 말씀해 주세요.`
          : `${needTime.map(input => `‘${input.title}’`).join(', ')}은(는) 각각 얼마나 걸릴 것 같나요? 시간을 알려 주시거나 “제이가 정해줘”라고 말씀해 주세요.`,
        assumptions: extracted.assumptions, result: { quickReplies: [needTime.length > 1 ? '다 제이가 정해줘' : '제이가 정해줘'] } };
      const breakdowns = await Promise.all(inputs.map(input => estimate(input, request)));
      inputs.forEach((input, index) => breakdownOf.set(titleKey(input.title), breakdowns[index]));
    }
    if (intent === 'report_progress' && !slots.taskId) return { requestId: request.requestId, intent: 'clarify', status: 'needs_clarification', reply: '어떤 작업의 진행 상황인가요?', result: null };
    let response;
    await updateDb(async db => {
      const duplicate = replay(db, request);
      if (duplicate) { response = duplicate; return db; }
      let toCreate = inputs, skipped = duplicates;
      if (intent === 'add_task') {
        if (multi) {
          ({ fresh: toCreate, duplicates: skipped } = partitionDuplicates(inputs, db.tasks, duplicates));
          if (!toCreate.length) { response = duplicateReply(skipped); return db; }
        } else { const question = duplicateQuestion(db.tasks); if (question) { response = question; return db; } }
      }
      const committedAt = now();
      const availability = intent === 'reschedule' ? updateAvailability(db, slots, committedAt) : null;
      let progressResult;
      const created = intent === 'add_task' ? toCreate.map(input => createTask(db, input.distinctFromExisting ? { ...input, title: uniqueTitle(input.title, db.tasks) } : input, breakdownOf.get(titleKey(input.title)), committedAt)) : [];
      const breakdown = created.length ? breakdownOf.get(titleKey(created[0].title)) : null;
      const task = intent === 'add_task' ? created[0]
        : intent === 'update_task' ? updateTask(db, slots, committedAt)
        : intent === 'report_progress' ? await updateProgress(db, slots, committedAt, scheduler && progressReporter ? async (...args) => {
          progressResult = await progressReporter(...args); return progressResult;
        } : null) : null;
      const reason = intent === 'add_task' ? 'new_task' : intent === 'report_progress' ? 'progress' : intent === 'update_task' ? 'manual' : 'manual';
      const schedulerRequest = enqueueSchedule(db, { commandId: request.requestId, taskId: task?.id, reason, now: committedAt });
      const defer = backgroundScheduling && typeof scheduler === 'function' && ['add_task', 'update_task'].includes(intent);
      const scheduling = defer ? { rescheduled: false, deferred: true } : scheduler ? await dispatchPending(db, { scheduler: progressResult ? () => progressResult : scheduler, now: committedAt }) : { rescheduled: false };
      const count = created.length > 1 ? `${created.length}개 작업을 ` : '';
      const duplicateNote = skipped.length ? ` ${skipped.map(item => `‘${item.title}’`).join(', ')}은(는) 이미 등록된 과제라 건너뛰었어요. 새로운 다른 과제라면 알려 주세요.` : '';
      response = { requestId: request.requestId, intent, status: scheduling.rescheduled ? 'scheduled' : 'pending_schedule',
        reply: (availability ? availabilityReply(availability, scheduling, db, now()) : scheduling.rescheduled ? (scheduling.unplaced.length ? `${count}저장했어요. 마감 전에 배치하지 못한 작업시간이 있어요.` : `${count}저장하고 일정을 다시 배치했어요.`) : `${count}저장했어요. ${scheduling.deferred ? '일정을 배치하는 중이에요.' : 'AI 자동배치를 기다리고 있어요.'}`) + duplicateNote,
        assumptions: [...extracted.assumptions, ...created.flatMap(item => breakdownOf.get(titleKey(item.title))?.assumptions ?? [])],
        result: { task, ...(created.length > 1 || skipped.length ? { tasks: created, duplicates: skipped.map(item => structuredClone(item)) } : {}), ...(availability ? { availability } : {}), ...(['add_task', 'update_task'].includes(intent) ? { cardMode: 'saved' } : {}), ...scheduling, ...(breakdown ? { estimate: { baseEstimatedMinutes: breakdown.baseEstimatedMinutes, rangeMinutes: breakdown.rangeMinutes } } : {}) },
        schedulerRequest, ...(scheduling.deferred ? { schedulingInBackground: true } : {}) };
      (db.voiceCommands ??= []).push({ id: request.requestId, hash: request.hash, createdAt: committedAt.toISOString(), response });
      return db;
    });
    if (response?.schedulingInBackground && !response.replayed) startScheduling();
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
  return { interpret, dispatch, schedulingStatus, startScheduling };
}
