import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analysisPeriod, kstDate } from './analytics.js';
const period = analysisPeriod('2026-10-30');
const now = new Date('2026-10-30T12:00:00+09:00');
function db() { return { tasks: [{ id: 't1', type: 'report', title: 'Report', deadline: '2026-10-29T23:59:00+09:00', status: 'todo' }], scheduledBlocks: [], history: [], user: { settings: { dayStart: '09:00' } } }; }
test('KST Monday boundary includes UTC Sunday afternoon in following week', () => {
  assert.equal(kstDate('2026-10-25T15:00:00Z'), '2026-10-26');
  assert.equal(kstDate('2026-11-01T14:59:59Z'), '2026-11-01');
  assert.equal(kstDate('2026-11-01T15:00:00Z'), '2026-11-02');
  assert.deepEqual(analysisPeriod('2026-11-01'), { from: '2026-10-26', to: '2026-11-01', end: '2026-11-02' });
  assert.equal(analysisPeriod(undefined, 'week', new Date('2026-10-25T15:00:00Z')).from, '2026-10-26');
});
test('invalid dates and timezone-less completion timestamps are rejected', () => {
  for (const value of ['2026-02-30', 'bad', ['2026-10-30']]) assert.throws(() => analysisPeriod(value), { status: 400 });
  assert.equal(kstDate('2026-10-30T12:00:00'), null);
});
test('completion deduplication and exclusion of subtasks and outside dates', () => {
  const data = db(); data.history = [
    { id: 'h1', taskId: 't1', completedAt: '2026-10-26T10:00:00+09:00' },
    { id: 'h2', taskId: 't1', completedAt: '2026-10-27T10:00:00+09:00' },
    { id: 'h3', taskId: 't1', subtaskId: 's1', completedAt: '2026-10-27T10:00:00+09:00' },
    { id: 'legacy', taskTitle: 'Old', completedAt: '2026-10-28T10:00:00+09:00' },
    { id: 'legacy', taskTitle: 'Old', completedAt: '2026-10-28T10:00:00+09:00' },
    { id: 'outside', completedAt: '2026-11-01T15:00:00Z' },
  ];
  const result = analyze(data, period, now);
  assert.equal(result.completedTasks, 2); assert.equal(result.daily.reduce((s, d) => s + d.completedTasks, 0), 2);
});
test('planned minutes, block deduplication, missed blocks and tasks stay distinct', () => {
  const data = db(); const block = { id: 'b1', taskId: 't1', date: '2026-10-26', start: '09:00', end: '10:30', status: 'missed' };
  data.scheduledBlocks = [block, { ...block }, { ...block, id: 'b2', date: '2026-10-27', start: '23:00', end: '24:00' }];
  const snapshot = structuredClone(data), result = analyze(data, period, now);
  assert.equal(result.scheduledMinutes, 150); assert.equal(result.categoryMinutes.report, 150);
  assert.equal(result.missedBlocks, 2); assert.equal(result.missedTasks, 1); assert.equal(result.completedTasks, 0);
  assert.equal(result.overdueTasks, 1); assert.equal(result.dueTasks.total, 1);
  assert.deepEqual(data, snapshot);
});
test('rescheduled current blocks replace removed plan without mutating history', () => {
  const data = db(); data.scheduledBlocks = [{ id: 'b1', taskId: 't1', date: '2026-10-28', start: '10:00', end: '11:00', status: 'planned' }];
  assert.equal(analyze(data, period, now).scheduledMinutes, 60);
  data.scheduledBlocks = [];
  assert.equal(analyze(data, period, now).scheduledMinutes, 0);
});
test('no reported actual time produces null speed metrics', () => {
  const data = db(); data.history = [0, null, undefined].map((actualMinutes, i) => ({ id: String(i), type: 'report', actualMinutes, estimatedMinutes: 60, completedAt: '2026-10-28T12:00:00+09:00' }));
  const result = analyze(data, period, now);
  assert.equal(result.patterns.find(p => p.type === 'report').validActualRecords, 0);
  assert.equal(result.capabilities.correction, true);
  const pattern = result.patterns.find(p => p.type === 'report');
  assert.equal(pattern.correctionFactor, null); assert.equal(pattern.differencePercent, null);
  assert.equal(pattern.estimatedMinutes, 0); assert.equal(pattern.actualMinutes, 0);
  assert.equal(result.capabilities.settingsWrite, true);
});
test('empty data and month rollover are valid', () => {
  const result = analyze({}, analysisPeriod('2026-12-10', 'month'), now);
  assert.equal(result.end, '2027-01-01'); assert.equal(result.daily.length, 31);
  assert.equal(result.scheduledMinutes, 0); assert.equal(result.completedTasks, 0);
});
test('unlinked and invalid-time blocks do not create fake minutes', () => {
  const data = db(); data.scheduledBlocks = [{ id: 'x', taskId: 'missing', date: '2026-10-26', start: '10:00', end: '11:00', status: 'done' }, { id: 'bad', date: '2026-10-26', start: '12:00', end: '11:00' }];
  const result = analyze(data, period, now); assert.equal(result.categoryMinutes.etc, 60); assert.equal(result.completedTasks, 0);
});


test('speed compares weighted totals using the existing correction function', () => {
  const data = db(); data.history = [
    {id:'a',taskId:'a',type:'reading',estimatedMinutes:60,actualMinutes:70,completedAt:'2026-10-29T21:10:00+09:00'},
    {id:'b',taskId:'b',type:'reading',estimatedMinutes:30,actualMinutes:35,completedAt:'2026-10-30T16:35:00+09:00'},
    {id:'c',type:'coding',estimatedMinutes:10,actualMinutes:20,completedAt:'2026-10-30T12:00:00+09:00'},
    {id:'d',type:'coding',estimatedMinutes:90,actualMinutes:90,completedAt:'2026-10-30T12:00:00+09:00'},
    {id:'e',type:'report',estimatedMinutes:100,actualMinutes:75,completedAt:'2026-10-30T12:00:00+09:00'},
    {id:'f',type:'exam',estimatedMinutes:60,actualMinutes:60,completedAt:'2026-10-30T12:00:00+09:00'},
  ];
  const snapshot=structuredClone(data),result=analyze(data,period,now);
  const reading=result.patterns.find(p=>p.type==='reading');
  assert.equal(reading.validActualRecords,2);assert.equal(reading.estimatedMinutes,90);assert.equal(reading.actualMinutes,105);
  assert.equal(reading.correctionFactor,105/90);assert.equal(reading.differencePercent,17);
  assert.equal(result.patterns.find(p=>p.type==='coding').differencePercent,10);
  assert.equal(result.patterns.find(p=>p.type==='report').differencePercent,-25);
  assert.equal(result.patterns.find(p=>p.type==='exam').differencePercent,0);
  assert.deepEqual(data,snapshot);
});

test('speed uses latest whole-task records within period and excludes invalid times', () => {
  const stamp='2026-10-29T12:00:00+09:00';
  const data=db();data.history=[
    {id:'old',taskId:'t1',type:'report',estimatedMinutes:60,actualMinutes:120,completedAt:stamp},
    {id:'latest',taskId:'t1',type:'report',estimatedMinutes:60,actualMinutes:30,completedAt:'2026-10-30T12:00:00+09:00'},
    {id:'sub',taskId:'t1',subtaskId:'s1',type:'report',estimatedMinutes:60,actualMinutes:500,completedAt:stamp},
    {id:'outside',type:'report',estimatedMinutes:60,actualMinutes:500,completedAt:'2026-10-25T12:00:00+09:00'},
    ...[0,-1,1.5,'60',null].map((actualMinutes,i)=>({id:'bad'+i,type:'report',estimatedMinutes:60,actualMinutes,completedAt:stamp})),
    {id:'invalid-estimate',type:'report',estimatedMinutes:0,actualMinutes:20,completedAt:stamp},
    {id:'unknown',type:'unknown',estimatedMinutes:60,actualMinutes:20,completedAt:stamp},
  ];
  const report=analyze(data,period,now).patterns.find(p=>p.type==='report');
  assert.equal(report.validActualRecords,1);assert.equal(report.actualMinutes,30);assert.equal(report.estimatedMinutes,60);assert.equal(report.differencePercent,-50);
  const empty=analyze(data,analysisPeriod('2026-12-10'),now).patterns.find(p=>p.type==='report');
  assert.equal(empty.correctionFactor,null);assert.equal(empty.differencePercent,null);
});
