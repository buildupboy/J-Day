import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, findFreeSlots } from '../src/scheduler/allocator.js';

const settings = { dayStart: '09:00', dayEnd: '12:00', minSlotMinutes: 30, maxBlockMinutes: 60, breakMinutes: 10 };
const task = (id, minutes = 60, extra = {}) => ({ id, estimatedMinutes: minutes, progress: 0, status: 'todo', deadline: '2026-10-30T12:00:00+09:00', ...extra });
const options = (extra = {}) => ({ from: '2026-10-30', to: '2026-10-30', settings, ...extra });
const times = blocks => blocks.map(({ start, end }) => [start, end]);

test('요일, 중첩, 인접, 하루 경계 및 짧은 구간 처리', () => {
  const fixed = [
    { dayOfWeek: [5], start: '08:00', end: '09:30' },
    { dayOfWeek: [5], start: '09:15', end: '10:00' },
    { dayOfWeek: [5], start: '10:00', end: '10:30' },
    { dayOfWeek: [4], start: '10:30', end: '12:00' },
  ];
  const existing = [{ date: '2026-10-30', start: '11:00', end: '11:45' }, { date: '2026-10-31', start: '10:30', end: '11:00' }];
  assert.deepEqual(findFreeSlots('2026-10-30', fixed, existing, settings), [{ start: '10:30', end: '11:00' }]);
  assert.deepEqual(findFreeSlots('2026-10-30', [], [], { ...settings, dayStart: '23:00', dayEnd: '24:00' }), [{ start: '23:00', end: '24:00' }]);
});

test('최대 길이, 휴식, 잔여 시간 및 입력 불변성', () => {
  const tasks = [task('a', 200)];
  const before = structuredClone(tasks);
  const result = allocate(tasks, [], options());
  assert.deepEqual(times(result.blocks), [['09:00', '10:00'], ['10:10', '11:10'], ['11:20', '12:00']]);
  assert.deepEqual(result.unplaced, [{ taskId: 'a', remainingMinutes: 40 }]);
  assert.deepEqual(tasks, before);
  assert.deepEqual(allocate(tasks, [], options()), result);
});

test('마감 우선, 동률이면 짧은 작업 우선, 작업 간 휴식', () => {
  const result = allocate([task('small', 30), task('big', 60), task('urgent', 30, { deadline: '2026-10-30T10:00:00+09:00' })], [], options());
  assert.deepEqual(result.blocks.map(b => b.taskId), ['urgent', 'small', 'big']);
  assert.deepEqual(times(result.blocks), [['09:00', '09:30'], ['09:40', '10:10'], ['10:20', '11:20']]);
});

test('진행률 및 기존 planned 차감, done 작업 제외, 재실행 중복 방지', () => {
  const tasks = [task('a', 120, { progress: 0.5 }), task('done', 90, { status: 'done' })];
  const first = allocate(tasks, [], options());
  assert.equal(first.blocks.length, 1);
  assert.deepEqual(allocate(tasks, [], options({ existingBlocks: first.blocks })), { blocks: [], unplaced: [] });
  const existing = [{ id: 'old', taskId: 'a', date: '2026-10-30', start: '09:00', end: '09:30', status: 'done' }];
  const saved = structuredClone(existing);
  assert.deepEqual(times(allocate(tasks, [], options({ existingBlocks: existing })).blocks), [['09:40', '10:40']]);
  assert.deepEqual(existing, saved);
});

test('KST 마감, 초 단위 내림 및 지난 마감', () => {
  assert.deepEqual(times(allocate([task('a', 90, { deadline: '2026-10-30T00:45:59Z' })], [], options()).blocks), [['09:00', '09:45']]);
  assert.deepEqual(allocate([task('a', 60, { deadline: '2026-10-29T23:59:00+09:00' })], [], options()), { blocks: [], unplaced: [{ taskId: 'a', remainingMinutes: 60 }] });
});

test('날짜 순회, 고정 일정 회피, 24:00 및 완료용 짧은 블록', () => {
  const result = allocate([task('a', 75, { deadline: '2026-11-01T00:00:00+09:00' })], [], options({ to: '2026-10-31', settings: { ...settings, dayStart: '23:00', dayEnd: '24:00', breakMinutes: 0 } }));
  assert.deepEqual(times(result.blocks), [['23:00', '24:00'], ['23:00', '23:15']]);
  assert.equal(result.blocks[1].date, '2026-10-31');
  const fixed = [{ dayOfWeek: [5], start: '09:00', end: '12:00' }];
  assert.equal(allocate([task('a')], fixed, options()).blocks.length, 0);
});

test('휴식은 기존 블록의 앞뒤 모두 적용', () => {
  const existingBlocks = [{ id: 'other', taskId: 'b', date: '2026-10-30', start: '10:00', end: '11:00', status: 'planned' }];
  assert.deepEqual(times(allocate([task('a', 100)], [], options({ existingBlocks })).blocks), [['09:00', '09:50'], ['11:10', '12:00']]);
});

test('잘못된 날짜, 시간, 설정 및 진행률 거부', () => {
  assert.throws(() => allocate([], [], options({ from: '2026-02-30' })), RangeError);
  assert.throws(() => allocate([], [], options({ to: '2026-10-29' })), RangeError);
  for (const update of [{ minSlotMinutes: 0 }, { maxBlockMinutes: 10 }, { breakMinutes: -1 }, { dayEnd: '24:01' }]) {
    assert.throws(() => allocate([], [], options({ settings: { ...settings, ...update } })), RangeError);
  }
  assert.throws(() => allocate([task('a', 60, { progress: 2 })], [], options()), RangeError);
});


test('시간이 부족하면 같은 마감·중요도의 짧은 작업을 먼저 완료', () => {
  const result = allocate([task('long', 60), task('short', 20)], [], options({ settings: { ...settings, dayEnd: '09:30' } }));
  assert.deepEqual(result.blocks.map(b => b.taskId), ['short']);
  assert.deepEqual(times(result.blocks), [['09:00', '09:20']]);
  assert.deepEqual(result.unplaced, [{ taskId: 'long', remainingMinutes: 60 }]);
});

test('원본 추정시간 대신 진행률 반영 후 남은 시간이 짧은 작업 우선', () => {
  const result = allocate([task('base-small', 60), task('almost-done', 120, { progress: 0.75 })], [], options());
  assert.equal(result.blocks[0].taskId, 'almost-done');
  assert.deepEqual(times(result.blocks), [['09:00', '09:30'], ['09:40', '10:40']]);
});
