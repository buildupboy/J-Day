import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createTasksRouter } from '../src/routes/tasks.js';
import { createBackgroundScheduler } from '../src/services/background-scheduler.js';

const NOW = '2026-10-30T15:00:00+09:00';
const body = { title: '짧은 과제', type: 'etc', deadline: '2026-11-04T23:59:00+09:00', baseEstimatedMinutes: 10, subtasks: [] };

async function setup(t, scheduler) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-task-bg-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json'), seedPath = path.join(dir, 'seed.json');
  await writeFile(seedPath, JSON.stringify({ user: { settings: {} }, fixedBlocks: [], tasks: [], scheduledBlocks: [], history: [] }));
  const store = createJsonStore({ dbPath, seedPath }); await store.initStore();
  const now = () => new Date(NOW);
  const background = createBackgroundScheduler({ ...store, scheduler, now });
  const app = express(); app.use(express.json());
  app.use('/api/tasks', createTasksRouter({ ...store, now, planner: async () => { throw new Error('요청 안에서 배치하면 안 됩니다.'); }, background }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const post = async value => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); return { status: response.status, body: await response.json() }; };
  const settled = async () => { for (let i = 0; i < 100; i++) { const status = await background.status(); if (!status.running) return status; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('끝나지 않음'); };
  return { ...store, post, settled };
}

test('직접 작업 추가는 저장만 하고 바로 응답, 배치는 뒤에서 처리', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const scheduler = async db => { await gate;
    return { rescheduled: true, changes: [], unplaced: [], scheduledBlocks: [{ id: 'sb', taskId: db.tasks[0].id, date: '2026-10-31', start: '10:00', end: '10:10', status: 'planned' }] }; };
  const h = await setup(t, scheduler);
  const created = await h.post(body);
  assert.equal(created.status, 201); assert.equal(created.body.schedulingInBackground, true); assert.equal(created.body.rescheduled, false);
  assert.equal((await h.readDb()).tasks.length, 1);
  release();
  const status = await h.settled();
  assert.equal(status.error, null); assert.equal(status.pending, 0);
  assert.equal((await h.readDb()).scheduledBlocks[0].id, 'sb');
});

test('배치가 실패해도 작업은 저장돼 있고 요청은 대기로 남는다', async t => {
  const h = await setup(t, async () => { throw new Error('제한시간을 넘겼어요'); });
  assert.equal((await h.post(body)).status, 201);
  const status = await h.settled();
  assert.match(status.error, /제한시간/); assert.equal(status.pending, 1); assert.equal((await h.readDb()).tasks.length, 1);
});
