import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBreakdown } from '../src/services/estimate-rounding.js';
import { remainingWork } from '../src/scheduler/workload.js';

const raw = () => ({ baseEstimatedMinutes: 133, subtasks: [{ title: 'a', estimatedMinutes: 33 }, { title: 'b', estimatedMinutes: 57 }, { title: 'c', estimatedMinutes: 43 }],
  rangeMinutes: [101, 187], assumptions: [] });

test('AI 추정은 하위작업·합계·범위를 5분 단위로 맞춘다', () => {
  const result = normalizeBreakdown(raw());
  assert.deepEqual(result.subtasks.map(item => item.estimatedMinutes), [35, 55, 45]);
  assert.equal(result.baseEstimatedMinutes, 135); assert.deepEqual(result.rangeMinutes, [100, 190]);
  assert.ok(result.rangeMinutes[0] <= result.baseEstimatedMinutes && result.baseEstimatedMinutes <= result.rangeMinutes[1]);
});

test('사용자가 말한 전체 시간은 유지하고 5분 단위가 아니면 그대로 둔다', () => {
  const kept = normalizeBreakdown({ ...raw(), baseEstimatedMinutes: 130, subtasks: [{ title: 'a', estimatedMinutes: 32 }, { title: 'b', estimatedMinutes: 58 }, { title: 'c', estimatedMinutes: 40 }] }, 130);
  assert.equal(kept.baseEstimatedMinutes, 130); assert.ok(kept.subtasks.every(item => item.estimatedMinutes % 5 === 0));
  assert.equal(kept.subtasks.reduce((sum, item) => sum + item.estimatedMinutes, 0), 130);
  const odd = { baseEstimatedMinutes: 7, subtasks: [{ title: 'a', estimatedMinutes: 7 }], rangeMinutes: [5, 9], assumptions: [] };
  assert.equal(normalizeBreakdown(odd, 7), odd);
});

test('총 작업량이 5분 단위면 하위작업별 남은 시간도 5분 단위', () => {
  const task = { id: 't', estimatedMinutes: 135, progress: 0, status: 'todo', subtasks: [
    { id: 'a', estimatedMinutes: 35, done: false }, { id: 'b', estimatedMinutes: 55, done: false }, { id: 'c', estimatedMinutes: 45, done: false }] };
  const units = remainingWork(task, [], new Date('2026-10-31T09:00:00+09:00'));
  assert.ok(units.every(unit => unit.remaining % 5 === 0)); assert.equal(units.reduce((sum, unit) => sum + unit.remaining, 0), 135);
});
