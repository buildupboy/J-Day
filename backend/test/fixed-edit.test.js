import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createScheduleRouter } from '../src/routes/schedule.js';
import { timeline } from '../src/scheduler/timeline.js';

test('고정 시간·루틴 수정과 메모, 겹침·잘못된 값 거부', async t => {
  let db = { user: { settings: {} }, tasks: [], scheduledBlocks: [],
    fixedBlocks: [
      { id: 'c', kind: 'class', title: '자료구조', location: '공학관', dayOfWeek: [1], start: '09:00', end: '10:30' },
      { id: 'r', kind: 'routine', title: '아침 운동', dayOfWeek: [0, 1, 2], start: '07:00', end: '07:40' },
      { id: 'j', kind: 'job', title: '알바', dayOfWeek: [1], start: '13:00', end: '15:00' }] };
  const app = express();
  app.use(express.json());
  app.use('/api/schedule', createScheduleRouter({ readDb: async () => db, updateDb: async updater => { db = await updater(structuredClone(db)); } }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const patch = (id, body) => fetch(`http://127.0.0.1:${server.address().port}/api/schedule/fixed/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await patch('c', { title: ' 알고리즘 ', location: '본관', start: '10:00', end: '11:30', dayOfWeek: [3, 1] })).status, 200);
  assert.deepEqual(db.fixedBlocks[0], { id: 'c', kind: 'class', title: '알고리즘', location: '본관', dayOfWeek: [1, 3], start: '10:00', end: '11:30' });
  assert.equal((await patch('r', { memo: '스트레칭 먼저' })).status, 200);
  assert.equal(db.fixedBlocks[1].memo, '스트레칭 먼저');
  assert.equal(timeline(db, '2026-11-02').items.find(item => item.id === 'r').memo, '스트레칭 먼저');
  assert.equal((await patch('r', { memo: '   ' })).status, 200);
  assert.equal(db.fixedBlocks[1].memo, undefined);

  const before = structuredClone(db);
  assert.equal((await patch('c', { start: '16:00', end: '16:30' })).status, 200);
  assert.equal((await patch('c', { start: '16:00', end: '13:30' })).status, 400);
  assert.equal((await patch('c', { start: '9:00' })).status, 400);
  assert.equal((await patch('c', { dayOfWeek: [] })).status, 400);
  assert.equal((await patch('c', { kind: 'job' })).status, 400);
  assert.equal((await patch('c', { memo: 'x'.repeat(1001) })).status, 400);
  assert.equal((await patch('c', { start: '13:30', end: '14:30' })).status, 409); // 알바(13:00–15:00)와 겹침
  assert.equal((await patch('none', { title: 'x' })).status, 404);
  assert.deepEqual(db.fixedBlocks.map(item => item.start), ['16:00', '07:00', '13:00']);
  assert.notDeepEqual(db, before);
});
