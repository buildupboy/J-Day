import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { timeline } from '../src/scheduler/timeline.js';
import { blockedWindows } from '../src/scheduler/blocked-windows.js';
import { createFixedBlocksRouter } from '../src/routes/fixed-blocks.js';

const settings = { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10 };
const fixture = () => ({ user: { settings }, tasks: [], scheduledBlocks: [], history: [],
  fixedBlocks: [{ id: 'class', kind: 'class', title: '수업', dayOfWeek: [5], start: '10:00', end: '13:00' }] });

// AI 대신 호출 여부만 기록하는 배치기. fail이면 AI 실패를 흉내 낸다.
async function setup(t, { fail = false } = {}) {
  let db = fixture();
  const calls = [];
  const planner = async (current, options) => {
    calls.push(options.reason);
    if (fail) throw new Error('AI 응답 지연');
    return { scheduledBlocks: current.scheduledBlocks, unplaced: [], rescheduled: true };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/fixed-blocks', createFixedBlocksRouter({ readDb: async () => db,
    updateDb: async updater => { db = await updater(structuredClone(db)); }, now: () => new Date('2026-10-30T09:00:00+09:00'), planner }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/fixed-blocks${path}`, { method,
      headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  return { request, calls, db: () => db };
}

test('하루 일정은 그날만 캘린더와 빈 시간 계산에 나온다', async t => {
  const { request, calls, db } = await setup(t);
  const created = await request('POST', '', { kind: 'event', title: '치과 예약', date: '2026-11-05', start: '14:00', end: '15:00', memo: '  신분증 챙기기 ' });
  assert.equal(created.body.block.memo, '신분증 챙기기');
  assert.equal(created.status, 201);
  assert.equal(created.body.rescheduled, true);
  assert.deepEqual(created.body.block.dayOfWeek, [4]);
  assert.deepEqual(calls, ['manual']);
  assert.equal(timeline(db(), '2026-11-05').items.find(item => item.title === '치과 예약').memo, '신분증 챙기기');
  assert.ok(!timeline(db(), '2026-11-12').items.some(item => item.title === '치과 예약'));
  assert.ok(blockedWindows('2026-11-05', db().fixedBlocks, settings).some(w => w.title === '치과 예약'));
  assert.ok(!blockedWindows('2026-11-12', db().fixedBlocks, settings).some(w => w.title === '치과 예약'));
});

test('반복 루틴 등록·삭제와 입력 검증', async t => {
  const { request, db } = await setup(t);
  const routine = await request('POST', '', { kind: 'routine', title: '독서', dayOfWeek: [1, 1, 2], start: '07:00', end: '07:30' });
  const fixed = await request('POST', '', { kind: 'fixed', title: '동아리 회의', dayOfWeek: [3], start: '18:00', end: '19:00' });
  assert.equal(fixed.status, 201);
  assert.equal((await request('DELETE', `/${fixed.body.block.id}`)).status, 200);
  assert.equal(routine.status, 201);
  assert.deepEqual(routine.body.block.dayOfWeek, [1, 2]);
  assert.equal((await request('GET', '')).body.length, 2);
  for (const bad of [
    { kind: 'routine', title: '독서', dayOfWeek: [], start: '07:00', end: '07:30' },
    { kind: 'event', title: 'x', date: '2026-02-30', start: '07:00', end: '07:30' },
    { kind: 'event', title: 'x', date: '2026-11-01', start: '23:00', end: '01:00' },
    { kind: 'class', title: 'x', date: '2026-11-02', start: '07:00', end: '07:30' },
    { kind: 'lesson', title: 'x', dayOfWeek: [1], start: '07:00', end: '07:30' },
    { kind: 'event', title: ' ', date: '2026-11-01', start: '07:00', end: '07:30' },
    { kind: 'event', title: 'x', date: '2026-11-01', start: '07:00', end: '07:30', memo: 'x'.repeat(1001) },
  ]) assert.equal((await request('POST', '', bad)).status, 400);
  assert.equal((await request('DELETE', '/class')).status, 409);
  assert.equal((await request('DELETE', '/missing')).status, 404);
  assert.equal((await request('DELETE', `/${routine.body.block.id}`)).status, 200);
  assert.deepEqual(db().fixedBlocks.map(b => b.id), ['class']);
});

test('AI 재배치가 실패해도 일정은 저장한다', async t => {
  const { request, db } = await setup(t, { fail: true });
  const created = await request('POST', '', { kind: 'event', title: '술약속', date: '2026-10-30', start: '22:00', end: '23:59', openEnd: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.rescheduled, false);
  assert.match(created.body.rescheduleError, /AI/);
  assert.equal(created.body.block.openEnd, true);
  assert.equal(created.body.block.memo, undefined);
  assert.ok(db().fixedBlocks.some(b => b.title === '술약속'));
});

test('수업은 요일 반복으로 추가하고 다른 반복 일정과 겹치면 409', async t => {
  const { request, db } = await setup(t);
  const added = await request('POST', '', { kind: 'class', title: '자료구조', dayOfWeek: [1, 3], start: '09:00', end: '10:30', location: '공학관 301' });
  assert.equal(added.status, 201);
  assert.equal(added.body.block.source, 'manual');
  assert.equal(added.body.block.location, '공학관 301');
  assert.ok(timeline(db(), '2026-11-02').items.some(item => item.title === '자료구조'));
  const overlap = await request('POST', '', { kind: 'class', title: '겹침', dayOfWeek: [5], start: '12:00', end: '14:00' });
  assert.equal(overlap.status, 409);
  assert.equal(db().fixedBlocks.filter(b => b.kind === 'class').length, 2);
});
