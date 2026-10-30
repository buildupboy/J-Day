import test from 'node:test';
import assert from 'node:assert/strict';
import { reportProgress } from '../src/services/task-service.js';
const now = new Date('2026-10-31T10:10:00+09:00');
function fixture() {
  return { user: { settings: { dayStart: '07:00', dayEnd: '23:00', minSlotMinutes: 10, maxBlockMinutes: 60, breakMinutes: 10 } }, fixedBlocks: [], history: [],
    tasks: ['a', 'b'].map(id => ({ id, title: id, type: 'etc', estimatedMinutes: 10, baseEstimatedMinutes: 10, progress: 0, status: 'todo', actualMinutes: 0, deadline: '2026-10-31T23:00:00+09:00', subtasks: [] })),
    scheduledBlocks: [{ id: 'first', taskId: 'a', date: '2026-10-31', start: '10:00', end: '10:10', status: 'planned' }, { id: 'next', taskId: 'b', date: '2026-10-31', start: '10:20', end: '10:30', status: 'planned' }] };
}
const input = { blockId: 'first', blockStatus: 'done', progress: 1, actualMinutes: 10, continueBlockId: 'next' };
test('수락 시 10분 휴게만 생략하고 실제 하위작업으로 묶어 즉시 배치를 보존한다', async () => {
  const db = fixture();
  const result = await reportProgress(db, 'a', input, { now });
  assert.equal(db.tasks.length, 1);
  assert.equal(result.task.title, '기타 작업');
  assert.deepEqual(result.task.subtasks.map(unit => [unit.title, unit.estimatedMinutes, unit.done]), [['a', 10, true], ['b', 10, false]]);
  assert.equal(result.task.progress, 0.5);
  assert.equal(result.task.actualMinutes, 10);
  assert.equal(result.continuation.start, '10:10');
  assert.equal(result.continuation.end, '10:20');
  assert.equal(result.continuation.taskId, 'a');
  assert.equal(result.planningContext.protectedBlocks.find(block => block.id === 'next').start, '10:10');
  assert.equal(result.planningContext.rankedTasks.length, 0);
  assert.equal(db.user.settings.breakMinutes, 10);
  assert.equal(db.scheduledBlocks.find(block => block.id === 'first').breakAfterMinutes, 0);
  assert.equal(db.scheduledBlocks.find(block => block.id === 'next').breakAfterMinutes, 10);
  await assert.rejects(reportProgress(db, 'a', input, { now }), /이미 완료/);
});
test('거절 시 기존 휴게와 작업 구조를 유지한다', async () => {
  const db = fixture();
  const { continueBlockId, ...decline } = input;
  await reportProgress(db, 'a', decline, { now });
  assert.equal(db.tasks.length, 2);
  assert.equal(db.scheduledBlocks.find(block => block.id === 'next').start, '10:20');
  assert.equal(db.tasks[0].title, 'a');
});
test('30분 경계와 지정 휴식 충돌을 서버에서도 거부한다', async () => {
  const long = fixture();
  long.scheduledBlocks[0].start = '09:40';
  await assert.rejects(reportProgress(long, 'a', input, { now }), /30분 미만/);
  const rest = fixture();
  rest.user.settings.restPeriods = [{ start: '10:10', end: '10:20' }];
  await assert.rejects(reportProgress(rest, 'a', input, { now }), /지정 휴식/);
});
test('같은 상위작업의 짧은 하위작업도 완료 상태와 다음 단위를 보존한다', async () => {
  const db = fixture();
  db.tasks = [{ ...db.tasks[0], estimatedMinutes: 20, baseEstimatedMinutes: 20, subtasks: [{ id: 's1', title: '하나', estimatedMinutes: 10, done: false }, { id: 's2', title: '둘', estimatedMinutes: 10, done: false }] }];
  db.scheduledBlocks[0].subtaskId = 's1';
  Object.assign(db.scheduledBlocks[1], { taskId: 'a', subtaskId: 's2' });
  const { progress, ...request } = input;
  const result = await reportProgress(db, 'a', { ...request, subtaskId: 's1', subtaskDone: true }, { now });
  assert.equal(result.task.progress, 0.5);
  assert.equal(result.continuation.subtaskId, 's2');
  assert.equal(result.task.subtasks[0].done, true);
});
