import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule } from '../src/scheduler/rescheduler.js';
const settings = {dayStart:'09:00', dayEnd:'12:00', minSlotMinutes:30, maxBlockMinutes:60, breakMinutes:10};
const task = (id, estimatedMinutes=180, extra={}) => ({id,estimatedMinutes,progress:0,status:'todo',deadline:'2026-11-01T12:00:00+09:00',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
function run(tasks, update={}, existingBlocks=[], fixedBlocks=[]) {
 return allocate(tasks,fixedBlocks,{from:'2026-10-30',to:'2026-11-01',settings:{...settings,...update},existingBlocks});
}
test('재배치에서 완료량 반영, 다음 날 한도 복원, 반복 실행 안정성',()=>{
 const db={user:{settings:{...settings,maxDailyMinutes:90,bufferMinutes:30}},tasks:[task('a',120)],fixedBlocks:[],scheduledBlocks:[{id:'done',taskId:'other',date:'2026-10-30',start:'09:00',end:'10:00',status:'done'}]};
 const original=structuredClone(db);
 const opts={now:new Date('2026-10-30T10:00:00+09:00'),reason:'manual'};
 const result=reschedule(db,opts);
 assert.equal(total(result.scheduledBlocks.filter(b=>b.date==='2026-10-30'&&b.status==='planned')),30);
 assert.equal(total(result.scheduledBlocks.filter(b=>b.date==='2026-10-31')),90);
 const repeat=reschedule({...db,scheduledBlocks:result.scheduledBlocks},opts);
 assert.deepEqual(repeat.scheduledBlocks,result.scheduledBlocks);
 assert.deepEqual(repeat.changes,[]);
 assert.deepEqual(db,original);
});
