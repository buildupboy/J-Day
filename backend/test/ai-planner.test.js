import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningContext, validatePlan, createAiPlanner, normalizePlanningSettings } from '../src/services/ai-planner.js';
const now = new Date('2026-10-30T09:00:00+09:00');
const task = (extra = {}) => ({ id: 'task', title: '과제', type: 'report', importance: 2, deadline: '2026-10-30T22:00:00+09:00', estimatedMinutes: 60, progress: 0, status: 'todo', ...extra });
function db(extra = {}) { return { user: { settings: { dayStart: '09:00', dayEnd: '22:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10, travelMinutes: 20, dailyRestMinutes: 60 } }, tasks: [task()], scheduledBlocks: [], fixedBlocks: [{ id: 'class', title: '수업', dayOfWeek: [5], start: '10:00', end: '11:00' }], ...extra }; }
const context = data => buildPlanningContext(data, { now, reason: 'manual' });
const block = (extra = {}) => ({ taskId: 'task', subtaskId: null, date: '2026-10-30', start: '11:20', end: '12:20', reason: '수업 이동 이후 집중 작업', ...extra });
const plan = (blocks = [block()], omissions = []) => ({ blocks, omissions, summary: '이동 및 휴식을 확보했습니다.' });

test('우선순위 JSON은 설정·이동·고정 휴식·보존 블록·정확한 잔량 포함, 시간 배치 없음', () => {
  const data = db(); data.user.settings.restWindows = [{ dayOfWeek: [5], start: '12:30', end: '13:00' }];
  data.tasks.push(task({ id: 'urgent', deadline: '2026-10-30T12:00:00+09:00' }));
  const c = context(data);
  assert.equal(c.priorities[0].id, 'urgent');
  assert.equal(c.priorities[1].units[0].remaining, 60);
  assert.equal(c.occupiedWindows[0].end, '11:20');
  assert.equal(c.occupiedWindows[1].source, 'rest');
  assert.equal(c.settings.dailyRestMinutes, 60);
  assert.equal(validatePlan(plan([block()], [{ taskId: 'urgent', subtaskId: null, reason: '마감 전 수업과 이동으로 연속시간 부족' }]), c).blocks.length, 1);
});

test('충돌·업무 후 휴식·이동·마감·과다 배치·하루 한도·과거·최소단위 검증', () => {
  for (const b of [block({ start: '10:00', end: '11:00' }), block({ start: '11:10', end: '12:10' }),
    block({ start: '09:00', end: '10:00' }), block({ start: '21:30', end: '22:30' }),
    block({ end: '12:30' }), block({ start: '08:00', end: '09:00' }), block({ end: '11:30' })]) {
    assert.throws(() => validatePlan(plan([b]), context(db())));
  }
  const data = db(); data.user.settings.maxDailyMinutes = 30;
  assert.throws(() => validatePlan(plan(), context(data)), /하루/);
  data.user.settings.maxDailyMinutes = 1440; data.user.settings.dailyRestMinutes = 700;
  assert.throws(() => validatePlan(plan(), context(data)), /여유/);
});

test('하위작업 순서, 누락 사유, 중복 배치 및 완료 작업 거부', () => {
  const data = db({ tasks: [task({ subtasks: [ { id: 's1', title: '설계', estimatedMinutes: 30, done: false }, { id: 's2', title: '작성', estimatedMinutes: 30, done: false } ] })] });
  assert.throws(() => validatePlan(plan([block({ subtaskId: 's2', end: '11:50' })]), context(data)), /선행/);
  const valid = plan([block({ subtaskId: 's1', end: '11:50' }), block({ subtaskId: 's2', start: '12:00', end: '12:30' })]);
  assert.equal(validatePlan(valid, context(data)).unplaced.length, 0);
  assert.throws(() => validatePlan(plan([]), context(data)), /사유/);
  assert.throws(() => validatePlan(plan([block(), block()]), context(db())));
  assert.throws(() => validatePlan(plan(), context(db({ tasks: [task({ status: 'done', progress: 1 })] }))));
});

test('AI 결과 오류를 한 번 교정하며 배치를 코드로 대체하지 않음', async () => {
  let calls = 0; const data = db(), before = structuredClone(data);
  const planner = createAiPlanner({ completeFn: async request => {
    calls++;
    assert.equal(request.name, 'schedule_plan');
    if (calls === 1) return JSON.stringify(plan([block({ start: '10:00', end: '11:00' })]));
    assert.match(request.messages.at(-1).content, /validationErrors/);
    return JSON.stringify(plan());
  } });
  const result = await planner(data, { now, reason: 'manual' });
  assert.equal(calls, 2); assert.equal(result.planning.engine, 'ai');
  assert.equal(result.scheduledBlocks[0].start, '11:20');
  assert.deepEqual(data, before);
  const fail = createAiPlanner({ completeFn: async () => JSON.stringify(plan([block({ start: '10:00', end: '11:00' })])) });
  await assert.rejects(fail(data, { now, reason: 'manual' }), /기존 일정은 유지/);
  assert.deepEqual(data, before);
});

test('진행 중 예약 차감과 완료 기록 보존, 같은 AI 계획의 블록 ID 유지', async () => {
  const data = db({ scheduledBlocks: [{ id: 'ongoing', taskId: 'task', date: '2026-10-30', start: '08:30', end: '09:30', status: 'planned' }, { id: 'future', taskId: 'task', date: '2026-10-30', start: '11:20', end: '11:50', status: 'planned' }] });
  assert.equal(context(data).priorities[0].units[0].remaining, 30);
  const planner = createAiPlanner({ completeFn: async () => JSON.stringify(plan([block({ end: '11:50' })])) });
  const result = await planner(data, { now, reason: 'progress' });
  assert.equal(result.scheduledBlocks[0].id, 'ongoing');
  assert.equal(result.scheduledBlocks[1].id, 'future');
});

test('미배치량은 서버에서 계산, 잘못된 설정 거부', async () => {
  const planner = createAiPlanner({ completeFn: async () => JSON.stringify(plan([], [{ taskId: 'task', subtaskId: null, reason: '마감 전 수업과 이동시간으로 시간이 부족합니다.' }])) });
  const result = await planner(db(), { now, reason: 'manual' });
  assert.equal(result.unplaced[0].remainingMinutes, 60);
  assert.throws(() => normalizePlanningSettings({ travelMinutes: -1 }));
  assert.throws(() => normalizePlanningSettings({ restWindows: [{ start: '13:00', end: '12:00', dayOfWeek: [5] }] }));
});

test('실제 저장소와 작업·설정 API에서 비동기 AI 계획을 저장, 실패는 원자적으로 취소', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const express = (await import('express')).default;
  const { once } = await import('node:events');
  const { createJsonStore } = await import('../src/store/index.js');
  const { createTasksRouter } = await import('../src/routes/tasks.js');
  const { createScheduleRouter } = await import('../src/routes/schedule.js');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-plan-flow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seedPath = path.join(directory, 'seed.json');
  await writeFile(seedPath, JSON.stringify(db({ tasks: [] })));
  const store = createJsonStore({ seedPath, dbPath: path.join(directory, 'db.json') });
  let calls = 0, fail = false;
  const planner = createAiPlanner({ completeFn: async request => {
    calls++;
    if (fail) throw new Error('AI unavailable');
    const input = JSON.parse(request.messages[0].content);
    const taskId = input.priorities[0].id;
    assert.equal(input.timezone, 'Asia/Seoul');
    return JSON.stringify(plan([block({ taskId })]));
  } });
  const app = express(); app.use(express.json());
  app.use('/tasks', createTasksRouter({ ...store, planner, now: () => now }));
  app.use('/schedule', createScheduleRouter({ ...store, planner, now: () => now }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (url, method, body) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const added = await request('/tasks', 'POST', { title: '과제', type: 'report', baseEstimatedMinutes: 60, deadline: '2026-10-30T22:00:00+09:00' });
  assert.equal(added.status, 201);
  assert.equal((await added.json()).scheduledBlocks[0].start, '11:20');
  assert.equal(calls, 1);
  const settings = await request('/schedule/settings', 'PUT', { dailyRestMinutes: 90, breakMinutes: 15 });
  assert.equal(settings.status, 200);
  assert.equal((await settings.json()).planning.engine, 'ai');
  assert.equal((await store.readDb()).user.settings.dailyRestMinutes, 90);
  const before = await store.readDb(); fail = true;
  assert.equal((await request('/schedule/settings', 'PUT', { dailyRestMinutes: 120 })).status, 500);
  assert.deepEqual(await store.readDb(), before);
});
