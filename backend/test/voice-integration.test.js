import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createLlmClient } from '../src/services/llm.js';
import { createChatRouter } from '../src/routes/chat.js';
import { createScheduleRouter } from '../src/routes/schedule.js';
import { reschedule } from '../src/scheduler/rescheduler.js';
import { reportProgress } from '../src/services/task-service.js';

test('음성 작업 저장 → AI 입력 준비 → 검증·적용 → 조회·완료 통합', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-integrated-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json'), seedPath = path.join(dir, 'seed.json');
  await writeFile(seedPath, JSON.stringify({ user: { settings: {
    dayStart: '08:00', dayEnd: '22:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10,
  } }, tasks: [], scheduledBlocks: [], fixedBlocks: [
    { id: 'class', kind: 'class', title: '고정 수업', dayOfWeek: [5], start: '09:00', end: '10:30' },
  ], history: [{ type: 'report', estimatedMinutes: 100, actualMinutes: 150 }] }));
  const store = createJsonStore({ dbPath, seedPath });
  let nowValue = new Date('2026-10-30T08:00:00+09:00');
  const now = () => new Date(nowValue);
  let taskId, calls = 0, complete = false;
  const llm = createLlmClient({ env: { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-only' }, fetchImpl: async (url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    const output = request.response_format.json_schema.name === 'task_breakdown'
      ? { baseEstimatedMinutes: 100, subtasks: [{ title: '조사', estimatedMinutes: 40 }, { title: '작성', estimatedMinutes: 60 }], rangeMinutes: [80, 140], assumptions: [] }
      : { intent: complete ? 'report_progress' : 'add_task', slots: {
        title: '통합 테스트 보고서', type: 'report', deadline: '2026-10-31T23:59:00+09:00',
        baseEstimatedMinutes: 100, importance: 3, taskId: taskId ?? null,
        progress: complete ? 1 : null, actualMinutes: complete ? 140 : null,
        actualMinutesMode: complete ? 'cumulative' : null, date: null,
      }, reply: '확인했어요.', assumptions: [] };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
  } });
  const app = express(); app.use(express.json());
  app.use('/api/chat', createChatRouter({ ...store, ...llm, interpreter: llm.interpretUtterance, scheduler: reschedule, progressReporter: reportProgress, now }));
  app.use('/api/schedule', createScheduleRouter({ ...store, now }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function send(body) {
    const response = await fetch(`${base}/chat/interpret`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return response.json();
  }
  const body = { requestId: 'registration', text: '내일까지 보고서, 100분 예상' };
  const created = await send(body); taskId = created.result.task.id;
  assert.equal(created.status, 'pending_schedule');
  assert.equal(created.result.rescheduled, false);
  assert.deepEqual(created.result.scheduledBlocks, []);
  const aiResponse = await fetch(`${base}/schedule/apply`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
    contextId:created.result.planningContext.contextId, blocks:[
      {taskId,subtaskId:created.result.task.subtasks[0].id,date:'2026-10-30',start:'10:30',end:'11:30'},
      {taskId,subtaskId:created.result.task.subtasks[1].id,date:'2026-10-30',start:'11:40',end:'13:10'},
    ] }) });
  assert.equal(aiResponse.status,200);
  const applied=await aiResponse.json();
  assert.equal(applied.rescheduled,true);
  assert.equal(created.result.task.estimatedMinutes, 150); // 원본100 × 실제 보정1.5, 한 번만 적용
  assert.equal(created.result.task.baseEstimatedMinutes, 100);
  const blocks = applied.scheduledBlocks.filter(block => block.taskId === taskId);
  assert.ok(blocks.length > 0);
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  assert.equal(blocks.reduce((sum, block) => sum + minutes(block.end) - minutes(block.start), 0), 150);
  assert.ok(blocks.every(block => block.date !== '2026-10-30' || block.end <= '09:00' || block.start >= '10:30'));
  const week = await (await fetch(`${base}/schedule/week?from=2026-10-26`)).json();
  assert.ok(week.days.flatMap(day => day.items).some(item => item.taskId === taskId));
  assert.deepEqual(JSON.parse(await readFile(dbPath, 'utf8')).scheduledBlocks, applied.scheduledBlocks);
  await send(body); assert.equal(calls, 2);
  nowValue = new Date('2026-10-30T11:00:00+09:00'); complete = true;
  const done = await send({ requestId: 'completion', text: '보고서 끝났고 총 140분 썼어' });
  assert.equal(done.result.task.status, 'done');
  const saved = await store.readDb();
  assert.equal(saved.history.filter(record => record.taskId === taskId).length, 1);
  assert.ok(saved.scheduledBlocks.some(block => block.taskId === taskId && block.status === 'done'));
  assert.ok(!saved.scheduledBlocks.some(block => block.taskId === taskId && block.status === 'planned'));
});
