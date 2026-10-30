import test from 'node:test';
import assert from 'node:assert/strict';
import { findShortMergeGroups, applyShortMerge, declineShortMerge, mergeQuestion, groupId } from '../src/scheduler/short-merge.js';
import { acceptAiPlan } from '../src/scheduler/ai-plan.js';

const now = new Date('2026-10-30T08:00:00+09:00');
const task = (id, extra = {}) => ({ id, title: id, type: 'etc', deadline: '2026-11-03T23:59:00+09:00', importance: 2, estimatedMinutes: 20, baseEstimatedMinutes: 20, progress: 0, status: 'todo', subtasks: [], ...extra });
const block = (id, taskId, start, end, extra = {}) => ({ id, taskId, date: '2026-10-30', start, end, status: 'planned', ...extra });
const db = () => ({ user: { settings: { breakMinutes: 10 } }, fixedBlocks: [],
  tasks: [task('a', { deadline: '2026-11-04T23:59:00+09:00', importance: 1, estimatedMinutes: 15, subtasks: [{ id: 'a1', title: '초안', estimatedMinutes: 10, done: false }, { id: 'a2', title: '정리', estimatedMinutes: 5, done: false }] }), task('b', { importance: 3 }), task('c'), task('long', { estimatedMinutes: 90 })],
  scheduledBlocks: [block('ba', 'a', '10:00', '10:15'), block('bb', 'b', '10:25', '10:45'), block('bc', 'c', '13:00', '13:20'), block('bl', 'long', '14:00', '15:30')] });

test('쉬는 시간만 두고 이어진 30분 미만 블록은 묶음 후보, 떨어진 블록·긴 블록은 제외', () => {
  const groups = findShortMergeGroups(db(), { now });
  assert.equal(groups.length, 1); assert.deepEqual(groups[0].blockIds, ['ba', 'bb']);
  assert.deepEqual(groups[0].minutes, [15, 20]); assert.match(mergeQuestion(groups[0]), /‘a’ 15분, ‘b’ 20분.*이어서 하시겠어요/);
});

test('이미 진행했거나 여러 블록으로 나뉜 작업, 지난 블록, 거절한 묶음은 후보가 아니다', () => {
  const started = db(); started.tasks[1].progress = 0.5;
  assert.equal(findShortMergeGroups(started, { now }).length, 0);
  const split = db(); split.scheduledBlocks.push(block('bb2', 'b', '16:00', '16:10'));
  assert.equal(findShortMergeGroups(split, { now }).length, 0);
  assert.equal(findShortMergeGroups(db(), { now: new Date('2026-10-30T10:10:00+09:00') }).length, 0);
  const declined = db(); declineShortMerge(declined, groupId(['ba', 'bb']));
  assert.equal(findShortMergeGroups(declined, { now }).length, 0);
});

test('수락하면 기타 작업의 하위작업으로 옮기고 쉬는 시간 없이 이어 붙인다', () => {
  const data = db();
  const { task: parent } = applyShortMerge(data, ['ba', 'bb'], { now });
  assert.equal(parent.title, '기타 작업'); assert.equal(parent.estimatedMinutes, 35); assert.equal(parent.importance, 3);
  assert.equal(parent.deadline, '2026-11-03T23:59:00+09:00'); assert.deepEqual(parent.subtasks.map(item => [item.title, item.estimatedMinutes]), [['a', 15], ['b', 20]]);
  assert.deepEqual(data.tasks.map(item => item.id).sort(), ['c', 'long', parent.id].sort());
  const [first, second] = ['ba', 'bb'].map(id => data.scheduledBlocks.find(item => item.id === id));
  assert.deepEqual([first.start, first.end, second.start, second.end], ['10:00', '10:15', '10:15', '10:35']);
  assert.equal(first.taskId, parent.id); assert.equal(second.subtaskId, parent.subtasks[1].id);
  assert.throws(() => applyShortMerge(data, ['ba', 'bb'], { now }), { status: 409 });
});

test('묶인 작업의 하위작업 블록 사이에는 휴식을 요구하지 않는다', () => {
  const data = db(); const { task: parent } = applyShortMerge(data, ['ba', 'bb'], { now });
  const [s1, s2] = parent.subtasks;
  const context = { contextId: 'ctx', sourceRevision: 'x', window: { from: '2026-10-30', to: '2026-10-31' },
    settings: { dayStart: '07:00', dayEnd: '24:00', maxBlockMinutes: 90, breakMinutes: 10, maxDailyMinutes: 1440, bufferMinutes: 0 },
    protectedBlocks: [], fixedBlocks: [], replaceableBlockIds: [], unavailableDates: [],
    rankedTasks: [{ taskId: parent.id, skipInnerBreak: true, deadline: parent.deadline, remainingMinutes: 35, subtasks: [
      { subtaskId: s1.id, remainingMinutes: 15 }, { subtaskId: s2.id, remainingMinutes: 20 }] }] };
  data.scheduledBlocks = []; data.aiScheduling = { status: 'pending', context };
  // contextId 일치 + 리비전 검사를 통과시키기 위해 직접 계산한 값을 사용한다
  return import('../src/scheduler/planning-context.js').then(({ schedulingRevision }) => {
    context.sourceRevision = schedulingRevision(data);
    const plan = blocks => ({ contextId: 'ctx', blocks });
    const ok = acceptAiPlan(structuredClone(data), plan([
      { taskId: parent.id, subtaskId: s1.id, date: '2026-10-31', start: '10:00', end: '10:15' },
      { taskId: parent.id, subtaskId: s2.id, date: '2026-10-31', start: '10:15', end: '10:35' }]), { now });
    assert.equal(ok.unplaced.length, 0);
    data.tasks.find(item => item.id === parent.id).skipInnerBreak = false; delete context.rankedTasks[0].skipInnerBreak;
    context.sourceRevision = schedulingRevision(data);
    assert.throws(() => acceptAiPlan(structuredClone(data), plan([
      { taskId: parent.id, subtaskId: s1.id, date: '2026-10-31', start: '10:00', end: '10:15' },
      { taskId: parent.id, subtaskId: s2.id, date: '2026-10-31', start: '10:15', end: '10:35' }]), { now }), /휴식/);
  });
});

test('작업 종료 화면에서 이미 이어서 하기로 연결했거나 묶인 작업은 후보에서 제외', () => {
  const linked = db(); linked.scheduledBlocks[1].continuationOf = 'ba';
  assert.equal(findShortMergeGroups(linked, { now }).length, 0);
  const grouped = db(); grouped.tasks[1].sourceTasks = [{ id: 'x', title: 'x' }];
  assert.equal(findShortMergeGroups(grouped, { now }).length, 0);
});
