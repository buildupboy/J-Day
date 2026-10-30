import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonStore } from '../store/index.js';
import { createTasksRouter } from './tasks.js';
import { createScheduleRouter } from './schedule.js';
import { createEventsRouter } from './events.js';
import { createHomeRouter } from './home.js';
import { createBlocksRouter, createProposalsRouter } from './blocks.js';
import { createMeRouter } from './me.js';
import { estimateTask } from '../services/task-extras.js';
import { computeCorrectionFactors } from '../scheduler/estimator.js';

const seedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/seed.json');
let dir, server, base, store, clock;
const at = text => new Date(`2026-11-02T${text}:00+09:00`); // 월요일
const call = async (method, url, body) => {
  const response = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const overlaps = (a, b) => minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'jday-api-'));
  store = createJsonStore({ dbPath: path.join(dir, 'db.json'), seedPath });
  await store.initStore();
  clock = at('07:00');
  const options = { readDb: store.readDb, updateDb: store.updateDb, now: () => clock };
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter(options));
  app.use('/api/schedule', createScheduleRouter(options));
  app.use('/api/events', createEventsRouter(options));
  app.use('/api/blocks', createBlocksRouter(options));
  app.use('/api/proposals', createProposalsRouter(options));
  app.use('/api', createHomeRouter(options));
  app.use('/api', createMeRouter(options));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}/api`;
  assert.equal((await call('POST', '/schedule/reschedule', { reason: 'manual' })).status, 200);
});
after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });

test('홈: today, now, upcoming, briefing', async () => {
  const today = await call('GET', '/today');
  assert.equal(today.body.date, '2026-11-02');
  assert.ok(today.body.todos.length > 0);
  assert.ok(today.body.dueSoon[0].dDay >= 0);
  const now = await call('GET', '/now');
  assert.equal(now.body.alert, null);
  const upcoming = await call('GET', '/upcoming');
  assert.ok(upcoming.body.weeks[0].items.every(item => item.kind === 'task'));
  const briefing = await call('GET', '/briefing/today');
  assert.match(briefing.body.text, /오늘은/);
});

test('명세 경로: GET /schedule?date, /schedule/week?start', async () => {
  assert.equal((await call('GET', '/schedule?date=2026-11-03')).body.date, '2026-11-03');
  assert.equal((await call('GET', '/schedule/week?start=2026-11-02')).body.from, '2026-11-02');
  assert.equal((await call('GET', '/schedule?date=2026-13-40')).status, 400);
});

test('일정(Event): 등록하면 작업 블록이 피해서 재배치된다', async () => {
  const created = await call('POST', '/events', { title: '팀플 모임', date: '2026-11-03', start: '08:00', end: '23:00' });
  assert.equal(created.status, 201);
  const day = (await call('GET', '/schedule?date=2026-11-03')).body.items;
  assert.ok(day.some(item => item.title === '팀플 모임'));
  const event = day.find(item => item.title === '팀플 모임');
  for (const block of day.filter(item => item.source === 'scheduled')) assert.equal(overlaps(block, event), false);
  assert.equal((await call('POST', '/events', { title: 'x', date: '2026-11-03', start: '10:00', end: '09:00' })).status, 400);
  const id = created.body.event.id;
  assert.equal((await call('PATCH', `/events/${id}`, { title: '팀플 회의' })).body.event.title, '팀플 회의');
  assert.equal((await call('GET', '/events?from=2026-11-03&to=2026-11-03')).body.length, 1);
  assert.equal((await call('DELETE', `/events/${id}`)).body.deleted, id);
  assert.equal((await call('DELETE', `/events/${id}`)).status, 404);
});

test('자유 시간: 끝 시간 없는 일정 → 알림 → free-plan → 돌아왔어요', async () => {
  const { body } = await call('POST', '/events', { title: '친구 만남', date: '2026-11-02', start: '07:30', openEnded: true });
  const id = body.event.id;
  clock = at('08:00');
  assert.deepEqual((await call('GET', '/now')).body.alert, { type: 'free_time', eventId: id, title: '친구 만남' });
  assert.equal((await call('POST', `/events/${id}/free-plan`, { action: 'after', time: '20:00' })).body.event.freeUntil, '20:00');
  assert.equal((await call('GET', '/now')).body.alert, null);
  assert.equal((await call('POST', `/events/${id}/free-plan`, { action: 'x' })).status, 400);
  clock = at('11:00');
  const back = await call('POST', `/events/${id}/return`);
  assert.equal(back.body.event.end, '11:00');
  assert.equal((await call('POST', `/events/${id}/return`)).status, 409);
  await call('DELETE', `/events/${id}`);
  clock = at('07:00');
  await call('POST', '/schedule/reschedule', { reason: 'manual' });
});

test('작업: 명세 형식 등록 → 수정 → 완료 → 삭제', async () => {
  const created = await call('POST', '/tasks', { title: '선형대수학 과제 5', deadline: '2026-11-27T23:59', estimateMin: 180,
    priority: 'should', description: '고유값 문제 8개', fileIds: ['f_12'] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.task.importance, 2);
  assert.equal(created.body.task.description, '고유값 문제 8개');
  assert.ok(created.body.blocks.length > 0);
  const id = created.body.task.id;
  const patched = await call('PATCH', `/tasks/${id}`, { priority: 'must', title: '선대 과제 5' });
  assert.equal(patched.body.task?.importance, 3, JSON.stringify(patched.body));
  assert.equal((await call('GET', '/upcoming')).body.weeks.flatMap(week => week.items).find(item => item.id === id).must, true);
  assert.equal((await call('POST', `/tasks/${id}/complete`)).body.task.status, 'done');
  assert.equal((await call('PATCH', `/tasks/${id}`, { title: 'x' })).status, 409);
  assert.equal((await call('DELETE', `/tasks/${id}`)).body.deleted, id);
  assert.equal((await call('DELETE', `/tasks/${id}`)).status, 404);
  assert.equal((await call('POST', '/tasks', { title: 'x', deadline: '2026-11-27', estimateMin: 60, priority: 'urgent' })).status, 400);
});

test('블록: 시작 → 연장 제안 → 수락 → 일찍 끝냄 → 쉬기', async () => {
  const first = (await call('GET', '/schedule?date=2026-11-02')).body.items.find(item => item.source === 'scheduled');
  clock = at(`${String(Math.floor(minutes(first.start) / 60)).padStart(2, '0')}:${String(minutes(first.start) % 60 + 5).padStart(2, '0')}`);
  assert.equal((await call('POST', `/blocks/${first.id}/start`)).status, 200);
  const extend = await call('POST', `/blocks/${first.id}/extend`, { minutes: 15 });
  if (extend.status === 200) {
    const proposal = await call('GET', `/proposals/${extend.body.proposalId}`);
    assert.equal(proposal.body.stale, false);
    assert.equal((await call('POST', `/proposals/${extend.body.proposalId}/accept`)).body.accepted, true);
    assert.equal((await call('POST', `/proposals/${extend.body.proposalId}/accept`)).status, 404);
  } else assert.equal(extend.status, 409);
  assert.equal((await call('POST', `/blocks/${first.id}/extend`, { minutes: 20 })).status, 400);
  const end = await call('POST', `/blocks/${first.id}/end`, {});
  assert.equal(end.status, 200);
  assert.ok(end.body.earlyMin > 0);
  assert.equal((await call('POST', `/blocks/${first.id}/end`, {})).status, 409);
  assert.equal((await call('POST', `/blocks/${first.id}/after-end`, { action: 'rest' })).body.action, 'rest');
  const events = (await call('GET', '/events')).body;
  assert.ok(events.some(event => event.title === '휴식'));
  assert.equal((await call('POST', `/blocks/${first.id}/after-end`, { action: 'x' })).status, 400);
});

test('제안: 거절하면 사라진다', async () => {
  const briefing = await call('GET', '/briefing/today');
  if (briefing.body.proposalId) {
    assert.equal((await call('POST', `/proposals/${briefing.body.proposalId}/reject`)).body.rejected, true);
    assert.equal((await call('GET', `/proposals/${briefing.body.proposalId}`)).status, 404);
  }
});

test('마이: 프로필, 설정, 루틴, 리포트', async () => {
  assert.equal((await call('GET', '/me')).body.name, '김동아');
  const settings = await call('PATCH', '/settings', { breakMinutes: 15, preferredTime: 'night', notifications: { beforeMinutes: 5 } });
  assert.equal(settings.body.settings.breakMinutes, 15);
  assert.deepEqual(settings.body.settings.notifications, { enabled: true, beforeMinutes: 5, freeTime: true });
  assert.equal((await call('PATCH', '/settings', { hack: 1 })).status, 400);
  assert.equal((await call('PATCH', '/settings', { dayStart: '23:00', dayEnd: '08:00' })).status, 400);
  const routine = await call('POST', '/routines', { title: '독서', dayOfWeek: [1, 3], start: '22:00', end: '22:30' });
  assert.equal(routine.status, 201);
  const id = routine.body.item.id;
  assert.equal((await call('PATCH', `/routines/${id}`, { end: '22:45' })).body.item.end, '22:45');
  assert.ok((await call('GET', '/routines')).body.some(item => item.id === id));
  assert.equal((await call('POST', '/routines', { title: '겹침', dayOfWeek: [1], start: '22:10', end: '22:20' })).status, 409);
  assert.equal((await call('DELETE', `/routines/${id}`)).body.deleted, id);
  assert.equal((await call('GET', '/reports/weekly?start=2026-11-02')).status, 200);
});

test('예상 시간: AI가 안 되면 규칙 기반으로 추정하고 개인 보정을 반영한다', async () => {
  const db = await store.readDb();
  const result = await estimateTask(db, { title: '알고리즘 코딩 과제', description: '구현 3문제' }, { breakdown: async () => { throw new Error('offline'); } });
  assert.equal(result.source, 'rule');
  assert.equal(result.type, 'coding');
  assert.ok(result.rangeMin <= result.estimateMin && result.estimateMin <= result.rangeMax);
  const ai = await estimateTask(db, { title: '발표 준비' }, { breakdown: async () => ({ baseEstimatedMinutes: 100, rangeMinutes: [80, 130], assumptions: ['10장 분량'] }) });
  assert.equal(ai.source, 'ai');
  const factor = computeCorrectionFactors(db.history).presentation ?? 1;
  assert.equal(ai.estimateMin, Math.ceil(100 * factor));
  await assert.rejects(() => estimateTask(db, {}), /title/);
});
