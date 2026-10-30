import test from 'node:test';
import assert from 'node:assert/strict';
import { reportProgress } from '../src/services/task-service.js';
import { analyze, analysisPeriod } from '../src/services/analytics.js';
import { createAiPlanner } from '../src/services/ai-planner.js';
import { acceptAiPlan } from '../src/scheduler/ai-plan.js';
import { reschedule } from '../src/scheduler/rescheduler.js';

const now = new Date('2026-10-31T10:10:00+09:00');
function fixture() {
  return { user: { settings: { dayStart: '07:00', dayEnd: '23:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10, maxDailyMinutes: 240 } }, fixedBlocks: [], history: [],
    tasks: ['a', 'b'].map((id, i) => ({ id, title: i ? '코딩' : '독서', type: i ? 'coding' : 'reading', estimatedMinutes: 10, baseEstimatedMinutes: 10, progress: 0, status: 'todo', actualMinutes: 0, deadline: i ? '2026-11-01T18:00:00+09:00' : '2026-10-31T23:00:00+09:00', subtasks: [] })),
    scheduledBlocks: [{ id: 'first', taskId: 'a', date: '2026-10-31', start: '10:00', end: '10:10', status: 'planned' }, { id: 'next', taskId: 'b', date: '2026-10-31', start: '10:20', end: '10:30', status: 'planned' }] };
}
const input = { blockId: 'first', blockStatus: 'done', progress: 1, actualMinutes: 10, continueBlockId: 'next' };

test('기타 묶음의 원래 분류·마감·실제시간과 완료 기록은 각각 보존된다', async () => {
  const db = fixture();
  const before = analyze(db, analysisPeriod('2026-10-31'));
  await reportProgress(db, 'a', input, { now });
  const group = db.tasks[0];
  assert.equal(group.type, 'etc');
  assert.equal(group.subtasks[0].type, 'reading');
  assert.equal(group.subtasks[1].type, 'coding');
  assert.equal(group.subtasks[1].deadline, '2026-11-01T18:00:00+09:00');
  let report = analyze(db, analysisPeriod('2026-10-31'));
  assert.deepEqual(report.categoryMinutes, before.categoryMinutes);
  assert.equal(report.dueTasks.total, 2);
  assert.equal(report.dueTasks.completed, 1);
  assert.equal(db.history[0].type, 'reading');
  const unit = group.subtasks.find(item => item.sourceTaskId === 'b');
  await reportProgress(db, 'a', { blockId: 'next', blockStatus: 'done', subtaskId: unit.id, subtaskDone: true, actualMinutes: 20, reschedule: false }, { now: new Date('2026-10-31T10:20:00+09:00') });
  report = analyze(db, analysisPeriod('2026-10-31'));
  assert.equal(report.completedTasks, 2);
  assert.equal(report.dueTasks.completed, 2);
  assert.deepEqual(db.history.map(item => [item.taskId, item.type, item.actualMinutes]), [['a', 'reading', 10], ['b', 'coding', 10]]);
  assert.equal(report.patterns.find(item => item.type === 'etc').completedTasks, 0);
  assert.deepEqual(report.categoryMinutes, before.categoryMinutes);
});

test('연속으로 승낙해도 최대 연속 작업 시간을 넘기지 않는다', async () => {
  const db = fixture(); db.user.settings.maxBlockMinutes = 25; db.user.settings.minSlotMinutes = 10;
  const third = { ...db.tasks[1], id: 'c', title: '세 번째' };
  db.tasks.push(third);
  db.scheduledBlocks.push({ id: 'third', taskId: 'c', date: '2026-10-31', start: '10:40', end: '10:50', status: 'planned' });
  await reportProgress(db, 'a', input, { now });
  const nextUnit = db.tasks[0].subtasks.find(unit => unit.sourceTaskId === 'b');
  await assert.rejects(reportProgress(db, 'a', { blockId: 'next', blockStatus: 'done', subtaskId: nextUnit.id, subtaskDone: true, actualMinutes: 20, continueBlockId: 'third' }, { now: new Date('2026-10-31T10:20:00+09:00') }), /최대 연속 작업 시간/);
});

test('30분 이상 다음 작업·0분 경과·미완료 작업·휴무일은 연결하지 않는다', async () => {
  const long = fixture(); long.scheduledBlocks[1].end = '10:50';
  await assert.rejects(reportProgress(long, 'a', input, { now }), /30분 미만/);
  await assert.rejects(reportProgress(fixture(), 'a', input, { now: new Date('2026-10-31T10:00:00+09:00') }), /30분 미만/);
  const partial = fixture();
  await assert.rejects(reportProgress(partial, 'a', { ...input, progress: 0.5 }, { now }), /완료한 뒤/);
  const off = fixture(); off.user.settings.unavailableDates = ['2026-10-31'];
  await assert.rejects(reportProgress(off, 'a', input, { now }), /쉬기로 한 날짜/);
});

test('AI가 다시 배치해도 승낙한 바로 다음 블록을 보호하며 임의 AI 호출이 필요 없다', async () => {
  const db = fixture(); let calls = 0;
  const planner = createAiPlanner({ clock: () => now, completeFn: async () => { calls++; throw Error('must not call'); } });
  const result = await reportProgress(db, 'a', input, { now, planner });
  assert.equal(calls, 0);
  assert.equal(result.schedulingStatus, 'applied');
  assert.equal(result.scheduledBlocks.find(block => block.id === 'next').start, '10:10');
  assert.equal(result.task.subtasks.find(unit => !unit.done).sourceTaskId, 'b');
});

test('다른 작업에 휴식 생략 권한이 전파되지 않는다', async () => {
  const db = fixture(); await reportProgress(db, 'a', input, { now });
  db.tasks.push({ ...fixture().tasks[1], id: 'c' });
  const prepared = reschedule(db, { now, reason: 'manual' });
  db.aiScheduling = { status: 'pending', context: prepared.planningContext };
  assert.throws(() => acceptAiPlan(db, { contextId: prepared.planningContext.contextId, blocks: [{ taskId: 'c', date: '2026-10-31', start: '10:20', end: '10:30' }] }, { now }), /휴식 시간/);
});

test('5분 작업을 여러 번 연결해도 이전 연결에 휴식이 다시 붙지 않는다', async () => {
  const db = fixture();
  db.tasks.forEach(task => { task.estimatedMinutes = 5; task.baseEstimatedMinutes = 5; });
  db.tasks.push({ ...db.tasks[1], id: 'c', title: '세 번째' });
  db.scheduledBlocks[0].end = '10:05'; db.scheduledBlocks[1].end = '10:25';
  db.scheduledBlocks.push({ id: 'third', taskId: 'c', date: '2026-10-31', start: '10:40', end: '10:45', status: 'planned' });
  await reportProgress(db, 'a', { ...input, actualMinutes: 5 }, { now: new Date('2026-10-31T10:05:00+09:00') });
  const unit = db.tasks[0].subtasks.find(item => item.sourceTaskId === 'b');
  await reportProgress(db, 'a', { blockId: 'next', blockStatus: 'done', subtaskId: unit.id, subtaskDone: true, actualMinutes: 10, continueBlockId: 'third' }, { now });
  assert.equal(db.tasks.length, 1);
  assert.equal(db.tasks[0].sourceTasks.length, 3);
  assert.equal(db.scheduledBlocks.find(block => block.id === 'third').start, '10:10');
  assert.deepEqual(db.history.map(item => item.actualMinutes), [5, 5]);
});

test('완료한 원래 작업의 마감이 묶음의 남은 작업을 막지 않는다', async () => {
  const db = fixture();
  await reportProgress(db, 'a', input, { now });
  assert.equal(db.tasks[0].deadline, '2026-11-01T18:00:00+09:00');
  assert.equal(db.tasks[0].sourceTasks[0].deadline, '2026-10-31T23:00:00+09:00');
});

test('원래 작업이 여러 하위작업이면 묶기 전후 실제시간도 원래 분류로 누적된다', async () => {
  const db = fixture();
  Object.assign(db.tasks[0], { estimatedMinutes: 20, baseEstimatedMinutes: 20, subtasks: [
    { id: 'a1', title: '독서 첫 부분', estimatedMinutes: 10, done: false },
    { id: 'a2', title: '독서 뒷부분', estimatedMinutes: 10, done: false }
  ] });
  db.scheduledBlocks[0].subtaskId = 'a1';
  db.scheduledBlocks.push({ id: 'last', taskId: 'a', subtaskId: 'a2', date: '2026-10-31', start: '10:40', end: '10:50', status: 'planned' });
  const { progress, ...partial } = input;
  await reportProgress(db, 'a', { ...partial, subtaskId: 'a1', subtaskDone: true }, { now });
  const other = db.tasks[0].subtasks.find(unit => unit.sourceTaskId === 'b');
  await reportProgress(db, 'a', { blockId: 'next', blockStatus: 'done', subtaskId: other.id, subtaskDone: true, actualMinutes: 20, reschedule: false }, { now: new Date('2026-10-31T10:20:00+09:00') });
  await reportProgress(db, 'a', { blockId: 'last', blockStatus: 'done', subtaskId: 'a2', subtaskDone: true, actualMinutes: 30, reschedule: false }, { now: new Date('2026-10-31T10:50:00+09:00') });
  assert.equal(db.history.find(record => record.taskId === 'a').actualMinutes, 20);
  assert.equal(db.history.find(record => record.taskId === 'b').actualMinutes, 10);
  assert.equal(db.tasks[0].sourceTasks[0].subtasks.every(unit => unit.done), true);
});
