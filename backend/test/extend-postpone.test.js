import test from 'node:test';
import assert from 'node:assert/strict';
import { extendBlock, postponeToFreeSlot } from '../src/services/postpone.js';

const settings = { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10 };
function fixture() {
  return { user: { settings },
    fixedBlocks: [{ id: 'job', kind: 'job', title: '알바', date: '2026-10-31', start: '18:00', end: '21:00' }],
    tasks: [{ id: 'task', title: '과제', type: 'coding', deadline: '2026-11-04T23:59:00+09:00', importance: 2, estimatedMinutes: 180, progress: 0, status: 'todo', subtasks: [] }],
    scheduledBlocks: [
      { id: 'now', taskId: 'task', date: '2026-10-31', start: '14:00', end: '15:00', status: 'planned' },
      { id: 'next', taskId: 'task', date: '2026-10-31', start: '15:10', end: '16:10', status: 'planned' },
      { id: 'late', taskId: 'task', date: '2026-10-31', start: '16:30', end: '17:30', status: 'planned' }] };
}

test('시간 더: 지금 작업을 늘리고 뒤 작업을 밀며, 고정 일정과 겹치는 블록은 뺀다', () => {
  const db = fixture();
  const result = extendBlock(db, { blockId: 'now', minutes: 30 }, { now: new Date('2026-10-31T15:05:00+09:00') });
  // 이미 예정 종료(15:00)가 지났으니 지금(15:05)부터 30분: 15:35까지, 뒤 블록은 35분씩 민다
  assert.equal(result.block.end, '15:35');
  const next = db.scheduledBlocks.find(block => block.id === 'next');
  assert.deepEqual([next.start, next.end], ['15:45', '16:45']);
  // 16:30–17:30 → 17:05–18:05는 알바(18:00, 앞 휴식 10분)와 겹쳐 빠진다
  assert.deepEqual(result.dropped, ['late']);
  assert.equal(db.scheduledBlocks.some(block => block.id === 'late'), false);
});

test('시간 더: 시작 전 블록·잘못된 분량은 거부한다', () => {
  assert.throws(() => extendBlock(fixture(), { blockId: 'late', minutes: 30 }, { now: new Date('2026-10-31T15:05:00+09:00') }), /시작하지 않은/);
  assert.throws(() => extendBlock(fixture(), { blockId: 'now', minutes: 0 }, { now: new Date('2026-10-31T15:05:00+09:00') }), /minutes/);
});

test('미루기: 오늘 남은 시간의 첫 빈 자리, 또는 내일로 옮긴다', () => {
  const db = fixture();
  const today = postponeToFreeSlot(db, { blockIds: ['now'], when: 'today' }, { now: new Date('2026-10-31T15:05:00+09:00') });
  // 다른 블록과 앞뒤 휴식 10분을 두고, 알바 전에는 자리가 없어 알바 뒤 21:10에 놓인다
  assert.deepEqual([today.date, today.start], ['2026-10-31', '21:10']);
  const db2 = fixture();
  const tomorrow = postponeToFreeSlot(db2, { blockIds: ['now'], when: 'tomorrow' }, { now: new Date('2026-10-31T15:05:00+09:00') });
  assert.deepEqual([tomorrow.date, tomorrow.start], ['2026-11-01', '07:00']);
});
