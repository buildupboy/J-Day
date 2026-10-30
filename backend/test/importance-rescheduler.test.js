import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule } from '../src/scheduler/rescheduler.js';

const settings = { dayStart: '09:00', dayEnd: '12:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10 };
const options = { from: '2026-10-30', to: '2026-10-30', settings };
const task = (id, extra = {}) => ({ id, estimatedMinutes: 30, progress: 0, status: 'todo', deadline: '2026-10-30T12:00:00+09:00', ...extra });
const order = tasks => allocate(tasks, [], options).blocks.map(b => b.taskId);

test('재배치도 중요도 변경을 반영하고 같은 입력으로 재실행하면 안정적', () => {
  const db = { user: { settings }, fixedBlocks: [], tasks: [task('first'), task('second')], scheduledBlocks: [] };
  const opts = { now: new Date('2026-10-30T08:00:00+09:00'), reason: 'manual' };
  const first = reschedule(db, opts);
  const changed = { ...db, tasks: [task('first'), task('second', { importance: 3 })], scheduledBlocks: first.scheduledBlocks };
  const result = reschedule(changed, opts);
  assert.deepEqual(result.scheduledBlocks.map(b => b.taskId), ['second', 'first']);
  assert.ok(result.changes.length > 0);
  const repeated = reschedule({ ...changed, scheduledBlocks: result.scheduledBlocks }, opts);
  assert.deepEqual(repeated.scheduledBlocks, result.scheduledBlocks);
  assert.deepEqual(repeated.changes, []);
});
