import test from 'node:test';
import assert from 'node:assert/strict';
import { reportProgress, registerTask } from '../src/services/task-service.js';
import { reschedule } from '../src/scheduler/rescheduler.js';

const settings = { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10 };
function fixture() {
  return { user: { settings }, fixedBlocks: [], history: [],
    tasks: [{ id: 'task', title: '과제', type: 'coding', deadline: '2026-11-04T23:59:00+09:00', importance: 2, baseEstimatedMinutes: 120, estimatedMinutes: 120,
      actualMinutes: 0, progress: 0, status: 'todo', subtasks: [
        { id: 's1', title: '설계', estimatedMinutes: 60, done: false },
        { id: 's2', title: '구현', estimatedMinutes: 60, done: false }] }],
    scheduledBlocks: [
      { id: 'b1', taskId: 'task', subtaskId: 's1', date: '2026-10-31', start: '14:00', end: '15:00', status: 'planned' },
      { id: 'b2', taskId: 'task', subtaskId: 's2', date: '2026-10-31', start: '16:00', end: '17:00', status: 'planned' }] };
}
const noPlanner = () => assert.fail('재배치를 미뤄야 합니다.');

test('시작 전 블록도 미리 완료할 수 있고 reschedule:false면 재배치하지 않는다', async () => {
  const db = fixture();
  const result = await reportProgress(db, 'task', { blockId: 'b2', blockStatus: 'done', subtaskId: 's2', subtaskDone: true, reschedule: false },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner });
  assert.equal(result.deferred, true);
  assert.equal(result.rescheduled, false);
  const block = db.scheduledBlocks.find(block => block.id === 'b2');
  assert.equal(block.status, 'done');
  assert.equal(block.completedAt, '2026-10-31T13:00:00.000+09:00');
  assert.equal(db.tasks[0].subtasks[1].done, true);
});

test('시작 전 블록을 미수행으로 보고할 수는 없다', async () => {
  await assert.rejects(reportProgress(fixture(), 'task', { blockId: 'b2', blockStatus: 'missed' },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner }), /미수행/);
  await assert.rejects(reportProgress(fixture(), 'task', { blockId: 'b2', blockStatus: 'done', reschedule: 'later' },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner }), /boolean/);
});

test('재배치는 미리 완료한 블록의 남은 시간을 비운다', async () => {
  const db = fixture();
  await reportProgress(db, 'task', { blockId: 'b2', blockStatus: 'done', subtaskId: 's2', subtaskDone: true, reschedule: false },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner });
  await reportProgress(db, 'task', { blockId: 'b1', blockStatus: 'done', reschedule: false },
    { now: new Date('2026-10-31T14:20:30+09:00'), planner: noPlanner });
  const result = reschedule(db, { now: new Date('2026-10-31T14:21:00+09:00'), reason: 'progress' });
  // 시작 전에 끝낸 b2는 완료 기록으로 남기되 시간을 차지하지 않고, 진행 중에 끝낸 b1은 완료 시각까지로 줄인다
  const released = result.scheduledBlocks.find(block => block.id === 'b2');
  assert.deepEqual([released.status, released.released], ['done', true]);
  assert.equal(result.planningContext.protectedBlocks.some(block => block.id === 'b2'), false);
  assert.equal(result.planningContext.replaceableBlockIds.includes('b2'), false);
  const trimmed = result.scheduledBlocks.find(block => block.id === 'b1');
  assert.deepEqual([trimmed.start, trimmed.end, trimmed.plannedEnd, trimmed.status], ['14:00', '14:21', '15:00', 'done']);
  const slots = result.planningContext.days[0].slots;
  assert.ok(slots.some(slot => slot.start <= '15:00' && slot.end >= '17:00'), JSON.stringify(slots));
  // 다시 돌려도 같은 결과다
  const again = reschedule({ ...db, scheduledBlocks: result.scheduledBlocks }, { now: new Date('2026-10-31T14:22:00+09:00'), reason: 'progress' });
  assert.deepEqual(again.scheduledBlocks, result.scheduledBlocks);
});

test('작업 등록도 reschedule:false면 저장만 하고 재배치를 미룬다', async () => {
  const db = fixture();
  const result = await registerTask(db, { id: 'new', title: '보고서', type: 'report', deadline: '2026-11-05T23:59:00+09:00', baseEstimatedMinutes: 60, reschedule: false },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner });
  assert.equal(result.deferred, true);
  assert.equal(db.tasks.some(task => task.id === 'new'), true);
  assert.equal(db.scheduledBlocks.length, 2);
  await assert.rejects(registerTask(fixture(), { id: 'x', title: 'x', type: 'report', deadline: '2026-11-05T23:59:00+09:00', baseEstimatedMinutes: 60, reschedule: 1 },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner }), /boolean/);
});

test('작업 상세의 완료(progress:1)는 하위 작업을 모두 완료로 바꾼다', async () => {
  const db = fixture();
  await reportProgress(db, 'task', { progress: 1, blockId: 'b1', blockStatus: 'done', reschedule: false },
    { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner });
  assert.equal(db.tasks[0].status, 'done');
  assert.deepEqual(db.tasks[0].subtasks.map(subtask => subtask.done), [true, true]);
});

test('작업을 완료하면 오늘 남은 블록은 완료 기록으로 남고 시간은 재배치 때 비운다', async () => {
  const db = fixture();
  db.scheduledBlocks.push({ id: 'b3', taskId: 'task', subtaskId: 's2', date: '2026-11-01', start: '10:00', end: '11:00', status: 'planned' });
  await reportProgress(db, 'task', { progress: 1, reschedule: false }, { now: new Date('2026-10-31T13:00:00+09:00'), planner: noPlanner });
  assert.deepEqual(db.scheduledBlocks.map(block => [block.id, block.status]), [['b1', 'done'], ['b2', 'done'], ['b3', 'planned']]);
  const result = reschedule(db, { now: new Date('2026-10-31T13:01:00+09:00'), reason: 'progress' });
  assert.deepEqual(result.scheduledBlocks.map(block => [block.id, block.released ?? false]), [['b1', true], ['b2', true]]);
});
