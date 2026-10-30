import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { timeline } from '../src/scheduler/timeline.js';
import { once } from 'node:events';
import { createScheduleRouter } from '../src/routes/schedule.js';

test('캘린더 삭제: 원본 작업 보존, 선택한 날짜만 삭제, 없는 ID는 보존', async t => {
  let db = { user: { settings: { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10 } },
    tasks: [{ id: 'task', title: '과제', type: 'report', estimatedMinutes: 60, progress: 0, status: 'todo', deadline: '2026-11-01T23:59:00+09:00' }],
    scheduledBlocks: [{ id: 'block', taskId: 'task', date: '2026-10-30', start: '16:00', end: '17:00', status: 'planned' }],
    fixedBlocks: [{ id: 'class', dayOfWeek: [5], start: '10:00', end: '11:00' }], history: [{ id: 'keep' }] };
  const app = express();
  app.use(express.json());
  app.use('/api/schedule', createScheduleRouter({ readDb: async () => db,
    updateDb: async updater => { db = await updater(structuredClone(db)); }, now: () => new Date('2026-10-30T15:00:00+09:00') }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const remove = path => fetch(`http://127.0.0.1:${server.address().port}/api/schedule/items/${path}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: '2026-10-30' }) });
  assert.equal((await remove('scheduled/block')).status, 200);
  assert.equal(db.tasks.length, 1); assert.equal(db.scheduledBlocks.length, 1);
  assert.ok(!timeline(db, '2026-10-30').items.some(item => item.id === 'block'));
  assert.deepEqual(db.history, [{ id: 'keep' }]);
  assert.equal(db.fixedBlocks.length, 1);
  assert.equal((await remove('fixed/class')).status, 200);
  assert.equal(db.fixedBlocks.length, 1);
  assert.equal(timeline(db, '2026-10-30').items.length, 0);
  assert.ok(timeline(db, '2026-11-06').items.some(item => item.id === 'class'));
  const before = structuredClone(db);
  assert.equal((await remove('fixed/missing')).status, 404);
  assert.deepEqual(db, before);
  assert.equal((await remove('invalid/class')).status, 400);
});
