import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule, detectMissedBlocks } from '../src/scheduler/rescheduler.js';
import { createExamReviewTasks } from '../src/scheduler/reviews.js';
const settings = { dayStart:'09:00', dayEnd:'18:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 };
const task = (extra={}) => ({ id:'a', title:'task', type:'coding', estimatedMinutes:180, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00', createdAt:'2026-10-20T09:00:00+09:00', ...extra });
const sub = (id, estimatedMinutes, done=false) => ({id,title:id,estimatedMinutes,done});
const block = (extra={}) => ({id:'old',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
const opts = (extra={}) => ({from:'2026-10-30',to:'2026-11-01',settings,...extra});
const db = (tasks,scheduledBlocks=[],update={}) => ({user:{settings:{...settings,...update}},tasks,fixedBlocks:[],scheduledBlocks});

test('시험 복습은 지정 날짜, 결정적 ID, 원본 불변',()=>{
 const exam=task({type:'exam',deadline:'2026-11-06T12:00:00+09:00'});
 const snapshot=structuredClone(exam);
 const reviews=createExamReviewTasks(exam);
 assert.deepEqual(reviews.map(t=>t.notBefore.slice(0,10)),['2026-10-30','2026-11-03','2026-11-05']);
 const result=allocate(reviews,[],opts({to:'2026-11-06'}));
 assert.deepEqual(result.blocks.map(b=>b.date),['2026-10-30','2026-11-03','2026-11-05']);
 assert.equal(total(result.blocks),90);
 assert.deepEqual(exam,snapshot);
 assert.deepEqual(createExamReviewTasks(exam),reviews);
 assert.throws(()=>createExamReviewTasks(task()),RangeError);
 assert.throws(()=>createExamReviewTasks(exam,{daysBefore:[0]}),RangeError);
});
test('놓친 복습 날짜는 unplaced, 임의로 날짜를 변경하지 않음',()=>{
 const reviews=createExamReviewTasks(task({type:'exam',deadline:'2026-11-06T12:00:00+09:00'}));
 const result=reschedule(db(reviews),{now:new Date('2026-11-01T10:00:00+09:00'),reason:'manual'});
 assert.deepEqual(result.unplaced,[{taskId:reviews[0].id,remainingMinutes:30}]);
 assert.equal(result.scheduledBlocks.length,2);
});
