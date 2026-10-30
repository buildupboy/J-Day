import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createScheduleRouter } from '../src/routes/schedule.js';

test('작업 블록 미루기: 날짜·시각 이동, 묶인 블록 간격 유지, 겹침·마감·과거 거부', async t => {
  let db = { user: { settings: { breakMinutes: 10, dayStart: '07:00', dayEnd: '24:00' } },
    tasks: [{ id: 'a', title: '과제', deadline: '2026-11-05T23:59:00+09:00' }, { id: 'b', title: '다른 과제', deadline: '2026-11-05T23:59:00+09:00' }],
    fixedBlocks: [{ id: 'c', kind: 'class', title: '수업', dayOfWeek: [2], start: '09:00', end: '10:30' }],
    scheduledBlocks: [
      { id: 'a1', taskId: 'a', date: '2026-10-30', start: '16:00', end: '16:30', status: 'planned' },
      { id: 'a2', taskId: 'a', date: '2026-10-30', start: '16:40', end: '17:10', status: 'planned' },
      { id: 'b1', taskId: 'b', date: '2026-11-01', start: '14:00', end: '15:00', status: 'planned' },
      { id: 'd1', taskId: 'a', date: '2026-10-30', start: '10:00', end: '10:30', status: 'done' }] };
  const app = express();
  app.use(express.json());
  app.use('/api/schedule', createScheduleRouter({ readDb: async () => db, updateDb: async updater => { db = await updater(structuredClone(db)); }, now: () => new Date('2026-10-30T12:00:00+09:00') }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const move = body => fetch(`http://127.0.0.1:${server.address().port}/api/schedule/blocks/postpone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const times = ids => db.scheduledBlocks.filter(b => ids.includes(b.id)).map(b => `${b.date} ${b.start}-${b.end}`);

  assert.equal((await move({ blockIds: ['a1', 'a2'], date: '2026-11-01', start: '10:00' })).status, 200);
  assert.deepEqual(times(['a1', 'a2']), ['2026-11-01 10:00-10:30', '2026-11-01 10:40-11:10']);
  assert.equal(db.scheduledBlocks.find(b => b.id === 'a1').status, 'planned');

  const before = structuredClone(db);
  assert.equal((await move({ blockIds: ['a1'], date: '2026-10-30', start: '08:00' })).status, 400); // 과거
  assert.equal((await move({ blockIds: ['a1'], date: '2026-11-01', start: '14:30' })).status, 409); // 다른 작업과 겹침
  assert.equal((await move({ blockIds: ['a1'], date: '2026-11-01', start: '15:05' })).status, 409); // 쉬는 시간 부족
  assert.equal((await move({ blockIds: ['a1'], date: '2026-11-03', start: '09:30' })).status, 409); // 수업(화) + 앞뒤 휴식
  assert.equal((await move({ blockIds: ['a1'], date: '2026-11-06', start: '10:00' })).status, 409); // 마감 이후
  assert.equal((await move({ blockIds: ['d1'], date: '2026-11-02', start: '10:00' })).status, 409); // 완료한 일정
  assert.equal((await move({ blockIds: ['a1', 'b1'], date: '2026-11-02', start: '10:00' })).status, 400); // 서로 다른 작업
  assert.equal((await move({ blockIds: ['none'], date: '2026-11-02', start: '10:00' })).status, 404);
  assert.equal((await move({ blockIds: ['a1'], date: '2026-11-02', start: '25:00' })).status, 400);
  assert.deepEqual(db, before);
});
