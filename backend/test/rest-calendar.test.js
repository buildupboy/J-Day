import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline } from '../src/scheduler/timeline.js';
import { blockedWindows } from '../src/scheduler/blocked-windows.js';

const db = {
  user: { settings: { breakMinutes: 10, restPeriods: [{ start: '12:00', end: '13:00' }, { start: '23:30', end: '01:00' }] } },
  tasks: [], scheduledBlocks: [],
  fixedBlocks: [{ id: 'class', kind: 'class', title: '수업', dayOfWeek: [5], start: '09:00', end: '10:30' }],
};

test('매일 쉬고 싶은 시간은 캘린더에 휴식 항목으로 나오고, 자정을 넘으면 나뉜다', () => {
  const rests = timeline(db, '2026-10-30').items.filter(item => item.kind === 'break');
  assert.deepEqual(rests.map(item => [item.start, item.end]), [['00:00', '01:00'], ['12:00', '13:00'], ['23:30', '24:00']]);
  assert.ok(rests.every(item => item.source === 'rest' && item.title === '휴식'));
  assert.deepEqual(timeline({ ...db, user: { settings: {} } }, '2026-10-30').items.filter(item => item.kind === 'break'), []);
});

test('고정 일정 앞뒤로 작업 사이 휴식만큼 비워 둔다', () => {
  const fixed = blockedWindows('2026-10-30', db.fixedBlocks, db.user.settings).find(window => window.kind === 'fixed_and_travel');
  assert.deepEqual([fixed.start, fixed.end], ['08:50', '10:40']);
  const noBreak = blockedWindows('2026-10-30', db.fixedBlocks, {}).find(window => window.kind === 'fixed_and_travel');
  assert.deepEqual([noBreak.start, noBreak.end], ['09:00', '10:30']);
});
