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
  assert.deepEqual(findFreeSlots('2026-10-30', fixed, existing, settings), []); // 고정 일정·기존 작업 앞뒤 휴식(10분)을 비우면 남는 10:40~10:50 틈은 최소 작업 단위보다 짧아 사라진다
  assert.deepEqual(findFreeSlots('2026-10-30', [], [], { ...settings, dayStart: '23:00', dayEnd: '24:00' }), [{ start: '23:00', end: '24:00' }]);
});
