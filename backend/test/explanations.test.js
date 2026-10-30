import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { explainSchedule } from '../src/scheduler/explanations.js';
const settings = { dayStart:'09:00', dayEnd:'18:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 };
const task = (extra={}) => ({ id:'a', title:'task', type:'coding', estimatedMinutes:180, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00', createdAt:'2026-10-20T09:00:00+09:00', ...extra });
const sub = (id, estimatedMinutes, done=false) => ({id,title:id,estimatedMinutes,done});
const block = (extra={}) => ({id:'old',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
const opts = (extra={}) => ({from:'2026-10-30',to:'2026-11-01',settings,...extra});
const db = (tasks,scheduledBlocks=[],update={}) => ({user:{settings:{...settings,...update}},tasks,fixedBlocks:[],scheduledBlocks});

test('설명에는 하위작업명, 분량, 지난 마감 사유 포함',()=>{
 const tasks=[task({subtasks:[sub('part',180)]}),task({id:'old',deadline:'2026-10-29T12:00:00+09:00'})];
 const result=allocate(tasks,[],opts());
 const snapshot=structuredClone(result);
 const explained=explainSchedule(tasks,result,{settings,now:new Date('2026-10-30T09:00:00+09:00')});
 assert.equal(explained.blocks[0].title,'part');
 assert.equal(explained.blocks[0].estimatedMinutes,90);
 assert.equal(explained.unplaced[0].code,'deadline_passed');
 assert.deepEqual(result,snapshot);
});
