import test from 'node:test';
import assert from 'node:assert/strict';
import { reschedule, detectMissedBlocks } from '../src/scheduler/rescheduler.js';

const task = (extra = {}) => ({ id: 'a', estimatedMinutes: 120, progress: 0, status: 'todo', deadline: '2026-10-31T18:00:00+09:00', ...extra });
const block = (id, start, end, extra = {}) => ({ id, taskId: 'a', date: '2026-10-30', start, end, status: 'planned', ...extra });
const database = (blocks = [], tasks = [task()]) => ({ user: { settings: { dayStart: '09:00', dayEnd: '18:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10 } }, fixedBlocks: [], tasks, scheduledBlocks: blocks });
const options = (time = '2026-10-30T10:00:00+09:00', reason = 'manual') => ({ now: new Date(time), reason });

test('종료 경계에서 미완료 planned만 감지하고 원본은 보존', () => {
  const blocks = [block('past', '09:00', '10:00'), block('active', '09:30', '10:30'), block('done', '09:00', '10:00', { status: 'done' }), block('missed', '09:00', '10:00', { status: 'missed' }), block('orphan', '09:00', '10:00', { taskId: 'missing' })];
  assert.deepEqual(detectMissedBlocks(blocks, [task({ progress: 0.5 })], options().now, { graceMinutes: 0 }).map(b => b.id), ['past']);
  assert.equal(blocks[0].status, 'planned');
  assert.deepEqual(detectMissedBlocks(blocks, [task({ progress: 1 })], options().now, { graceMinutes: 0 }), []);
  assert.deepEqual(detectMissedBlocks(blocks, [task({ status: 'done' })], options().now, { graceMinutes: 0 }), []);
});

test('예정 종료 뒤 30분 유예 동안은 아직 하는 중으로 보고 missed로 바꾸지 않는다', () => {
  const b = block('over', '09:00', '10:00');
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-30T10:29:59+09:00')).length, 0);
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-30T10:30:00+09:00')).length, 1);
});

test('24:00 종료는 다음 날 자정에 missed 감지', () => {
  const b = block('midnight', '23:00', '24:00');
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-30T23:59:59+09:00'), { graceMinutes: 0 }).length, 0);
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-31T00:00:00+09:00'), { graceMinutes: 0 }).length, 1);
});
