import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule } from '../src/scheduler/rescheduler.js';

const settings = { dayStart: '09:00', dayEnd: '12:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10 };
const options = { from: '2026-10-30', to: '2026-10-30', settings };
const task = (id, extra = {}) => ({ id, estimatedMinutes: 30, progress: 0, status: 'todo', deadline: '2026-10-30T12:00:00+09:00', ...extra });
const order = tasks => allocate(tasks, [], options).blocks.map(b => b.taskId);

test('같은 마감은 중요도 우선, 생략은 보통', () => {
  assert.deepEqual(order([task('low', { importance: 1 }), task('normal'), task('high', { importance: 3 })]), ['high', 'normal', 'low']);
});

test('중요도보다 정확한 마감 시각 우선', () => {
  assert.deepEqual(order([task('high', { importance: 3 }), task('urgent', { importance: 1, deadline: '2026-10-30T10:00:00+09:00' })]), ['urgent', 'high']);
});

test('중요도가 같으면 작업량, 모든 조건이 같으면 입력 순서', () => {
  assert.deepEqual(order([task('first'), task('second', { importance: 2 }), task('large', { estimatedMinutes: 60 })]), ['large', 'first', 'second']);
});

test('빈 시간이 부족하면 낮은 중요도의 작업을 unplaced로 반환', () => {
  const tasks = [task('low', { importance: 1 }), task('high', { importance: 3 })];
  const before = structuredClone(tasks);
  const result = allocate(tasks, [], { ...options, settings: { ...settings, dayEnd: '09:30' } });
  assert.deepEqual(result.blocks.map(b => b.taskId), ['high']);
  assert.deepEqual(result.unplaced, [{ taskId: 'low', remainingMinutes: 30 }]);
  assert.deepEqual(tasks, before);
});

test('잘못된 중요도는 명시적으로 거부', () => {
  for (const importance of [null, 0, 4, 1.5, '3', NaN, true]) {
    assert.throws(() => allocate([task('invalid', { importance })], [], options), RangeError);
  }
});

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
