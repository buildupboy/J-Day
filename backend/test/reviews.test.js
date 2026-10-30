import test from 'node:test';
import assert from 'node:assert/strict';
import { createExamReviewTasks } from '../src/scheduler/reviews.js';
import { reschedule } from '../src/scheduler/rescheduler.js';
test('복습은 별도 Task로만 만들고 시간 배치를 하지 않음',()=>{
 const exam={id:'exam',title:'시험',type:'exam',deadline:'2026-11-06T12:00:00+09:00',createdAt:'2026-10-20T09:00:00+09:00'};
 const tasks=createExamReviewTasks(exam);
 assert.deepEqual(tasks.map(t=>t.notBefore.slice(0,10)),['2026-10-30','2026-11-03','2026-11-05']);
 const result=reschedule({tasks,scheduledBlocks:[],fixedBlocks:[],user:{settings:{dayStart:'09:00',dayEnd:'18:00',minSlotMinutes:30,maxBlockMinutes:90,breakMinutes:10}}},{now:new Date('2026-11-01T09:00:00+09:00'),reason:'manual'});
 assert.deepEqual(result.scheduledBlocks,[]);assert.equal(result.planningContext.rankedTasks.length,3);
});
