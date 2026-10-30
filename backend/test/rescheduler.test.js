import test from 'node:test';
import assert from 'node:assert/strict';
import { reschedule, detectMissedBlocks } from '../src/scheduler/rescheduler.js';

const task = (extra = {}) => ({ id: 'a', estimatedMinutes: 120, progress: 0, status: 'todo', deadline: '2026-10-31T18:00:00+09:00', ...extra });
const block = (id, start, end, extra = {}) => ({ id, taskId: 'a', date: '2026-10-30', start, end, status: 'planned', ...extra });
const database = (blocks = [], tasks = [task()]) => ({ user: { settings: { dayStart: '09:00', dayEnd: '18:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10 } }, fixedBlocks: [], tasks, scheduledBlocks: blocks });
const options = (time = '2026-10-30T10:00:00+09:00', reason = 'manual') => ({ now: new Date(time), reason });

test('종료 경계에서 미완료 planned만 감지하고 원본은 보존', () => {
  const blocks = [block('past', '09:00', '10:00'), block('active', '09:30', '10:30'), block('done', '09:00', '10:00', { status: 'done' }), block('missed', '09:00', '10:00', { status: 'missed' }), block('orphan', '09:00', '10:00', { taskId: 'missing' })];
  assert.deepEqual(detectMissedBlocks(blocks, [task({ progress: 0.5 })], options().now).map(b => b.id), ['past']);
  assert.equal(blocks[0].status, 'planned');
  assert.deepEqual(detectMissedBlocks(blocks, [task({ progress: 1 })], options().now), []);
  assert.deepEqual(detectMissedBlocks(blocks, [task({ status: 'done' })], options().now), []);
});

test('지난 기록 상태 갱신, 완료 기록 유지, 미래 예정 교체 및 변경 내역', () => {
  const db = database([block('past', '09:00', '10:00'), block('future', '15:00', '16:00'), block('done', '11:00', '12:00', { status: 'done' })]);
  const snapshot = structuredClone(db);
  const result = reschedule(db, options());
  assert.equal(result.scheduledBlocks.find(b => b.id === 'past').status, 'missed');
  assert.deepEqual(result.scheduledBlocks.find(b => b.id === 'done'), db.scheduledBlocks[2]);
  assert.ok(!result.scheduledBlocks.some(b => b.id === 'future'));
  assert.ok(result.changes.some(c => c.type === 'removed' && c.before.id === 'future'));
  assert.ok(result.changes.some(c => c.type === 'updated' && c.after.status === 'missed'));
  assert.ok(result.changes.some(c => c.type === 'added'));
  assert.deepEqual(db, snapshot);
});

test('진행 중 블록 예약량 보존 및 후속 휴식 확보', () => {
  const db = database([block('active', '09:30', '10:30')]);
  const result = reschedule(db, options());
  assert.deepEqual(result.scheduledBlocks[0], db.scheduledBlocks[0]);
  assert.equal(result.scheduledBlocks[1].start, '10:40');
  assert.equal(result.scheduledBlocks[1].end, '11:40');
  assert.deepEqual(result.unplaced, []);
});

test('KST 현재 분 올림, 다음 날 원래 dayStart 복원', () => {
  const result = reschedule(database(), options('2026-10-30T08:00:30Z'));
  assert.equal(result.scheduledBlocks[0].start, '17:01');
  assert.equal(result.scheduledBlocks[0].end, '18:00');
  assert.equal(result.scheduledBlocks[1].date, '2026-10-31');
  assert.equal(result.scheduledBlocks[1].start, '09:00');
  assert.deepEqual(result.unplaced, []);
});

test('운영 종료 이후 다음 날 배치, 지난 마감은 unplaced', () => {
  const result = reschedule(database(), options('2026-10-30T23:59:30+09:00'));
  assert.equal(result.scheduledBlocks[0].date, '2026-10-31');
  assert.equal(result.scheduledBlocks[0].start, '09:00');
  const overdue = reschedule(database([], [task({ deadline: '2026-10-29T23:59:00+09:00' })]), options());
  assert.deepEqual(overdue.scheduledBlocks, []);
  assert.deepEqual(overdue.unplaced, [{ taskId: 'a', remainingMinutes: 120 }]);
});

test('같은 시각 재실행은 동일한 블록과 빈 changes 반환', () => {
  const db = database();
  const first = reschedule(db, options());
  const second = reschedule({ ...db, scheduledBlocks: first.scheduledBlocks }, options());
  assert.deepEqual(second.scheduledBlocks, first.scheduledBlocks);
  assert.deepEqual(second.changes, []);
});

test('완료 작업의 미래 예정 제거, 빈 DB 및 잘못된 옵션', () => {
  const result = reschedule(database([block('future', '12:00', '13:00')], [task({ status: 'done', progress: 1 })]), options());
  assert.deepEqual(result.scheduledBlocks, []);
  assert.deepEqual(result.unplaced, []);
  assert.deepEqual(reschedule(database([], []), options()), { scheduledBlocks: [], changes: [], unplaced: [] });
  assert.throws(() => reschedule(database(), options('invalid')), RangeError);
  assert.throws(() => reschedule(database(), { ...options(), reason: 'unknown' }), RangeError);
});

test('24:00 종료는 다음 날 자정에 missed 감지', () => {
  const b = block('midnight', '23:00', '24:00');
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-30T23:59:59+09:00')).length, 0);
  assert.equal(detectMissedBlocks([b], [task()], new Date('2026-10-31T00:00:00+09:00')).length, 1);
});
