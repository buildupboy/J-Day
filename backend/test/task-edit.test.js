import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createTasksRouter } from '../src/routes/tasks.js';

test('작업 수정·삭제와 하위작업 추가·수정·삭제, 알림 설정', async t => {
  let db = { user: { settings: {} }, history: [{ id: 'keep' }],
    tasks: [
      { id: 'a', title: '과제', type: 'report', deadline: '2026-11-03T11:00:00+09:00', importance: 2, baseEstimatedMinutes: 30, estimatedMinutes: 30, progress: 0, status: 'todo',
        subtasks: [{ id: 's1', title: '자료', estimatedMinutes: 10, done: false }, { id: 's2', title: '초안', estimatedMinutes: 20, done: false }] },
      { id: 'b', title: '다른 작업', type: 'etc', deadline: '2026-11-04T11:00:00+09:00', estimatedMinutes: 10, progress: 0, status: 'todo', subtasks: [] }],
    scheduledBlocks: [{ id: 'x1', taskId: 'a', subtaskId: 's1' }, { id: 'x2', taskId: 'a', subtaskId: 's2' }, { id: 'y1', taskId: 'b' }] };
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter({ readDb: async () => db, updateDb: async updater => { db = await updater(structuredClone(db)); }, now: () => new Date('2026-10-30T15:00:00+09:00') }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const call = (method, path, body) => fetch(`http://127.0.0.1:${server.address().port}/api/tasks${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

  assert.equal((await call('PATCH', '/a', { title: '  새 제목 ', importance: 3 })).status, 200);
  assert.equal(db.tasks[0].title, '새 제목'); assert.equal(db.tasks[0].importance, 3);
  assert.equal((await call('PATCH', '/a', { importance: 9 })).status, 400);
  assert.equal((await call('PATCH', '/a', { progress: 1 })).status, 400);
  assert.equal((await call('PATCH', '/none', { title: 'x' })).status, 404);

  const two = [{ mode: 'beforeDeadline', minutes: 1440 }, { mode: 'beforeDeadline', minutes: 30 }, { mode: 'at', at: '2026-11-02T09:00:00+09:00' }];
  assert.equal((await call('PATCH', '/a', { reminders: two })).status, 200);
  assert.deepEqual(db.tasks[0].reminders, two);
  assert.equal((await call('PATCH', '/a', { reminders: [{ mode: 'beforeDeadline', minutes: 45 }] })).status, 400);
  assert.equal((await call('PATCH', '/a', { reminders: [{ mode: 'beforeDeadline', minutes: 60 }, { mode: 'beforeDeadline', minutes: 60 }] })).status, 400);
  assert.equal((await call('PATCH', '/a', { reminders: [{ mode: 'at', at: 'tomorrow' }] })).status, 400);
  assert.equal((await call('PATCH', '/a', { reminders: 'none' })).status, 400);
  assert.deepEqual(db.tasks[0].reminders, two);
  assert.equal((await call('PATCH', '/a', { reminders: [] })).status, 200);
  assert.equal(db.tasks[0].reminders, undefined);

  assert.equal((await call('PATCH', '/a', { memo: '교수님 메일 확인' })).status, 200);
  assert.equal(db.tasks[0].memo, '교수님 메일 확인');
  assert.equal((await call('PATCH', '/a', { memo: 'x'.repeat(1001) })).status, 400);
  assert.equal((await call('PATCH', '/a', { memo: '  ' })).status, 200);
  assert.equal(db.tasks[0].memo, undefined);

  const added = await call('POST', '/a/subtasks', { title: '검토', estimatedMinutes: 15 });
  assert.equal(added.status, 201);
  assert.equal(db.tasks[0].subtasks.length, 3); assert.equal(db.tasks[0].baseEstimatedMinutes, 45);
  assert.equal((await call('POST', '/a/subtasks', { title: '', estimatedMinutes: 15 })).status, 400);
  assert.equal((await call('PATCH', '/a/subtasks/s1', { estimatedMinutes: 25, title: '자료 조사' })).status, 200);
  assert.equal(db.tasks[0].baseEstimatedMinutes, 60);
  assert.equal((await call('DELETE', '/a/subtasks/s2')).status, 200);
  assert.deepEqual(db.tasks[0].subtasks.map(s => s.id).includes('s2'), false);
  assert.deepEqual(db.scheduledBlocks.map(b => b.id), ['x1', 'y1']);
  assert.equal((await call('DELETE', '/a/subtasks/none')).status, 404);

  assert.equal((await call('DELETE', '/a')).status, 200);
  assert.deepEqual(db.tasks.map(task => task.id), ['b']);
  assert.deepEqual(db.scheduledBlocks.map(b => b.id), ['y1']);
  assert.deepEqual(db.history, [{ id: 'keep' }]);
  assert.equal((await call('DELETE', '/a')).status, 404);
});
